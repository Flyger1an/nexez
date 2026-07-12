# Agentic checkout — pricing & upgrade copy

Sells the **Pro** upgrade on one benefit: *get discovered by AI shopping agents for free, get **paid** by them on Pro.* Grounded in the real mechanics — discovery (ChatGPT + Google feeds) is free for every published listing; **transacting** through the agent is the Pro capability (`agenticCheckout`, Pro+). Pro also drops the transaction commission from **15% → 6%**.

The feature name buyers see: **Agentic Checkout** (a.k.a. "Sell through ChatGPT & Google").

---

## 1. Pricing page — Pro plan

**Feature line (plan card / comparison table):**
> **Agentic Checkout — sell inside ChatGPT & Google** · *Pro*

**Comparison-table rows (Free vs Pro):**

| | Free / Launch | Pro |
|---|---|---|
| Listed in ChatGPT & Google agent feeds | ✓ | ✓ |
| Agents can **complete checkout** (Instant Checkout / Google) | — | ✓ |
| Transaction commission | 15% | **6%** |

**Benefit blurb (under the Pro plan):**
> **Turn agent traffic into agent sales.** Every published listing already shows up when ChatGPT and Google's shopping agents look for what you sell. Pro lets those agents *close the sale* — buyers check out and pay without ever leaving the chat, settled straight to your Stripe account. You also pay the lowest commission: **6%, down from 15%.**

**Micro-caption (optional, italic):**
> *Discovery is free forever. Pro is what makes you buyable.*

---

## 2. Upgrade modal — shown when a Free/Launch seller hits the gate

Trigger: a non-Pro seller opens the "Sell through ChatGPT & Google" card, or toggles anything that needs agentic checkout.

**Headline:**
> Let agents check out, not just window-shop

**Body:**
> Your listing is already discoverable in ChatGPT and Google — agents can find it and quote it today. Upgrade to **Pro** and they can **complete the purchase** right inside the chat: the buyer pays, the order lands in your dashboard, and the money settles to your Stripe account. Pro also cuts your commission from **15% to 6%** on every agent sale.

**Bullets:**
> - ✓ Instant Checkout in ChatGPT + agentic checkout on Google
> - ✓ Paid out through your own Stripe — you're the merchant of record
> - ✓ 6% commission instead of 15%
> - ✓ Every order tracked, refundable, and reconciled in Nexez

**Primary CTA:** `Upgrade to Pro`
**Secondary CTA:** `Keep discovery only`

**Reassurance line (small, under the buttons):**
> You stay discoverable on Free — upgrading only adds the ability to get paid.

---

## 3. In-context nudge (the Settings card `needs_plan` line — already shipped)

> **Checkout** — upgrade to Pro to let agents complete the sale, not just discover you. → **Upgrade to Pro**

---

## 4. One-liners (reuse anywhere)

- "Get found by AI agents for free. Get paid by them on Pro."
- "Discovery is the free sample. Checkout is the product."
- "On Free you're in the catalog. On Pro you're in the cart."
- "ChatGPT and Google can already recommend you — Pro lets them buy from you."

---

## Guardrails for whoever wires this into the pricing page

- **Don't promise a surface that isn't live.** ChatGPT (ACP) and Google (UCP) enroll independently and flip on separately. The Settings card already reflects this per-surface (`liveSurfaces`); pricing copy should stay at the category level ("ChatGPT & Google") rather than claim a specific one is live on a given date.
- **Commission numbers are single-sourced** in `lib/billing.ts` (`billingPlans[].commissionPercent`: Free 15%, Pro 6%). If those change, update the table above — don't hardcode a divergent number.
- The capability id is `agenticCheckout` (rank 2 = Pro+) in `lib/billing.ts` → gate any pricing-page CTA with `planAllows(planId, 'agenticCheckout')` / `minPlanForFeature('agenticCheckout')` so the "Upgrade to Pro" target is derived, not hardcoded.
