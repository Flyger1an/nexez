# Nexez Conditional Fulfillment Autopsy

**Status:** Architecture analysis v1 — no runtime/schema mutation in this PR  
**Machine-readable source:** `lib/commerce-templates/curation/conditional-fulfillment-analysis.ts`  
**Evidence corpus:** the 63-candidate curation matrix plus current production commerce rails

## Purpose

The commerce gap analysis found `conditional-fulfillment` in 16 of 63 curated service patterns. The tempting response would be to add a generic `conditions` field and slowly turn Nexez into an accidental programming language.

This autopsy asks a narrower question:

> **What is the smallest deterministic commerce decision primitive that closes the repeated buyer-eligibility gap without absorbing inventory, trust, inspection workflows, pricing formulas, or multi-provider orchestration?**

The answer is not a general rules engine. It is a merchant-authored, buyer-input-driven **pre-settlement eligibility gate**.

## What the 16 signals actually mean

The curation label compresses four materially different pressures:

| Pressure | Count | What it is really asking for |
|---|---:|---|
| buyer-answer policy | 5 | Evaluate a validated buyer answer against a merchant-declared acceptance/review boundary. |
| prerequisite evidence | 4 | Require a buyer-supplied reference/asset/readiness fact before autonomous settlement. |
| live state | 4 | Resolve mutable availability, inventory, or other runtime state. |
| dependent workflow | 3 | Depend on inspection, regulated authority, milestones, or multi-provider transaction lineage. |

The machine-readable autopsy covers all 16 candidates exactly once and derives their metadata from the curation corpus.

### Buyer-answer policy

Examples include Move-Out Cleaning, Mobile Brake Service, Pet Sitting, and Pressure Washing. These patterns already have the right input rail: merchant-authored `OfferInputField` schemas and normalized buyer transaction data. What is missing is deterministic meaning after validation.

A merchant can currently say:

> `surface_type` affects eligibility

but cannot say:

> if `surface_type = asbestos`, do not allow autonomous checkout.

That is the core v1 gap.

### Prerequisite evidence

Examples include Pre-Purchase Inspection, Tax Preparation, Web Design, and AI Automation Implementation. Nexez can already require an `asset` input and preserve its opaque reference in the transaction snapshot.

V1 may safely answer **whether required evidence was supplied**. It must not claim that an opaque URL is a verified tax document, that a credential is authentic, or that a customer-uploaded file satisfies a regulated requirement. Typed secure-document semantics remain a separate hardening track.

### Live state

Emergency Plumbing, Mobile Tire Service, Party Rentals, and Proposal Setup expose a different problem: some eligibility depends on facts that can change after the merchant authored the offer.

Examples:

- technician availability;
- tire/decor inventory;
- capacity;
- a reservable room, vehicle, or equipment unit.

A static condition rule must never pretend these facts are current. Existing narrow availability rails stay authoritative where they exist; generalized inventory/resource state belongs to the reservable-resource primitive.

### Dependent workflows

Appliance Repair, Pest Control, and Property Turnover show that some “conditions” are actually transaction topology:

- complete an inspection before authorizing repair;
- establish regulated treatment authority;
- coordinate multiple providers/resources/milestones.

Those are not boolean rules. Folding them into conditional fulfillment would create false coverage and make later provenance harder.

## Existing rails we should compose

### 1. Merchant-authored buyer inputs

`OfferInputField` already owns typed buyer questions, requiredness, public descriptions, options, and `affects` metadata.

**Decision:** conditional fulfillment references existing input keys. No second intake schema.

### 2. Canonical transaction validation

`validateOfferTransactionConfiguration` already rejects unknown fields, missing required values, invalid types/options, and canonicalizes accepted answers.

**Decision:** v1 conditions consume only this normalized result. They never inspect arbitrary raw request data.

### 3. Deterministic pricing

The pricing DSL already handles independent option/boolean/quantity deltas with exact provenance.

**Decision:** v1 conditions do **not** change price. Evaluation happens before pricing. Cross-field conditional pricing stays out until evidence proves a stable need.

### 4. Buyer approval binding

Action approval already hashes canonical action input before settlement.

**Decision:** implementation must include the evaluated fulfillment decision plus rule/configuration fingerprints in the approval-bound transaction contract so a later merchant edit cannot turn an approved eligible purchase into a different rule result.

### 5. Narrow availability constraints

`maxBookingsPerWeek`, blackout dates, offer availability, and Calendly-derived states already provide real narrow runtime gating.

**Decision:** preserve them. Conditional fulfillment must compose with them, not replace them.

### 6. Negotiation/contact escape hatches

Nexez already has negotiation and preferred-contact surfaces.

**Decision:** `requires-review` blocks autonomous payment and may return an existing negotiation/contact next action when appropriate. V1 does not create a universal merchant-review queue merely to make the enum look complete.

## Proposed v1 contract

### Source of truth

Rules are explicit merchant-authored offer configuration. AI proposal/site-sync/Nexxi merge paths may preserve these rules but must never invent or overwrite them.

### Input source

V1 evaluates **buyer inputs only**.

Every rule must reference an existing **required** `OfferInputField`. This deliberately pushes missing-evidence behavior onto the existing configuration validator instead of adding conditional requiredness and dynamic forms in the same primitive.

### Decisions

The evaluator returns exactly one terminal decision:

- `eligible` — autonomous settlement may continue;
- `requires-review` — autonomous settlement stops; return stable reasons and a safe next action if one exists;
- `ineligible` — autonomous settlement stops; return stable merchant-authored reason metadata.

No matching rule means `eligible`.

If multiple triggered rules disagree, the stricter result wins:

`ineligible > requires-review > eligible`

All triggered reason codes remain observable for provenance/debugging.

### Rule shape

V1 should be a tiny predicate vocabulary keyed to already-normalized input types, not a free-form expression tree.

Suggested operators:

- boolean: `equals`
- single-select: `equals`, `in`
- multi-select: `contains`, `contains-any`, `contains-all`
- number/quantity: `equals`, `lt`, `lte`, `gt`, `gte`
- text/location/asset: `present` only
- date/date-time: `before`, `on-or-before`, `on-or-after`, `after`

This is enough to express merchant boundaries such as:

- hazardous condition → review;
- unsupported vehicle class → ineligible;
- quantity above service ceiling → review;
- required access reference absent → configuration validation stops before evaluation;
- deadline after merchant cutoff → ineligible.

It is intentionally **not** enough to write business software inside an offer.

## Transaction order

The implementation PR should preserve one deterministic order:

1. validate and canonicalize buyer configuration;
2. evaluate merchant fulfillment rules;
3. stop on `requires-review` / `ineligible`;
4. resolve deterministic pricing only for eligible configuration;
5. dry-run and bind the exact decision/configuration/pricing/rule fingerprint to buyer approval;
6. re-evaluate/re-bind at settlement against the authoritative approved contract;
7. create payment only when the approved decision is still `eligible`.

Recurring checkout must use the same evaluator before creating a service agreement/subscription session. A recurring contract must not bypass a condition simply because its settlement rail is separate.

## Agent contract

Agent-facing offer surfaces should expose enough merchant-authored information to prevent guessing:

- condition identifiers;
- referenced input keys;
- supported predicate/operator and declared comparison value;
- possible blocking/review effect;
- merchant-safe buyer-facing reason/message;
- a clear statement that checkout dry-run is authoritative for the live decision.

The model must never infer a hidden condition from template knowledge or prose.

Dry-run should return a stable machine shape such as:

```json
{
  "fulfillment": {
    "decision": "requires-review",
    "reasons": [
      {
        "ruleId": "large-property-review",
        "code": "property_size_above_standard_scope",
        "message": "Properties above 5,000 sq ft require merchant review."
      }
    ],
    "fingerprint": "..."
  }
}
```

That result becomes part of the approval/preflight contract rather than a conversational suggestion.

## Public simulator consequence

The marketing simulator is now an architectural proof surface, not a separate demo product.

**Acceptance rule:** the simulator must consume the same production offer configuration and fulfillment evaluator used by real agent/checkout flows.

It may present the result conversationally, but it must not have a scripted condition engine or demo-only merchant facts.

That means a future visitor can ask something like:

> “Can I book this service for a 6,200 sq ft property?”

and the simulator can truthfully demonstrate:

`buyer intent → required input → normalized answer → merchant rule → requires review → safe next action`

Every new commerce primitive should compound the simulator this way because the simulator is observing the platform becoming more capable, not faking capability for marketing.

## Explicit v1 exclusions

The implementation PR must not smuggle in:

- arbitrary JavaScript, formulas, CEL/JSONLogic-style expression languages, or model-evaluated prose;
- cross-field formulas;
- conditional pricing;
- dynamic field visibility or “if X, now require Y” form mutation;
- fuzzy semantic matching;
- service-area geocoding or distance computation;
- inventory/resource reservation;
- capacity generalization beyond existing rails;
- document/credential authenticity verification;
- regulated qualification authority;
- inspection-to-follow-up transaction lineage;
- multi-provider orchestration;
- automatic creation/mutation of downstream workflows.

These exclusions are not admissions of failure. They keep ownership boundaries crisp so each later primitive can carry its own truth and provenance.

## Candidate coverage interpretation

The autopsy deliberately labels candidates as:

- **direct** — the v1 buyer-input/evidence gate meaningfully closes the candidate’s conditional gap;
- **partial** — v1 closes a real part of the gap, but another named primitive remains authoritative for the rest;
- **adjacent-primitive** — implementing v1 should not cause Nexez to claim this candidate’s conditional behavior is solved.

Party Rentals remains dominated by reservable inventory. Property Turnover remains dominated by multi-provider/resource/milestone topology. They are useful pressure tests, not reasons to inflate v1.

## Implementation acceptance criteria for the next PR

The implementation slice should not be considered first-class until all of the following are true:

1. merchant authoring persists bounded rules without AI invention;
2. rule validation rejects unknown inputs, unsupported operators/types, duplicate IDs, unsafe messages, and unbounded shapes;
3. evaluator consumes canonical buyer configuration only;
4. outcome severity and reason aggregation are deterministic;
5. one-time checkout dry-run exposes the exact decision/fingerprint;
6. one-time settlement refuses review/ineligible decisions before payment creation;
7. recurring checkout uses the same gate before agreement/session creation;
8. agent.json/MCP/OpenAPI expose the public condition contract without private policy leakage;
9. buyer approval binds the exact rule/configuration/decision state;
10. simulator uses the production evaluator rather than a demo fork;
11. benchmark fixtures prove agents ask for required evidence instead of hallucinating eligibility;
12. no post-pilot template is activated until the primitive survives those rails.

## Architecture conclusion

`conditional-fulfillment` is a real repeated gap, but the curation corpus does **not** justify a universal workflow/rules language.

The smallest high-leverage primitive is:

> **merchant-authored predicates over canonical required buyer inputs that deterministically allow, block, or require review before settlement.**

That gives agents something they currently lack: the ability to distinguish **buyable**, **needs merchant review**, and **not eligible** without inventing merchant policy.

Everything mutable or authoritative outside buyer-input truth—inventory, verified credentials, inspection lineage, provider graphs—must remain owned by the systems designed to know those facts.
