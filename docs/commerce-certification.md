# Commerce Certification

Commerce certification is the release gate for Nexez money paths. Configuration proves that a feature can start. Certification proves that the complete lifecycle settles, reconciles, and leaves durable evidence.

## Safety boundary

`npm run certify:commerce` is the automated, non-money-moving phase. It:

- verifies the API and the configured certification listing;
- requests checkout and negotiation dry runs;
- confirms both dry runs issue approval tokens;
- confirms tokenless live requests fail closed with `403 approval_required`;
- reads Stripe Price objects when a local Stripe key is available and verifies mode, active state, and recurring type.

It does not create a charge, Checkout Session, subscription, negotiation, refund, or payout. The checkout dry run keeps its normal telemetry event so repeated certification remains observable.

## Certification account

Use a dedicated seller and buyer identity. Keep the seller published but clearly labeled for certification, with:

- one low-value fixed-price offer;
- one negotiable offer with a safe minimum and auto-accept band;
- a fully onboarded Stripe Connect account with charges and payouts enabled;
- a monitored email address;
- no production customer data.

Override the default target when needed:

```bash
NEXEZ_COMMERCE_CERT_SLUG=your-certification-slug \
NEXEZ_COMMERCE_CERT_OFFER=services-0 \
npm run certify:commerce
```

The default target is `nexez-agent-negotiation-lab` / `services-0`.

## Automated gate

Run this against the production agent runtime before any release that changes checkout, negotiations, approval tokens, Stripe routing, public artifacts, or middleware:

```bash
npm run certify:commerce
```

A failed automated check blocks release. A skipped local Stripe catalog check does not prove the catalog; Launch Control must still show its server-side Stripe verification as ready.

## Owner-run lifecycle gate

These checks can move real funds unless they are explicitly labeled sandbox-only and therefore require deliberate owner action. Use the lowest practical amount and retain Stripe event IDs plus release notes as evidence.

### Current evidence (2026-07-15)

- **Certified in Stripe test mode:** ACP and UCP create, update, complete, create replay, and completion replay. Each channel produced exactly one completed session and one paid `$1` order with `stripe_livemode = false`.
- **Certified in Stripe test mode:** a Product default-Price replacement from `$1.00` to `$1.25`, one linked-offer `stripe_price_sync` audit, exact webhook replay deduplication, and isolation from a parallel non-default `$9.99` Price.
- **Still owner-run:** paid-plan subscribe/portal/cancel, partial then full refund of a proven live direct order, and a fresh low-value negotiation through funding and terminal reconciliation.

Sandbox protocol orders prove adapter conformance only. They may satisfy the optional ACP/UCP Launch Control gate, but they must never contribute to live order counts, GMV, revenue, fees, refunds, or seller Finance totals. Price-sync certification requires both a catalog webhook ledger row and a linked-offer audit row; either one alone is incomplete proof.

### 1. Subscription billing

1. Sign in with the certification seller.
2. Select Launch, Pro, or Scale from Billing.
3. Complete the embedded payment flow.
4. Confirm `billing_subscriptions` reflects the correct plan and active/trialing status.
5. Confirm the paid entitlement appears without a manual refresh race.
6. Open the billing portal.
7. Cancel at period end and confirm the webhook updates the local row.

### 2. Direct Connect checkout

1. Open the certification offer through the public agent page.
2. Validate the action and explicitly approve it.
3. Complete Stripe Checkout with a low-value live payment.
4. Confirm the charge belongs to the seller Connect account.
5. Confirm the Nexez application fee matches the seller plan.
6. Confirm one durable `checkout_orders` row, buyer receipt, order portal, and seller Finance entry.
7. Confirm `stripe_livemode = true` on the durable order.
8. Replay the same idempotency key and confirm no duplicate order or charge.

### 3. Partial and full refund

1. Partially refund the captured certification order from Finance.
2. Confirm `refunded_cents` matches Stripe and the remaining amount is still refundable.
3. Confirm the application fee reverses proportionally and the buyer receives an update.
4. Refund the remaining amount.
5. Confirm the final status, total refunded amount, order portal, seller ledger, and webhook replay behavior.

### 4. Negotiation and escrow

1. Submit an in-rules proposal through the approval-token flow.
2. Confirm one negotiation and one buyer message are created.
3. Confirm the asynchronous decision clears within the normal window.
4. Fund the agreement on the seller Connect account.
5. Capture or reconcile the payment into a terminal state.
6. Confirm fee, receipt, seller notification, buyer status, and reconciliation behavior.
7. Repeat with one out-of-rules proposal and confirm the deterministic rule clamp wins over any LLM suggestion.

### 5. Stripe price synchronization (certified in test mode)

1. Create a replacement Price for the certification Product in Stripe. Stripe Price amounts are immutable.
2. Set the replacement as the Product's default Price.
3. Confirm `product.updated` reaches the correct webhook endpoint with the prior and replacement `default_price` IDs.
4. Confirm exactly one linked offer changes its amount and stored `stripe_price_id`, and one `stripe_price_sync` event is recorded.
5. Redeliver the same event and confirm the webhook ledger prevents a duplicate application.
6. Create a parallel non-default Price and confirm Nexez does not overwrite the linked offer.

### 6. ACP and UCP (certified in test mode)

1. Create one ACP and one UCP checkout session with distinct idempotency keys.
2. Replay the create and confirm the original session returns.
3. Update and complete the session with a delegated payment token in the safe test environment.
4. Confirm each durable order carries the correct `acp` or `ucp` channel, seller ownership, and `stripe_livemode = false` provenance.
5. Replay completion and confirm no duplicate order.

## Environment separation

Keep test and live Stripe objects isolated. A key and all Price IDs must belong to the same mode. Never reuse production customer data in a test environment. The recommended promotion sequence is:

1. run unit, route, and browser tests locally;
2. run the automated commerce gate against the candidate deployment;
3. run full lifecycle checks in Stripe test mode;
4. deploy production;
5. run the automated gate against `https://nexez.app`;
6. run only the minimal low-value live checks required for the changed money path;
7. verify Launch Control, the public listing, `agent.json`, `llms.txt`, MCP, OpenAPI, and the agent index.

## Go / no-go

Release is blocked when:

- any required Launch Control configuration is blocked;
- an automated certification check fails;
- a negotiation or Shopify queue item is stale;
- Stripe event delivery is absent or older than seven days;
- a changed money path lacks owner-run lifecycle evidence;
- a live Price cannot be proven active, recurring, and in live mode.

An optional integration may ship as dormant only when its UI and agent artifacts state that honestly and the core commerce path remains unaffected.
