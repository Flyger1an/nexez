# Nexxi authoritative commerce routing

Last reviewed: 2026-08-29

## Boundary

Nexxi never executes an endpoint supplied by the mobile client, an LLM tool call, or search-result text. The platform resolves `slug + offer` from the current published page and selects one known route through `getOfferCheckoutPath()`.

| Commerce rail | Authoritative endpoint |
| --- | --- |
| One-time and configured | `/api/checkout` |
| Recurring service | `/api/service-agreements/checkout` |
| Staged settlement | `/api/staged-settlements/checkout` |
| Reservable resource | `/api/reservable-resources/checkout` |

Provider-preferred and negotiable offers do not enter this booking path.

## Approval sequence

1. Resolve the current published offer and canonical endpoint family.
2. Build the request from the authenticated buyer identity and declared offer configuration.
3. Dry-run the exact request with a server-generated idempotency key.
4. Persist the normalized request, approval token, canonical rail, endpoint family, and idempotency key in the server-managed approval ledger.
5. Return only the safe action descriptor and dry-run summary to the client. The approval token and replay tuple are removed from the wire payload.
6. When the buyer approves, re-resolve the offer and reject any route change before claiming the approval.
7. Execute the stored request with the same token and idempotency key. The checkout route recomputes current pricing, configuration, fulfillment, terms, and availability before accepting the payload-bound token.

The approval ledger is service-role writable and buyer-readable. The mobile payload is a presentation surface, never execution authority.

## Phase 3 buyer configuration

Search actions include the selected offer's merchant-authored `input_schema`, `required_input_fields`, and idempotency requirement. Nexxi must ask for every missing required value and submit exact buyer values under `offerConfiguration`. The server rejects missing values before dry-run and returns the merchant-authored questions to the conversational loop.

Configured, recurring, staged, and reservable results are actionable only through the authoritative resolver used at preparation and approval. No client-provided endpoint is executed.

The public approval descriptor contains only safe dry-run details. The mobile client requires a completed descriptor before enabling booking approval and renders the exact amount, recurring cadence, staged schedule, fulfillment decision, and resource hold expiry. The private approval token and replay tuple never leave the platform.

Advanced checkout events retain their established order token and include a buyer-safe `commerceKind` for native subscription-payment, staged-payment, and reservation presentation. Existing receipt and recourse routes remain authoritative.
