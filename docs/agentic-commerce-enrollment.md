# Agentic-Commerce Enrollment Checklist

Nexez has dormant adapters for OpenAI's Agentic Commerce Protocol (ACP) and
Google's Universal Commerce Protocol (UCP). Both use the same provider-neutral
checkout core and seller-as-merchant-of-record settlement rules. Discovery feeds
are public. Checkout is not advertised until the related enrollment and payment
requirements are complete.

This document separates adapter compatibility, sandbox lifecycle evidence, and a
real delegated payment. They are not interchangeable.

## Current posture

| Surface | URL | Current state |
|---|---|---|
| ACP product feed | `https://nexez.app/acp/feed.json` | Public, search only by default |
| ACP checkout | `https://nexez.app/api/acp/checkout_sessions` | Fails closed until `ACP_SHARED_SECRET` is set |
| UCP product feed | `https://nexez.app/ucp/feed.json` | Public, search only by default |
| UCP checkout | `https://nexez.app/api/ucp/checkout-sessions` | Fails closed until `UCP_SHARED_SECRET` is set |
| Nexez capability manifest | `https://nexez.app/.well-known/nexez.json` | Reports checkout as search only unless explicitly enabled |

The settlement bridge has three typed branches:

- Stripe test PaymentMethods beginning with `pm_` are accepted only by internal
  sandbox certification code.
- ACP Shared Payment Tokens beginning with `spt_` or `vt_` use Stripe's
  `payment_method_data[shared_payment_granted_token]` preview parameter.
- UCP Google Pay credentials are rejected before Stripe because Nexez does not yet
  have a declared handler and verified gateway-processing path.

The public ACP completion route rejects a `pm_` stand-in. It accepts ACP's typed
`{ "type": "spt", "token": "spt_..." }` credential and older bare SPT or
vaulted-token shapes. The public UCP completion route requires exactly one selected
instrument, an exact handler-instance match, and a `PAYMENT_GATEWAY` credential.

## Automated adapter gate

Run:

```bash
npm run certify:protocol-adapters
```

This command verifies:

- source-linked ACP 2026-04-17 and Google Pay 2026-01-23 credential fixtures;
- typed credential dispatch and prefix validation;
- ACP API-version refusal, route auth, replay behavior, and settlement mapping;
- UCP handler matching, ambiguous-instrument rejection, route auth, replay
  behavior, and the explicit unsupported gateway outcome.

It does not call production, create a Stripe object, or prove that OpenAI or Google
has issued a usable delegated credential.

## ACP enrollment

### Compatibility limit

Nexez currently emits its pinned `API-Version` contract, `2025-09-12`. The latest
ACP release reviewed by this code is `2026-04-17`, and its typed SPT request fixture
is covered. Nexez does not claim the full 2026-04-17 response contract. The auth
boundary rejects any requested API version other than the pinned one.

Confirm with OpenAI which wire version enrollment requires. If it requires
2026-04-17, migrate the complete response and capability shapes before enabling
checkout. Parsing the latest credential shape is necessary but is not full protocol
conformance.

### Enrollment and configuration

1. Complete OpenAI partner enrollment.
2. Provide `/acp/feed.json` and `/api/acp/checkout_sessions` as the feed and
   checkout base.
3. Obtain the inbound Bearer credential and order-status webhook values.
4. Confirm the exact API version and request-signature requirements supplied at
   enrollment. The current inbound gate verifies Bearer auth. Do not assume a
   signature format before OpenAI supplies it.
5. Set `ACP_SHARED_SECRET` only after the inbound contract is confirmed.
6. Set `ACP_ORDER_WEBHOOK_URL` and `ACP_ORDER_WEBHOOK_SECRET` after confirming the
   exact signature header and encoding.
7. Confirm the connected-account Stripe webhook subscribes to
   `payment_intent.succeeded`.
8. Leave `ACP_CHECKOUT_ENABLED` unset until the owner smoke test passes.

### Owner-run ACP smoke test

This is a deliberate payment test. Do not automate it against live money.

1. Use an enrolled certification seller with Connect charges and payouts enabled.
2. Create a low-value ACP session with a unique idempotency key.
3. Replay create and confirm the original session is returned.
4. Complete with a real OpenAI-issued `spt_` or approved `vt_` credential, never a
   `pm_` stand-in.
5. Confirm one direct charge on the seller's connected account and the expected
   `application_fee_amount`.
6. Confirm one durable `checkout_orders` row with `channel = 'acp'`, correct seller
   ownership, correct amount, and Stripe environment provenance.
7. Replay completion and confirm no second charge or order.
8. Confirm the buyer receipt, seller notification, order portal, refund path, and
   outbound ACP order update.
9. Retain Stripe event IDs and the enrollment version as release evidence.
10. Only then set `ACP_CHECKOUT_ENABLED=true`.

## UCP enrollment

UCP is less mature in Nexez than ACP. Keep UCP checkout disabled until every item
below is complete.

1. Complete Google Merchant Center and UCP enrollment.
2. Add the standard `/.well-known/ucp` profile.
3. Declare the `com.google.pay` payment handler in the profile and every checkout
   response, using the enrolled instance ID.
4. Configure `UCP_GOOGLE_PAY_HANDLER_ID` to that exact instance ID.
5. Configure Google Pay for the chosen payment gateway and prove how the opaque
   `PAYMENT_GATEWAY` payload becomes a charge on the seller's Connect account.
6. Implement that gateway branch without decoding, replacing, or treating the
   payload as a Stripe PaymentMethod ID.
7. Add the standard UCP response envelope, status lifecycle, capabilities, links,
   and payment-handler declarations for the enrolled UCP version.
8. Add AP2 mandate verification if the enrolled flow requires autonomous
   completion.
9. Set `UCP_SHARED_SECRET` after Google's inbound auth contract is known.
10. Run the adapter gate and a deliberate owner test with the enrolled Google Pay
    test environment.
11. Leave `UCP_CHECKOUT_ENABLED` unset until handler, gateway, replay, order, and
    notification evidence all pass.

## Environment reference

| Variable | Effect |
|---|---|
| `ACP_SHARED_SECRET` | Enables ACP Bearer authentication |
| `ACP_CHECKOUT_ENABLED=true` | Advertises ACP checkout eligibility |
| `ACP_ORDER_WEBHOOK_URL` | Enables outbound ACP order updates |
| `ACP_ORDER_WEBHOOK_SECRET` | Signs outbound ACP order updates |
| `UCP_SHARED_SECRET` | Enables UCP Bearer authentication |
| `UCP_GOOGLE_PAY_HANDLER_ID` | Binds an inbound instrument to Nexez's declared Google Pay handler |
| `UCP_CHECKOUT_ENABLED=true` | Advertises UCP checkout eligibility |
| `STRIPE_WEBHOOK_SECRET_CONNECT` | Verifies seller-account Stripe events |
| `STRIPE_SECRET_KEY` | Performs settlement in the configured Stripe mode |
| `SUPABASE_SERVICE_ROLE_KEY` | Persists sessions and orders through the server boundary |

## Fail-safe behavior

- No protocol secret means every checkout request fails authentication.
- A missing UCP handler ID returns a configuration error before settlement.
- A mismatched UCP handler, ambiguous instrument, wrong credential type, or blank
  token returns a request error before settlement.
- A raw `pm_` credential at the ACP public boundary is rejected.
- An ACP version other than the pinned version is rejected instead of echoed.
- A paused seller or seller without charge and payout readiness cannot settle.
- Create and completion retries use stable idempotency keys.
- Launch Control never treats sandbox protocol order counts alone as delegated-payment
  proof. It promotes only an append-only `protocol_credential_confirmed` order event
  written after successful settlement. The event stores credential kind and handler
  ID, not the credential token.
