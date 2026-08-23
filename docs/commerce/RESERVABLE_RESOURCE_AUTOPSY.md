# Nexez Reservable Resource Autopsy

**Status:** Runtime v1 implemented - merchant-authored Nexez pools, atomic holds, settlement conversion, and production-path simulator contracts
**Machine-readable source:** `lib/commerce-templates/curation/reservable-resource-analysis.ts`
**Evidence corpus:** every curated candidate with an `inventory-resource` or `capacity-constraints` gap signal, plus current offer, Calendly availability, checkout, approval, and settlement rails

## Purpose

The Commerce Schema gap analysis deliberately grouped inventory reservation and generalized capacity into one design family. Both fail for the same commercial reason: Nexez may know that a merchant offers something without being able to protect a finite unit from two buyers at once.

The tempting fixes are unsafe:

- another public `available` flag can become stale between discovery and payment;
- `maxBookingsPerWeek` cannot represent chairs, tires, rooms, trucks, instructors, or event capacity;
- putting an inventory count on an offer does not make decrement, expiry, cancellation, or idempotency atomic;
- an LLM cannot decide that an equipment package or staff slot is probably available.

This autopsy asks a narrower question:

> **What is the smallest transaction-bound allocation primitive that protects finite merchant-owned capacity without turning Nexez into a warehouse, calendar, route planner, or multi-provider operations system?**

The v1 answer is an expiring atomic hold over interchangeable integer units in an explicit merchant-authored pool.

## Corpus result

Twenty of the 63 curated service patterns carry inventory or capacity pressure. Twelve carry `inventory-resource`, thirteen carry `capacity-constraints`, and five carry both.

They separate into four materially different families:

| Pressure | Count | What it is really asking for |
|---|---:|---|
| pooled service capacity | 8 | Protect a bounded number of interchangeable service units in an explicit window. |
| catalog inventory | 3 | Hold an exact quantity from a merchant-authored stock or rental pool. |
| equipment or space | 3 | Prevent a room, instrument, or equipment pool from being committed twice. |
| composite operations | 6 | Coordinate several resources, locations, providers, routes, or recurring commitments. |

The bounded v1 directly fits seven candidates, partially helps eleven, and must abstain from two whose dominant need is multi-provider orchestration.

## Terms that must not be collapsed

### Availability signal

`available`, `limited`, and `sold_out` are discovery facts. They help an agent decide what to investigate but do not protect anything during checkout.

### Capacity rule

`maxBookingsPerWeek` is a useful narrow ceiling. It counts bookings across a rolling period but does not identify a resource, requested quantity, or precise service window.

### Resource pool

A pool is an explicit merchant-owned source of interchangeable integer units. V1 supports:

- `consumable` units, which remain allocated after fulfillment unless explicitly restored by an authoritative operation;
- `reusable` units, which are allocated against an explicit availability window.

A pool is not an individual asset registry. V1 does not assign chair #14, record a vehicle VIN, choose a substitute tire, or track equipment condition.

### Hold

A hold is a short-lived, atomic allocation that temporarily reduces sellable quantity while a buyer approves and completes payment. A hold is not a reservation claim after expiry and is not a Stripe authorization hold.

### Committed reservation

A committed reservation is created only from an active hold after authoritative payment completion. It records what Nexez actually allocated. It does not prove that an external calendar, supplier, venue, or provider accepted the booking unless that system participates through a confirmed integration contract.

### Refundable security or damage deposit

Money held against loss or damage is a regulated settlement and policy concern. Reserving rental units does not authorize Nexez to create a damage-deposit product, reuse staged settlement, or imply escrow protection.

## Existing rails to compose

### Merchant-authored offer configuration

Resource requirements must belong to a real merchant offer. AI proposal, site-sync, and Nexxi merge paths may preserve resource configuration but must never invent pools, quantities, or availability.

### Canonical buyer configuration

Dynamic resource quantity may reference one existing required quantity input. The resolver consumes only the canonical validated integer; it does not inspect arbitrary prose or create a second intake schema.

### Conditional fulfillment

Eligibility remains upstream. An ineligible or review-required configuration cannot reserve resources merely because units remain.

### Deterministic pricing and buyer approval

Price still comes from the existing pricing or negotiation rail. Approval must bind the exact pool versions, window, quantities, allocation fingerprint, hold identity, and expiry. An approval cannot outlive the allocation it purports to authorize.

### Calendly and weekly booking caps

Calendly-backed availability and `maxBookingsPerWeek` remain valid narrow authorities. A Nexez pool must not impersonate a Calendly slot. If an offer depends on both systems, checkout must fail closed unless a future integration contract can obtain both commitments safely.

### Payment and order provenance

Checkout may convert an active or payment-pending hold only after authoritative payment completion. Unattached expiry releases immediately; attached payment sessions release only after authoritative expiry/failure. Refunds and cancellations must preserve reservation lineage; they must not silently restore consumable stock or erase commercial history.

## Proposed v1 contract

### Source of truth

Resource pools, pool kind, unit label, total quantity, offer requirements, and reusable availability windows are explicit merchant-authored configuration. Public agents receive safe aggregate availability, never private operating notes or unit identity.

### Bounded pool shape

- Pool kinds: `consumable` and `reusable`.
- Quantities are positive integers.
- Units inside a pool are interchangeable.
- An offer may reference at most three pools.
- Each requirement uses either a positive fixed quantity or one existing required canonical quantity input.
- One requirement cannot request more than 10,000 units.
- Reusable allocations reference an immutable merchant-authored availability-window ID with exact start and end instants.
- Consumable allocation reads only Nexez-owned on-hand state or an authoritative integrated source; it never guesses supplier availability.

The limits are intentionally conservative. They allow meaningful capacity and inventory proof without introducing bundles, substitutions, serialized assets, or a planning solver.

### Atomic availability and hold

Availability check, allocation, and hold creation must occur in one database transaction. The invariant is simple:

`committed quantity + active held quantity + payment-pending quantity <= authoritative available quantity`

The operation must:

1. lock or atomically compare every required pool/window;
2. reject the entire request if any requirement is unavailable;
3. create one hold with an immutable allocation snapshot;
4. make a scoped idempotency key resolve to the same hold and fingerprint;
5. expire between thirty and sixty minutes after creation so the existing Stripe Checkout rail can use the same deadline;
6. never permit a partial multi-pool hold.

Public hold creation must be idempotent and abuse-bounded: rate-limit by buyer/request scope, cap concurrent active holds for the same buyer and offer, and never allow anonymous callers to extend a deadline by replaying or rotating idempotency keys.

### Hold lifecycle

Suggested states:

`active -> payment-pending -> committed`

or

`active | payment-pending -> expired | cancelled | failed`

Every terminal transition is idempotent. An expired or released hold cannot later commit. A hold may commit only once and only to the transaction whose approval and settlement fingerprints match.

The payment session and allocation share one deadline and v1 permits only immediate-confirmation payment methods. Because webhook delivery can lag, a `payment-pending` allocation must never release from wall-clock expiry alone. The expiry worker must first expire or retrieve the provider session, and release only after authoritative session expiry/failure. A successful payment event for the matching session may then commit even if event delivery arrives after the deadline.

### Reservation lifecycle

Committed reservations preserve pool, window, quantity, buyer-visible offer, checkout/order lineage, and authoritative payment event.

- Reusable capacity stays committed for its declared service window and becomes historical after the window ends or an explicit cancellation releases it.
- Consumable stock stays allocated until authoritative fulfillment/cancellation policy resolves it.
- A refund records money movement but does not automatically assert that a physical unit is resellable.
- Merchant operations may explicitly release or restore units only through audited, idempotent transitions.

### Authority boundary

Nexez v1 may hold only Nexez-owned pools. It may display or consume external availability evidence, but it may not label an external unit `held` or `reserved` unless the integration returns a durable confirmation bound to the transaction.

This keeps claims honest for Calendly, Shopify, supplier feeds, venue systems, and provider calendars.

## Transaction order

1. validate and canonicalize buyer configuration;
2. evaluate conditional fulfillment and stop on review/ineligible;
3. resolve authoritative price and currency;
4. resolve merchant-authored resource requirements;
5. atomically create one expiring allocation hold;
6. dry-run and bind allocation plus hold to buyer approval;
7. refuse settlement if the hold or approval expired or changed;
8. create payment only for the exact held transaction and set the payment-session expiry to the hold deadline;
9. convert the hold on authoritative payment completion;
10. release unattached expiry immediately, but release payment-pending holds only after authoritative session expiry/failure;
11. preserve reservation and payment lineage after fulfillment, refund, cancellation, or dispute.

## Public and agent contract

Agent-facing surfaces may expose:

- safe pool/requirement identifiers and unit labels;
- whether quantity is fixed or comes from a named buyer input;
- aggregate remaining quantity for an authoritative window;
- window ID and buyer-safe start/end instants;
- whether a hold is required before checkout;
- hold expiry and the safe next action after dry-run;
- an explicit statement that checkout dry-run is authoritative.

They must not expose private unit identities, procurement state, supplier notes, staffing assignments, or uncommitted operational plans.

A stable dry-run shape should distinguish observed availability from an acquired hold:

```json
{
  "resources": {
    "status": "held",
    "holdId": "hold_...",
    "expiresAt": "2026-09-03T18:15:00Z",
    "allocationFingerprint": "...",
    "allocations": [
      {
        "poolId": "event-capacity",
        "windowId": "2026-09-12-evening",
        "quantity": 40,
        "unit": "guests"
      }
    ]
  }
}
```

`available` must never be rendered as `held`, and `held` must never be rendered as `committed` before the authoritative payment event.

## Simulator consequence

The public simulator should consume the same production requirement and availability resolver used by checkout. A configured example may truthfully demonstrate:

`buyer quantity -> authoritative window -> remaining units -> expiring hold -> approval required`

It must not animate fake scarcity, invent a pool from a Commerce Template, claim external inventory is reserved, or fabricate a hold merely to make the demo feel transactional.

## Explicit v1 exclusions

- serialized or individually assigned assets;
- substitutions, bundles, kits, or optimization across equivalent pools;
- warehouse purchasing, supplier orders, replenishment forecasting, or stock transfers;
- unsupported external inventory or calendar reservation claims;
- continuous interval optimization, route planning, or travel capacity;
- multi-provider, multi-location, or crew-assignment orchestration;
- refundable security/damage deposit settlement;
- asynchronous payment methods that can remain unresolved beyond the hold;
- maintenance, inspection, damage, or condition tracking;
- waitlists, intentional overbooking, or yield management;
- arbitrary formulas, fractional units, or model-evaluated quantities;
- LLM-inferred pools, requirements, availability, or release decisions.

## Runtime v1 evidence

The bounded implementation now lives in:

- `lib/reservable-resource.ts`, `lib/reservable-resource-runtime.ts`, and `lib/server/reservable-resource.ts` for the public contract, canonical resolution, and service-role-only database boundary;
- `supabase/migrations/20260821035523_reservable_resource_runtime.sql` plus its payment-provenance and account-lifecycle follow-ups for pools, windows, holds, allocations, reservations, RLS, RPCs, and immutable lineage;
- `app/api/reservable-resources/checkout/route.ts` for authoritative dry-run, approval-bound payment creation, and exact Stripe-session expiry;
- `lib/server/reservable-resource-webhook.ts` and `app/api/cron/reconcile-resource-holds/route.ts` for paid conversion and provider-authoritative expiry;
- `app/api/resource-pools/route.ts` and the existing offer codec for merchant-authored pools, windows, and offer requirements;
- agent manifest, OpenAPI, MCP, simulator, and buyer checkout surfaces that point to the same production dry-run rather than rendering inferred availability;
- `supabase/tests/reservable_resource_gauntlet.sql` and `supabase/tests/reservable_resource_concurrency.sql` for lifecycle, abuse, delayed-webhook, account-deletion, and final-unit race certification.

Refund and dispute events continue through the ordinary order ledger; they do not automatically restore physical capacity. External calendars and inventory remain outside this Nexez-owned authority boundary.

## Implementation acceptance criteria

The runtime slice is certified against all of the following:

1. merchant authoring persists bounded pools, windows, and offer requirements without AI invention;
2. validation rejects duplicate IDs, unknown pools/inputs, unsupported kinds, unsafe labels, fractional/negative/unbounded quantities, invalid windows, and more than three offer requirements;
3. the resolver consumes only canonical buyer quantity and merchant-authored configuration;
4. one atomic database operation either acquires every required allocation or none;
5. active holds and committed reservations can never oversubscribe a pool/window;
6. hold creation, expiry, release, and conversion are idempotent and auditable;
7. buyer approval expires with and binds the exact hold/allocation fingerprint;
8. payment creation refuses missing, changed, released, or expired holds and sets its session expiry to the hold deadline;
9. payment-pending allocation never releases from wall-clock expiry without authoritative provider expiry/failure;
10. authoritative payment events convert only the matching hold and preserve order lineage, including delayed webhook delivery;
11. cancellation, refund, and dispute behavior never silently invent restored physical availability;
12. Calendly and external inventory authority are preserved rather than shadowed;
13. agent.json, MCP, OpenAPI, and merchant/buyer surfaces distinguish available, held, and committed states;
14. simulator output uses the production resolver and never fabricates scarcity or reservation;
15. concurrent tests prove two buyers cannot acquire the final unit;
16. abuse tests prove callers cannot squat inventory by replaying or rotating hold requests;
17. benchmark fixtures prove agents do not claim a resource is reserved before a hold exists;
18. no post-pilot template is activated merely because it carries `INVENTORY` or `CAPACITY_LIMITED` metadata.

## Architecture conclusion

Inventory and capacity belong to one design family only at the allocation boundary. The smallest general primitive is:

> **A short-lived atomic hold over merchant-authored interchangeable units, bound to exact buyer configuration and converted into a durable reservation only by authoritative settlement.**

This gives Nexez an honest answer to “can you protect this finite thing while I approve the purchase?” without pretending to solve warehouses, calendars, routing, maintenance, or multi-provider operations.
