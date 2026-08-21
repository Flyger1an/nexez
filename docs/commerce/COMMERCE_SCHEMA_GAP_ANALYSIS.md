# Nexez Commerce Schema Gap Analysis

**Status:** Architecture analysis v3 — refreshed after conditional-fulfillment implementation and staged-settlement autopsy
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

So recurrence and conditional fulfillment have moved from **broadly missing** to **first-class** because their runtime behavior now exists. The same promotion must not happen for `DEPOSIT`, `MILESTONE`, `INVENTORY`, `MULTI_PROVIDER`, or any other concept until the relevant transaction behavior is equally real.

## Executive result

The current analysis now contains five first-class signals, a large middle of partial support, four remaining missing primitives, and a defer bucket:

| Disposition | Signals |
|---|---|
| first-class | customer requirements; recurrence terms; conditional fulfillment; structured modifiers; quantity pricing |
| weakly structured | capacity constraints; document requirements; regulated qualification; contract terms; inspection-first; minimum charge; distance/travel fee; multi-unit booking; usage rights; qualification fit |
| broadly missing | milestones; inventory/resource reservation; multi-provider orchestration; deposit schedule |
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

### Milestones

The template schema understands milestone-oriented projects; runtime settlement still resolves one agreed amount/path.

The dedicated autopsy in `docs/commerce/STAGED_SETTLEMENT_AUTOPSY.md` analyzes all 19 candidates with deposit or milestone pressure and separates ordinary installments from refundable security, recurring billing, resources, and multi-provider topology.

**Design direction:** a finite merchant-authored allocation resolved into sequential, immutable, buyer-approved payment obligations under one agreement lineage.

### Inventory / resource reservation

The system can describe inventory/capacity concepts but has no transaction-bound reservation/allocation ledger for finite resources.

**Design direction:** generic reservable resource + availability/hold semantics, shared with future capacity work.

### Multi-provider orchestration

A template may identify multi-provider commerce, but one transaction does not coordinate multiple provider responsibilities, availability, allocations, approvals, or settlement.

**Design direction:** explicitly **not automatically next**. This is a larger product slice and should stay missing until a promoted pattern earns it.

### Deposit schedule

Template payment vocabulary includes deposit/balance and milestones, but current payment/settlement machinery handles one payable amount at a time rather than a merchant-authored staged schedule.

**Design direction:** treat a deposit as the first obligation in the bounded staged-settlement contract. Refundable security/damage deposits remain outside v1.

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

### Track C — staged settlement — **next**

The staged-settlement autopsy now defines the bounded v1: **deposit schedules + milestones** become sequential, immutable, buyer-approved obligations allocated from one authoritative total. Implement this contract before promoting it to first-class.

### Track D — reservable resources

Treat **inventory reservation + generalized capacity** as one design family. Keep current weekly booking caps working while the broader abstraction is developed.

### Track E — multi-provider orchestration

Defer unless template selection forces the issue. It changes the transaction topology and should not be smuggled into a “schema cleanup” PR.

## Simulator implication

Every primitive that becomes transaction-real should become observable through the public simulator by reusing the same production intelligence/evaluation path. The simulator must not create a second demo-only interpretation of merchant policy.

Staged settlement should become the next proof surface: the simulator may explain an authoritative total, the current installment, remaining obligations, and fresh-approval requirement only by consuming the same production schedule resolver used by checkout.

## Promotion implications

The first post-pilot CommerceTemplate should not be selected merely because it has the highest curation score. Prefer a candidate that:

1. exercises already-first-class rails plus at most one strategically chosen missing primitive;
2. exposes whether that primitive generalizes across the 63-candidate library;
3. can receive the same routing → intelligence → configuration → pricing/quote → buyer-preflight → checkout/settlement benchmark treatment as the seven pilots;
4. does not require several unrelated missing systems simultaneously.

That keeps expansion diagnostic: when the next template fails, Nexez learns exactly which commercial primitive broke instead of debugging five new abstractions at once.

## Non-goals of this analysis

This PR must not:

- add or activate a CommerceTemplate;
- change `CommerceCapability` merely to mirror a gap-signal name;
- change OfferItem, OfferRules, checkout, pricing, negotiation, settlement, Stripe, or scheduling behavior;
- create migrations;
- treat seller claims or template knowledge as merchant truth;
- claim a concept is first-class because a template enum contains its name.

The next implementation PR should implement the bounded conditional-fulfillment contract from the dedicated autopsy and prove it end-to-end before the active template registry expands.
