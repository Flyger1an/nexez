# Agentic-Commerce Enrollment Checklist (ACP + UCP go-live)

Nexez ships **both** agentic-commerce protocols — OpenAI's ACP and Google's UCP —
fully built over one shared money core. Both are **live but dormant**: the product
**feeds are public** (for discovery/indexing) and the **checkout endpoints fail
closed with 401** until you complete each program's enrollment and set its secret.

This doc is the owner-side checklist to flip them live. Nothing here is a code
change (except the small A4 build in ACP Step 4) — it's account setup, credentials,
and env vars.

---

## What's already live (no action needed)

| Surface | URL | State |
|---|---|---|
| ACP product feed | `https://nexez.app/acp/feed.json` | ✅ public, live |
| ACP checkout sessions | `https://nexez.app/api/acp/checkout_sessions` (+ `/{id}`, `/{id}/complete`, `/{id}/cancel`) | 🔒 401 until `ACP_SHARED_SECRET` set |
| UCP product feed | `https://nexez.app/ucp/feed.json` | ✅ public, live |
| UCP checkout sessions | `https://nexez.app/api/ucp/checkout-sessions` (+ `/{id}`, `/{id}/complete`, `/{id}/cancel`) | 🔒 401 until `UCP_SHARED_SECRET` set |
| Capability manifest | `https://nexez.app/.well-known/nexez.json` → `agentic_commerce` block | ✅ advertises both; `checkout_status: "search_only"` |

Everything up to and including `/complete` is proven against **Stripe test
PaymentMethods** — the only unproven line is the final delegated-token swap, gated on
the Stripe question below.

---

## ⛔ STEP 0 — the one architectural blocker: confirm SPT-with-Connect with Stripe

Nexez's money model is **Stripe Connect with the seller as merchant-of-record**: a
direct charge on the seller's connected account, with the platform commission taken
as `application_fee_amount`. ACP settles by charging a **Shared Payment Token**
(`vt_…`) as the PaymentIntent's `payment_method`. It is **unconfirmed** whether SPT
composes with a Connect direct charge + application fee. Ask your Stripe contact,
verbatim:

> For OpenAI Instant Checkout (Agentic Commerce Protocol), we are Stripe Connect with
> the **seller as merchant-of-record** — a **direct charge on the seller's connected
> account** with our platform commission as `application_fee_amount`.
> 1. Can a **Shared Payment Token (`vt_…`)** be used as `payment_method` on a
>    PaymentIntent that is a **direct charge on a connected account** (`{ stripeAccount }`)
>    **with `application_fee_amount`**? Or does SPT only support first-party charges on
>    the platform account?
> 2. Must the SPT allowance's `merchant_id` equal the **connected account** or the
>    **platform account**?
> 3. Is there a Stripe **capability / enablement** required for SPT + Connect?

**If yes** → no code change: the settlement bridge already accepts the token generically
(`settleSessionToPaymentIntent(session, { token, kind: 'shared_payment_token' }, ctx)`),
so a real `vt_` flows straight through.
**If SPT is platform-account-only** → the per-seller Connect commission model may not
compose for ACP; escalate before enrolling (the shared core is unaffected — only the
ACP charge shape would need a decision).

---

## ACP (OpenAI Instant Checkout) — go-live

1. **Enroll.** Instant Checkout is an OpenAI **approved-partner** program (not
   self-serve). Apply; provide OpenAI the feed URL (`/acp/feed.json`) and the
   checkout base (`/api/acp/checkout_sessions`). OpenAI issues you a **shared Bearer
   key** (OpenAI → merchant) and a **request-signing secret**, and gives you their
   **order-status webhook URL + HMAC secret**.

2. **Set env vars** (Vercel → project → Environment Variables, Production):
   - `ACP_SHARED_SECRET` = the OpenAI-issued Bearer key. *(This alone lifts the 401.)*
   - `ACP_CHECKOUT_ENABLED` = `true`. *(Flips feed items to `is_eligible_checkout` +
     `checkout_status: "live"` in the manifest.)*

3. **Subscribe the Stripe Connect webhook to `payment_intent.succeeded`.** SF3
   persists the durable `checkout_orders` row from `payment_intent.succeeded` on the
   **connected account**. In the Stripe Dashboard, on the **connected-accounts**
   webhook endpoint (the one whose secret is `STRIPE_WEBHOOK_SECRET_CONNECT`), ensure
   `payment_intent.succeeded` is in the subscribed events. (Refunds/disputes already
   match by PaymentIntent id, so those inherit for free.)

4. **Order-status webhook (A4 — already built, dormant).** Set the two env vars from
   Step 1 and it turns on:
   - `ACP_ORDER_WEBHOOK_URL` = OpenAI's order-webhook URL.
   - `ACP_ORDER_WEBHOOK_SECRET` = the signing secret.
   It emits `order_updated` (base64-HMAC-signed) from the Stripe webhook's refund/
   dispute path so ACP order status (refunds, disputes) stays in sync with OpenAI.
   Dormant + best-effort without those vars. *(Confirm OpenAI's exact signature header
   name/encoding at enrollment — the default is a base64 HMAC-SHA256 of the body; a
   1-line change if theirs differs.)*

5. **Confirm SPT** (Step 0). If platform-only, resolve the Connect question first.

6. **Smoke test (real).** With a Stripe **test** PaymentMethod as a stand-in for the
   `vt_` token: `POST /api/acp/checkout_sessions` with the Bearer → 201; `/{id}/complete`
   with the test PM → a real (test-mode) charge on a connected account + a
   `checkout_orders` row + a buyer receipt. Then repeat with a real `vt_` once SPT is
   confirmed. Clean up test data.

---

## UCP (Google Universal Commerce Protocol) — go-live

1. **Enroll.** Create a **Google Merchant Center** account, submit the product feed
   (`/ucp/feed.json`), then join the **UCP waitlist** and get Google's approval. Obtain
   the **M2M access-token** validation details and **Google Pay** credentials.

2. **Set env vars:**
   - `UCP_SHARED_SECRET` = the M2M Bearer Google presents. *(Lifts the 401.)*
   - `UCP_CHECKOUT_ENABLED` = `true`.

3. **AP2 mandate verification (deferred layer).** v1 settles the Google Pay token
   through the same Stripe bridge (`kind: 'google_pay'`); the AP2 mandate JWT
   (ECDSA verifiable-credential) verification needs Google's signing keys — wire it as
   a defense-in-depth check once Google provides the keys/JWKS. (Ping me to add.)

4. **Stripe webhook** — same `payment_intent.succeeded` subscription as ACP Step 3
   (already done if you completed ACP). UCP orders persist with `channel: 'ucp'`.

5. **Smoke test** — same shape as ACP Step 6 against `/api/ucp/checkout-sessions`
   (UCP uses **PUT** for update, and payment arrives at
   `payment.instruments[].credential.token`).

---

## Env-var quick reference

| Var | Where | Effect |
|---|---|---|
| `ACP_SHARED_SECRET` | Vercel prod | Lifts ACP 401 (verifies OpenAI's Bearer) |
| `ACP_CHECKOUT_ENABLED` = `true` | Vercel prod | Feed `is_eligible_checkout` + manifest `checkout_status: live` |
| `ACP_ORDER_WEBHOOK_URL` | Vercel prod | Turns on A4 (merchant→OpenAI order_updated on refund/dispute) |
| `ACP_ORDER_WEBHOOK_SECRET` | Vercel prod | Signs the A4 order webhook (base64 HMAC) |
| `UCP_SHARED_SECRET` | Vercel prod | Lifts UCP 401 (verifies Google's M2M Bearer) |
| `UCP_CHECKOUT_ENABLED` = `true` | Vercel prod | UCP feed/manifest checkout-eligible |
| `STRIPE_WEBHOOK_SECRET_CONNECT` | Vercel prod (**already set**) | Connect webhook — just **add** `payment_intent.succeeded` to its subscribed events |
| `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Vercel prod (**already set**) | Required for settlement + session persistence |

Order of operations: **confirm SPT (Step 0) → enroll → set the shared secret (endpoint
goes live, still search_only in the feed) → subscribe the webhook event → smoke-test
with a test PM → flip `*_CHECKOUT_ENABLED=true` → repeat with the real delegated token.**

---

## How it fails safe

- No secret set → every checkout endpoint returns `401 inbound_auth_not_configured`. No
  unauthenticated charge surface exists.
- `*_CHECKOUT_ENABLED` unset/false → feeds advertise `is_eligible_search` only; the
  manifest reads `checkout_status: "search_only"`.
- A paused seller (expired trial) → `resolveSettlementContext` blocks the charge
  (`409`/`402`) before any money moves.
- Every settlement is idempotent (Stripe key `{acp,ucp}_settle_<session_id>` + a unique
  index on the PaymentIntent) — a replayed `/complete` returns the original order, never
  a second charge.
