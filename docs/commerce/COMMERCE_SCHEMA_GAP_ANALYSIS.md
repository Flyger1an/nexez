# Nexez Commerce Schema Gap Analysis

**Status:** Architecture analysis v6 — refreshed after the first post-pilot template promotion
**Machine-readable source:** `lib/commerce-templates/curation/gap-analysis.ts`  
**Curation evidence:** `lib/commerce-templates/curation/`

## Purpose

The 63-candidate curation matrix established what kinds of commercial pressure recur across the service economy. This analysis asks a narrower question:

> **Which of those pressures are already real Nexez transaction primitives, which are only loosely representable, and which are actually missing?**

This prevents two equally expensive mistakes:

1. adding universal schema fields merely because one category wants them;
2. assuming a concept is implemented end-to-end merely because its name appears in `CommerceCapability`, a template pricing/payment mode, or a human-facing offer field.

## Classification standard

- **first-class** — an explicit typed production primitive exists and deterministic behavior enforces the relevant contract.
- **weakly-structured** — Nexez can represent part of the concept today, but semantics are generic, narrow, descriptive, integration-specific, or not transaction-enforceable.
- **broadly-missing** — repeated curation demand exists and Nexez cannot safely express the required transaction behavior end-to-end.
- **not-justified** — the concept is currently too niche or underspecified to deserve universal schema weight.

The machine-readable analysis derives candidate counts and candidate IDs from the #80 curation corpus. This document intentionally does not duplicate those derived counts.

## The critical semantic/runtime distinction

A `CommerceTemplate` capability is **knowledge about the commercial pattern**, not proof that every associated behavior already exists in the transaction engine.

That distinction is now useful in both directions. Before the recurring-service implementation, `RECURRING` and `SUBSCRIPTION` were semantic/template knowledge ahead of the transaction engine. They are no longer merely labels: merchants can author recurring terms, agents can read them, buyer configuration resolves exact cadence and price, approval binds an agreement snapshot, Stripe Connect creates the subscription, paid invoices create ordinary order occurrences with service-period provenance, and buyers can cancel at period end.

So recurrence, conditional fulfillment, staged settlement, and Nexez-owned resource reservation have moved from **broadly missing** to **first-class** because their runtime behavior now exists. The same promotion must not happen for `MULTI_PROVIDER` or any other concept until the relevant transaction behavior is equally real.

## Executive result

The current analysis now contains eight first-class signals, a large middle of partial support, one remaining missing primitive, and a defer bucket:

| Disposition | Signals |
|---|---|
| first-class | customer requirements; recurrence terms; conditional fulfillment; structured modifiers; quantity pricing; milestones; deposit schedule; inventory/resource reservation |
| weakly structured | capacity constraints; document requirements; regulated qualification; contract terms; inspection-first; minimum charge; distance/travel fee; multi-unit booking; usage rights; qualification fit |
| broadly missing | multi-provider orchestration |
| not justified | usage pricing; route optimization |

## First-class: keep the existing rails

### Customer requirements

`OfferInputField` is already the right abstraction. Merchants author typed public input schemas; the buyer supplies transaction data; validation rejects unknown/missing/invalid values; multi-select values are canonicalized; dates, quantities, locations, and asset references are bounded; checkout preserves the normalized snapshot.

**Decision:** do not build a second “requirements” schema.

### Recurrence terms

Recurring service now has a real merchant-authored transaction contract:

- fixed cadence or buyer-selected cadence mapped from a merchant-declared required single-select input;
- deterministic per-period configuration and pricing;
- approval-bound agreement fingerprint;
- dedicated recurring checkout and Stripe Connect subscription creation;
- service starts only after the first successful subscription payment;
- paid invoices create ordinary `checkout_orders` occurrences with agreement, invoice, PaymentIntent, charge, and service-period lineage;
- period-end cancellation and reversal of pending cancellation;
- no fake pause semantics.

**Decision:** `lib/recurring-service.ts` plus the service-agreement checkout/webhook/ledger is the canonical merchant recurrence rail. Extend it rather than inventing a parallel subscription abstraction.

### Conditional fulfillment

Conditional fulfillment now has a real merchant-authored transaction contract:

- bounded predicates reference canonical required buyer inputs;
- validation rejects unknown inputs, incompatible operators, duplicate IDs, unsafe messages, and unbounded rules;
- one-time and recurring checkout share deterministic `eligible`, `requires-review`, and `ineligible` outcomes;
- review/ineligible outcomes block payment before session creation;
- exact policy, configuration, decision, and fingerprints are bound through buyer approval and settlement provenance;
- merchant editor and public agent contracts expose only the safe declared policy surface.

**Decision:** `lib/conditional-fulfillment.ts` and `lib/offer-transaction-configuration.ts` are the canonical eligibility rail. Inventory, qualification authority, inspection lineage, and multi-provider state remain outside it.

### Structured modifiers

Simple independent modifiers are already deterministic: select options, booleans, and quantities can carry merchant-authored deltas, with exact smallest-unit pricing and adjustment provenance.

**Decision:** keep cross-field branching out of this DSL. That belongs under conditional fulfillment.

### Quantity pricing

Pre-known quantity is typed and deterministically priced with an included quantity plus unit delta.

**Decision:** distinguish this from post-consumption metering. The latter is a different problem.

### Milestones and deposit schedules

Staged settlement now has a real merchant-authored transaction contract:

- two to five ordered obligations allocate exactly one authoritative total;
- deposits are commitment installments rather than ambiguous security holds;
- every payable obligation receives fresh approval bound to schedule, amount, currency, and paid predecessor lineage;
- agreement and obligation ledgers preserve payment, refund, dispute, and completion provenance;
- only one obligation can be payable at a time;
- future stages never charge autonomously or become complete through model inference.

**Decision:** `lib/staged-settlement.ts`, `lib/staged-settlement-runtime.ts`, and the staged-settlement agreement/checkout/webhook rail are canonical. Refundable security deposits, escrow, inventory reservation, and multi-provider allocation remain outside it.

### Inventory / resource reservation

Reservable-resource v1 now provides merchant-authored Nexez-owned consumable or reusable pools, immutable reusable windows, bounded offer requirements, canonical buyer quantities, atomic all-or-none holds, exact approval/payment provenance, provider-authoritative expiry, and committed reservation/order lineage.

**Decision:** `lib/reservable-resource.ts`, `lib/reservable-resource-runtime.ts`, and the resource checkout/RPC/webhook ledger are canonical. They do not claim serialized assets, external calendar/inventory authority, substitutions, route planning, or multi-provider orchestration.

## Weakly structured: harden before inventing replacements

### Capacity constraints

Nexez has real narrow capacity behavior: `maxBookingsPerWeek` is enforced, and Calendly sync can derive `available`, `limited`, or `sold_out`. What it does not have is a generalized capacity/resource model for crews, rooms, vehicles, equipment, simultaneous jobs, or per-service quantities.

**Direction:** preserve weekly booking caps. Generalize only alongside resource reservation.

### Document requirements

A required `asset` buyer input can be validated and bound to a transaction, but the value is an opaque reference rather than a typed secure-document contract.

**Direction:** keep document requirements on `OfferInputField`; add document type/security/expiry semantics only when promoted templates prove the need.

### Regulated qualification

Seller credential records and review metadata exist, but the current model explicitly does not treat seller-writable credential metadata as authoritative trust evidence. It also does not bind qualification to offer/jurisdiction eligibility.

**Direction:** strengthen authority in the trust/verification layer, then reference verified facts from commerce. Never make a template declare that a merchant is licensed.

### Contract terms

Negotiations accept bounded `requestedTerms`, but the payload is intentionally generic. Included/excluded scope and selected booking constraints are typed separately.

**Direction:** add only a small recurring vocabulary of transaction-critical terms; preserve free-form negotiation for the long tail.

### Inspection-first

Nexez can sell a diagnostic offer, use quote-required semantics, and collect condition inputs. It cannot bind “completed inspection X” to “new authorized quote/offer Y” as one deterministic transaction lineage.

**Direction:** wait for a promoted diagnostic template to prove the shared transition contract before adding lifecycle machinery.

### Minimum charge

A listed/base price and private negotiation `minPrice` cover nearby use cases, but there is no public deterministic minimum-final-amount rule for unit/configuration pricing.

**Direction:** only extend the pricing DSL if real promoted templates show that base price cannot cleanly express the minimum.

### Distance / travel fee

Offers can publish a flat `travelFee`, a service area, and collect buyer location. They cannot calculate a merchant-authored zone/distance threshold or per-mile/per-kilometer adjustment.

**Direction:** keep flat travel fees. Add a constrained distance/zone rule only after several active mobile-service templates share it.

### Multi-unit booking

Quantity can represent “six guests” or “three sessions,” but it does not identify/configure each unit or reserve per-unit resources.

**Direction:** do not build a universal unit graph until we can distinguish simple scalar quantity from true per-unit identity.

### Usage rights

Templates can identify licensing relevance and merchants can describe rights as attributes/text. There is no typed grant for medium, territory, duration, exclusivity, or transferability.

**Direction:** let multiple creative-service promotions discover a stable rights vocabulary before hardening it.

### Qualification fit

Buyer eligibility-affecting inputs and merchant attributes can describe each side of the match, but there is no deterministic fit evaluator joining verified merchant capability to buyer need.

**Direction:** any future evaluator must consume merchant truth + buyer truth, never template expectations as merchant facts.

## Broadly missing: genuine design work

### Multi-provider orchestration

A template may identify multi-provider commerce, but one transaction does not coordinate multiple provider responsibilities, availability, allocations, approvals, or settlement.

**Design direction:** explicitly **not automatically next**. This is a larger product slice and should stay missing until a promoted pattern earns it.

## Not justified yet

### Usage pricing

Nexez already supports pre-known quantity pricing. Metered post-consumption charging is a separate ledger problem and the current curation evidence is too thin to universalize it.

**Decision:** defer.

### Route optimization

Delivery and service areas matter; route planning/optimization is currently a category-operational concern rather than a universal commerce contract.

**Decision:** defer while the curation signal remains isolated.

## Recommended implementation order

This is a design queue, not an instruction to implement every missing concept before template expansion.

### Track A — recurring-service contract — **implemented**

The merchant-authored recurring-service contract now spans configuration, approval, Stripe subscription settlement, paid-period provenance, and buyer cancellation controls. Continue hardening the existing rail rather than reopening the architecture problem.

### Track B — conditional fulfillment — **implemented**

Merchant-authored predicates now evaluate canonical required buyer inputs before pricing/approval/settlement with deterministic eligible/review/ineligible outcomes across one-time and recurring checkout.

### Track C — staged settlement — **implemented**

Deposit schedules and milestones now resolve into sequential, immutable, buyer-approved obligations allocated from one authoritative total, with live checkout and webhook provenance.

### Track D — reservable resources — **implemented**

Merchant-owned interchangeable pools, exact requirements, expiring atomic holds, and settlement conversion now preserve current weekly booking caps and external calendar authority. Continue hardening the rail rather than widening it into serialized inventory or operations planning.

### Track E — multi-provider orchestration

Defer unless template selection forces the issue. It changes the transaction topology and should not be smuggled into a “schema cleanup” PR.

## Simulator implication

Every primitive that becomes transaction-real should become observable through the public simulator by reusing the same production intelligence/evaluation path. The simulator must not create a second demo-only interpretation of merchant policy.

Reservable resources are now a production-path proof surface: the simulator advertises that availability requires the authoritative dry-run, and MCP executes that same dry-run to acquire a real expiring hold. It never renders a hold or committed reservation from template metadata.

## Promotion implications

Party Rentals is now the first post-pilot CommerceTemplate. It was selected because it:

1. exercises already-first-class conditional-fulfillment, staged-settlement, and reservable-resource rails without requiring multi-provider orchestration;
2. receives the same routing → intelligence → configuration → pricing → buyer-preflight benchmark treatment as the seven pilots;
3. keeps merchant inventory, availability, delivery guarantees, prices, and damage/security terms outside template authority; and
4. proves resource-backed immediate checkout and merchant-confirmed staged payment as separate v1 offer paths instead of combining incompatible contracts.

That keeps expansion diagnostic: when the next template fails, Nexez learns exactly which commercial primitive broke instead of debugging five new abstractions at once.

## Analysis boundaries

The curation analysis itself does not:

- add or activate a CommerceTemplate;
- change `CommerceCapability` merely to mirror a gap-signal name;
- treat runtime implementation details as new template evidence;
- collapse checkout, pricing, settlement, scheduling, and operational planning into one schema;
- treat seller claims or template knowledge as merchant truth;
- claim a concept is first-class because a template enum contains its name rather than an enforced runtime.

The next implementation decision should come from live Party Rentals evidence: deepen the existing rails where the controlled merchant flow exposes a real gap, or promote another template that tests a different commercial pattern. Multi-provider orchestration remains deferred until a selected pattern truly requires it.
