# Nexez — Session Handoff

_Last updated: 2026-06-11 (Burst 3a — async negotiation decision + scale rate limits live). **HEAD moves constantly** — Flyger1an / Grok Build / codex push to `main` every few minutes; always `git fetch` first. `git rev-parse --short HEAD` to check._

## ⚡ NEW CONTEXT WINDOW START HERE

**State:** deployed to **nexez.app**, green (**448 tests / lint / tsc / build** in a worktree). The negotiation + escrow money system is GA-live (Bursts 1 & 2) and now runs **unattended at scale** via Burst 3a (async decision + layered rate limits), all **verified live on prod**.

### Burst 3a — async negotiation decision + scale rate limits (LIVE, verified 2026-06-11, `1bf8513` + lease fix `7d63be1`)
The LLM negotiation decision was inline/blocking on `POST /api/negotiations` (~p50 3.8s / p95 5.5s). It's now **asynchronous**: the POST returns immediately (`status: negotiation`, `decisionPending: true`, a `statusUrl`); agents **poll `/api/negotiations/status`** for the outcome (the contract the MCP tool + `agent.json` already document).
- **Service split (`lib/negotiation.service.ts`):** `submitProposal()` (sync) records the buyer turn + marks the row pending; `runDecision()` (async) runs the LLM, clamps to the rules floor, persists the seller turn, bumps `decision_seq`. Called from `after()` (route, `maxDuration=60`) **and** the backstop cron.
- **Exactly-once via a LEASE** (not by clearing the pending flag): `runDecision` claims with `decision_claimed_at` (90s lease); `decision_pending` stays **true** (agents see "responding") until the decision is durably written, then it's cleared + lease released. _Live bug caught & fixed this session: clearing `decision_pending` at claim time created a "limbo" window where `/status` showed not-pending + null decision while the LLM still ran._ Concurrent `after()`/cron → loser gets a fresh lease (0 rows); a crashed worker's lease expires → cron re-drives.
- **Backstop cron `/api/cron/process-negotiations`** (`*/5` in `vercel.json`, `CRON_SECRET`-gated) re-drives stale-pending rows; `captureError` alert on rows stuck > 15 min. **Verified live**: a seeded stale-pending row was healed by the scheduled run.
- **Fallback-on-failure:** an LLM/provider error writes a deterministic `review`/rules decision so a polling agent never hangs.
- **`/status` surfaces the decision** + `decisionPending`/`decisionSeq`, sanitized via new `lib/negotiation-sanitize.ts` (strips owner-private `internalNotes` — also reused by the `/negotiate` page). 409 on a follow-up while a decision is in flight.
- **Layered rate limits (`lib/rate-limit.ts` `enforceNegotiationRateLimit`):** per-IP (30) + per-page (60) + per-agent+page (12) /min replace the blunt 20/min/IP. `buyerAgent` is a fairness/cost guard (spoofable); IP+page are the real guards. In-memory/per-instance (Upstash/Redis later for global).
- **`/negotiate/[id]`:** new `PendingPoller.tsx` island soft-refreshes when the decision lands.
- **Migrations (applied to prod):** `20260616000000` (`decision_pending`/`decision_requested_at`/`decision_seq` + partial index) + `20260616010000` (`decision_claimed_at` lease).
- **Live-verified on nexez.app:** instant POST (no LLM block) · async decision lands + sanitized (no `internalNotes` leak) · lease (no limbo) · 409 while pending · `decisionSeq` 1→2 · rules-win on below-floor · rate limit 12→429 · `/negotiate` pending poller · backstop cron heals a seeded stale row. Throwaway data cleaned up (`qa-neg-sim-33` left intact).
- **Pending follow-ups: Burst 3b** (adversarial LLM input hardening — length caps + prompt fencing of untrusted buyer fields + injection test suite; load testing) and **3c** (metrics/alerting dashboard — decision-latency p50/p95 computable from `decision_requested_at` → seller-turn `created_at`, already stamped).

### The arc this session (newest first)

### The arc this session (newest first)
1. **Env keys wired + verified** (this is where we left off): **Resend** transactional email (`RESEND_API_KEY` + `EMAIL_FROM=Nexez <notifications@updates.nexez.app>` — sends from a verified *subdomain* for reputation isolation; **email delivered ✅**). **Better Stack** observability (`OBSERVABILITY_WEBHOOK_URL` = `https://s2515146.eu-fsn-3.betterstackdata.com` + `OBSERVABILITY_WEBHOOK_TOKEN`; I added bearer-auth support `3e6e8a5` + warn-on-non-2xx `9b79e59`; **drift alert verified landing ✅**). `AGENT_VISIT_HASH_SALT`, the `VERCEL_API_TOKEN`/`VERCEL_PROJECT_ID`/`VERCEL_TEAM_ID` trio, and `CRON_SECRET` all set.
2. **Burst 2 — reversibility + self-healing escrow (LIVE).** New terminal statuses **`refunded` + `disputed`** (status CHECK widened). Owner **refund** action (`/api/negotiations/escrow` `action:'refund'`). Webhook **reversals** matched by payment intent: `charge.refunded`→refunded, `charge.dispute.created`→disputed, `charge.dispute.closed` won→complete / lost→refunded, `payment_intent.canceled`(held)→declined. **Reconciliation cron** `/api/cron/reconcile-escrow` (hourly in `vercel.json`) + pure `lib/escrow-reconcile.ts` (`reconcilePaymentState` heals succeeded→complete / canceled→declined / refunded→refunded; `captureError`-alerts contradictory drift). Durable-persist retry in `negotiation.service`. Money-safety trigger widened to allow complete-from-`disputed` (dispute won). **All flows verified live via signed webhooks.**
3. **Burst 1 — buyer-funded hybrid escrow (LIVE).** New **`/api/negotiations/pay`**: the *buyer* (token-gated, no login) funds the agreed amount via Stripe Checkout routed to the **owner's connected account** with the plan commission as `application_fee` (platform fallback if unconnected; reuses `app/api/checkout/route.ts` pattern). **Hybrid settlement** (`lib/settlement.ts`): at agreement time, amount **≤ ceiling** (per-offer `rules.autoSettleMax` or **$2,000** default) → **`auto`** (immediate capture, buyer self-serve, no owner action); **above** → **`awaiting_approval`** (owner approves → manual-capture hold → owner captures on delivery). Escrow route is now owner-side only: `approve | capture | cancel` (Connect-aware, idempotency-keyed; owner-funded "hold" removed). **Idempotency**: `stripe_webhook_events` ledger dedupes events by id; Stripe idempotency keys; idempotent pay-session reuse. **Server-enforced state machine**: `/api/negotiations/transition` validates `canTransitionNegotiation` (inbox no longer writes status from the browser) + DB trigger `nz_negotiation_money_safety` (can't set `held` without a PI; can't `complete` a payment-backed neg without a captured hold unless it's an `auto` settle). Columns added: `settlement_state`, `stripe_checkout_session_id`; `escrow_mode` gained `captured`.
4. **Two prod bugs fixed first** (these were the original task): **#1** status-token mismatch (`fc9b52e`) + a deeper one — the service wrote with the **anon** client so *all* persistence silently no-oped (`037764b`); fix = service-role client, token-as-credential. **#2** `/negotiate/[id]` page was dead (anon read of owner-only table) + leaked private rules/internalNotes (`957fcbf`); fix = token-required service-role read with a strict field allow-list + a migration revoking anon SELECT on `negotiation_messages`, and the service stopped persisting the offer's private `rules` into the message log.

### GA status
- **Burst 1 (money model correct & tamper-proof)** ✅ live · **Burst 2 (reversibility + self-healing)** ✅ live · **Burst 3a (async decision + scale rate limits)** ✅ live · **Resend** ✅ · **Better Stack alerting** ✅
- **Pending — Burst 3b** (adversarial LLM input hardening: untrusted buyer fields — `query`/`requestedTerms`/`budget`/`contact`/`buyerAgent` — are `JSON.stringify`'d straight into the prompt; the price-floor clamp is the only guard today. Add input length caps + prompt fencing + an injection test suite; load testing) **and Burst 3c** (negotiation metrics/alerting dashboard — status/decision distributions, escrow volume, decision-latency p50/p95 from the `decision_requested_at` → seller-turn `created_at` timing already stamped in 3a).
- **Pending — live-mode Stripe cutover (USER-DRIVEN, I can't do it):** everything is `sk_test`, and the **test owner has NO connected Stripe account**, so the live pay path uses the platform fallback and the **Connect `application_fee` routing is unit-tested only**. Runbook is in the plan file `~/.claude/plans/purrfect-rolling-storm.md`: live keys + a live webhook (subscribe to `checkout.session.completed`, `charge.refunded`, `charge.dispute.*`, `payment_intent.canceled`, `customer.subscription.*`, `account.updated`, `price.*`, **and enable "events on connected accounts"**), complete Connect onboarding, run one real low-value transaction.

### Inspection data left in place — DO NOT WIPE
- **`qa-neg-sim-33`** (1 published page, **33 negotiations**) — the user's 33-offer live simulation (accept / counter-clamp / decline / resume-across-decline / complete-via-escrow). The user wants to log in and inspect it. All other `qa-*` smoke-test data has been cleaned up.

### ⚠️ Critical workflow — parallel `main` (read before any code change)
The user (**Flyger1an**) + **Grok Build** + **codex** push to `main` **constantly, in parallel**. `origin/main` moves every few minutes, and the **local main checkout (`/Users/taio/nexez`) is usually their diverged WIP** (e.g. `clean supabase migration history`, billing rebuilds). **Do NOT edit or commit in the main checkout.** Instead:
1. `git fetch origin -q` then `git worktree add -b <branch> /Users/taio/nexez-wt-X origin/main`.
2. `rm` the linked `node_modules` and `cp -al /Users/taio/nexez/node_modules <wt>/node_modules` — **Turbopack rejects a *symlinked* node_modules** ("points out of filesystem root"); a hardlink copy works. `ln -s …/.env.local`.
3. Edit only your files, verify (lint/tsc/test/build), `git push origin HEAD:main` (fast-forwards origin since you based on its tip). Then `git worktree remove <wt> --force` + `git branch -D`.
4. If a push doesn't trigger a Vercel build (auto-deploy was flaky once), re-trigger with an empty commit from the worktree. **Env-var changes need a redeploy to take effect.**

See memory: [[parallel-main-push-workflow]], [[nexez-deploy-verify-loop]].

---

## Project
**Nexez** helps businesses create dedicated, highly structured pages optimized for **AI agents** to discover, understand, and purchase from. Dual philosophy: **premium glassmorphism human dashboard** vs **brutally clean/semantic HTML for agents** on public `[slug]` pages. A core objective is **deploying agent-optimized pages to custom domains**, managed from the Nexez backend.

## Stack & critical conventions
- **Next.js 16.2.7 (App Router, Turbopack)** — ⚠️ `AGENTS.md` warns this is a modified Next with breaking changes vs training data; **read `node_modules/next/dist/docs/` before using framework APIs**. Middleware lives in **`proxy.ts`** at the repo root (exports `proxy`), NOT `middleware.ts`.
- **Supabase** (Postgres + RLS + Auth + Storage). Clients: `utils/supabase/server.ts` (cookie/session, server components + route handlers), `utils/supabase/client.ts` (browser), `utils/supabase/admin.ts` → `createAdminClient()` / `hasSupabaseAdminEnv()` (service-role, gated). Project `pvsotrzgnjpqrsndhgmu`.
- **Deploy:** Vercel auto-deploys on push to `main`. Prod **`https://nexez.app`** (+ `www`); preview/branch URLs are SSO-gated. Vercel project `prj_uREcprpInoeHVhgV7aWc14TRsnLi`, team `team_rwkVXglmM5D0MPXjGTqOPVKO`.
- **Verify EVERY change:** `npm run lint -- --quiet` · `npx tsc --noEmit --incremental false` · `npm test` · `npm run build`. Route tests mock Supabase via `test/supabase-mock.ts` (`createSupabaseMock`); component tests declare `// @vitest-environment jsdom` + import `test/dom.ts`. Stripe-using route tests mock `stripe` with a **`class`** (not an arrow `mockImplementation`, which isn't a constructor). E2E (`npm run test:e2e`) is opt-in; authed smoke runs only with `E2E_EMAIL`/`E2E_PASSWORD`.
- **Migrations:** apply via **Supabase MCP `apply_migration`** AND write the `.sql` into `supabase/migrations/`. **Never `supabase db push`.** All idempotent. The **DB schema is authoritative via MCP regardless of how the migration *files* are organized** — the user periodically runs `clean supabase migration history` / `align burst migration ids` commits; don't be alarmed if file names shift.
- Commit trailer: repo convention credits `Grok Build <grok@x.ai>`; prior assistant commits used `Claude Fable 5`. Either is fine. Push to `main` directly.

## Credentials / account (repo is PUBLIC — never commit secrets)
- Test account **`realestglad@gmail.com`**, owner_id **`5320a9ef-9e9f-4e8b-ac78-13b9270c571b`**. Password is **not** stored — the user pastes it when authed verification is needed. **Clean up any test artifacts you create** (the `qa-neg-sim-33` set is the deliberate exception — leave it).
- Safety boundaries that shape verification: **can't enter passwords/cards or move real money.** So owner-authed flows (escrow approve/capture/refund), live-mode Stripe, and Connect onboarding are **user-driven** — verified via SQL-mimic + the DB trigger + signed-webhook simulation, not by driving the authed UI.

## Negotiation + escrow money system (the centerpiece — read for any money-path edit)
- **Lifecycle (`lib/negotiations.ts`):** statuses `negotiation → agreement_proposed → held → complete`, plus terminal `declined | expired | refunded | disputed`. `getAllowedNegotiationTransitions` / `canTransitionNegotiation`; `STATUS_LABELS`/tones. `refunded`/`disputed` are set only by the refund action / webhook, never as manual transitions.
- **Engine (`lib/negotiation.service.ts`):** `startOrContinue` loads page+offer, runs the LLM with full history (resumable), clamps to the rules floor (rules always win), persists turns to `negotiation_messages` (service-role), sets agreed `amount_cents` on accept/counter, and classifies `settlement_state` (`lib/settlement.ts`). **Token = credential** (`status_token`), enforced in `loadNegotiation`. Persists with a bounded retry → `captureError`.
- **Buyer pays (`app/api/negotiations/pay/route.ts`):** token-gated; Connect-routed Checkout (`auto` → immediate capture, `approved` → manual hold); idempotent (reuses open session + idempotency key); dual-mode (JSON for agents, 303 redirect for the `/negotiate` form).
- **Owner actions (`app/api/negotiations/escrow/route.ts`):** `approve` (unlock high-value) / `capture` (held→complete) / `cancel` (release→declined) / `refund` (complete→refunded). Connect-aware via `billing_subscriptions.stripe_connect_account_id`.
- **Webhook (`app/api/webhooks/stripe/route.ts`):** event-id idempotency ledger (`stripe_webhook_events`); `checkout.session.completed` (auto→complete / hold→held); the reversal events (refund/dispute/cancel); self-heals on failure (release claim + 500 so Stripe retries).
- **Reconcile cron (`app/api/cron/reconcile-escrow/route.ts` + `lib/escrow-reconcile.ts`):** hourly; compares each live negotiation to its true Stripe PI state and heals/alerts.
- **DB safety:** trigger `nz_negotiation_money_safety` (search_path-pinned) blocks `held`-without-PI and `complete`-of-a-payment-backed-neg-without-a-captured-hold (unless `auto` or coming from `disputed`). `stripe_webhook_events` is service-role-only (deny-all RLS).
- **Surfaces:** `/api/negotiations/status` returns `settlementState` + `payable`; the persistent `/negotiate/[id]` page (token-required service-role read, strict allow-list, owner-private data stripped) shows the thread + a "Pay $X to secure" form; the inbox shows Approve / Capture / Release / Refund.

## Architecture notes for common edits
- **Core types/helpers:** `lib/agent-page.ts` — `OfferItem`, `OfferRules` (incl. `autoSettleMax`), `AgentPage`, `PUBLIC_PAGE_SELECT`/`OWNER_PAGE_SELECT`, `getCheckoutOffer`, `getRequestBaseUrl`, readiness/trust/certification, availability.
- **Agent artifacts:** `lib/agent-manifest.ts`, `lib/mcp-server.ts`, `app/[slug]/{agent.json,mcp.json,mcp,llms.txt,badge.svg,badge.json}`.
- **Stripe Connect / commission:** `lib/stripe-billing.ts` (`getCommissionPercentForPlan`, `calculateApplicationFeeCents`), `app/api/checkout/route.ts` is the canonical connected-account + `application_fee` pattern (reused by the pay endpoint).
- **Observability:** `lib/observability.ts` `captureError` (gated on `OBSERVABILITY_WEBHOOK_URL`; `OBSERVABILITY_WEBHOOK_TOKEN` → Bearer; warns on non-2xx). Callers: reconcile cron drift, negotiation persist failures, import-site, ai-enhance.
- **Custom domains:** `lib/custom-domain.ts`, `proxy.ts` (host resolve + rewrite + auth gate), `lib/vercel-domains.ts` (gated on `VERCEL_API_TOKEN`+`VERCEL_PROJECT_ID`), `app/api/custom-domain`.
- **Dashboard/app shell:** `app/dashboard/page.tsx` (server) → `DashboardClient.tsx`; root `app/layout.tsx` → `PlatformFrame.tsx` → `PlatformShell.tsx`. Editor `/dashboard/[id]` is a server component → `EditorClient`.
- **Email:** `lib/email.ts` (`buildNegotiationEmail`, `buildBookingEmail`, `sendEmail`); default From is the apex `notifications@nexez.app` — **override `EMAIL_FROM`** to the Resend-verified `updates.nexez.app` sender (done).

## Gated features (env-set; **Vercel → project `nexez` → Settings → Environment Variables → Production**, then redeploy)
| Env var(s) | Unlocks | Status |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` + `…PUBLISHABLE_KEY` | the app runs | ✅ set |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/v1/*`, account export/delete, webhook + cron + negotiation DB writes | ✅ set |
| `STRIPE_SECRET_KEY` (+ `STRIPE_PRICE_*`) | billing subs, hosted checkout, **all negotiation escrow** | ✅ set (**`sk_test`** — live cutover pending) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook (escrow settle/reversal, billing sync) | ✅ set (sandbox) |
| `LLM_API_KEY` (+`LLM_BASE_URL`/`LLM_MODEL`/`LLM_PROVIDER`) | real LLM negotiation + assist (grok-4.3) | ✅ set |
| `CRON_SECRET` | gates `/api/cron/freshness` + `/api/cron/reconcile-escrow` (Vercel cron auto-auths) | ✅ set |
| `RESEND_API_KEY` (+`EMAIL_FROM`) | transactional email (negotiation proposals, bookings) | ✅ set (From = `updates.nexez.app` verified subdomain; **delivered**) |
| `OBSERVABILITY_WEBHOOK_URL` (+`OBSERVABILITY_WEBHOOK_TOKEN`) | `captureError` → Better Stack (Bearer-authed) | ✅ set (**verified**) |
| `AGENT_VISIT_HASH_SALT` | salt for privacy-safe agent-visit IP hashing | ✅ set (set-and-forget; don't rotate) |
| `VERCEL_API_TOKEN` + `VERCEL_PROJECT_ID` + `VERCEL_TEAM_ID` | auto custom-domain attach + SSL | ✅ set (token validates on first custom-domain attach) |
| `NEXT_PUBLIC_SITE_URL` | canonical base URL | ✅ `https://nexez.app` |

**NOT env vars:** Square/Acuity/GCal/Calendly/Shopify creds + Stripe *import* are **per-request** (pasted in UI / request body, sample fallback). Calendly webhook uses a per-page secret in `page_secrets`.

## Dev / verification workflow notes (learned across sessions)
- **Prod is the verification surface** for Stripe / service-role / LLM — `.env.local` has `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` but **no** `SUPABASE_SERVICE_ROLE_KEY` and **no** `LLM_API_KEY`, so the negotiation service + real LLM only work on **nexez.app**.
- **Signed-webhook trick** (escrow/reversal verification without a browser): HMAC-SHA256 over `${ts}.${payload}` with `STRIPE_WEBHOOK_SECRET`, header `stripe-signature: t=<ts>,v1=<sig>`, POST to `/api/webhooks/stripe`. Drives `checkout.session.completed`, `charge.refunded`, `charge.dispute.*`, `payment_intent.canceled` against real negotiations.
- **Reconcile cron** can't be curled without the `CRON_SECRET` value (the user has it; Vercel's scheduled run auto-attaches it). To force a drift alert: seed a `held` negotiation with a non-existent PI, then run/await the cron.
- **DB writes via Supabase MCP `execute_sql`** (service-role) for seeding/cleanup; **always clean up** test data (refund sandbox charges, delete pages/negotiations/messages/ledger rows).
- **Claude Preview MCP** quirks (when used): dev redirects `localhost`→`127.0.0.1` (`allowedDevOrigins`); the login form is controlled (native setter + `form.requestSubmit()`); headless browser auto-cancels `confirm()` — use the Supabase REST API with the session JWT for deletes.

## Quick verification commands
```bash
git fetch origin -q && git rev-list --left-right --count origin/main...main   # left=origin-only right=local-only
npm run lint -- --quiet && npx tsc --noEmit --incremental false && npm test && npm run build
```

## Earlier history (pre-2026-06-11, see git log)
Smart Rules Phase 1+2 (per-offer fixed/negotiable + rules engine + intelligent negotiation engine with multi-provider LLM adapters + persistent `negotiation_messages` threads), dual-revenue Stripe billing (subs for paid plans via Nexez MoR + Connect application-fee commissions on all plans), 5-tab glassmorphic `/dashboard/billing`, `/pricing`, `/onboard`, deeper LLM surfaces (`/api/simulate-llm`, `/api/trust-report`, AICoPilot), importer/Visual Builder/analytics, 6 integrations, custom-domain hosting, MCP JSON-RPC, trust/badges/certification, marketplace, leaderboard, `/api/v1/*` + keys, account export/delete, team RLS, rate limiting, freshness cron, theming. CI (`.github/workflows/ci.yml`) gates lint/tsc/test/build. Supabase Security Advisor was clean; leaked-password protection enabled.
