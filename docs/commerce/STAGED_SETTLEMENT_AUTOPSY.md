# Nexez Staged Settlement Autopsy

**Status:** Architecture and merchant-contract v1 - payment ledger/capture remains intentionally inactive
**Machine-readable source:** `lib/commerce-templates/curation/staged-settlement-analysis.ts`
**Evidence corpus:** every curated candidate with the `DEPOSIT` capability or a `milestones` / `deposit-schedule` gap signal, plus current checkout, negotiation, approval, and order rails

## Purpose

Nexez templates already describe deposits and milestones, but production settlement still treats one payment as one completed commercial action. Adding a `depositPercent` field would make the first charge easy while leaving the harder questions unanswered:

- What total did the buyer approve?
- What does each later payment pay for?
- Who makes a later payment payable?
- Can the merchant change the schedule after collecting money?
- How do refunds, disputes, and order provenance map back to the whole engagement?

The smallest honest primitive is not a deposit flag. It is an immutable, ordered set of payment obligations allocated from one authoritative agreed total.

## Corpus result

Nineteen of the 63 curated service patterns show deposit or milestone pressure. They separate into four materially different families:

| Pressure | Count | What it is really asking for |
|---|---:|---|
| reservation commitment | 5 | Collect an upfront installment toward a known service total, then collect the balance later. |
| deliverable milestones | 7 | Tie sequential payments to named project outputs or phases. |
| program progress | 3 | Pay across a finite program, while avoiding overlap with open-ended recurring billing. |
| dependent topology | 4 | Coordinate inventory security, multiple providers, procurement, or other systems a payment schedule cannot own. |

The bounded v1 meaningfully covers nine candidates, partially covers seven, and must abstain from three whose dominant need is another primitive.

## Terms that must not be collapsed

### Installment or booking deposit

Money paid now counts toward one agreed total. This belongs in staged settlement.

### Milestone payment

Money becomes payable for a named sequential obligation under the same agreed total. This belongs in staged settlement when the buyer separately approves the charge.

### Refundable security or damage deposit

Money is held against a contingent liability and may be returned without becoming merchant revenue. Party rentals expose this need. It belongs with reservable resources, explicit hold/release policy, and regulated payment handling, not v1 staged settlement.

### Escrow or manual capture

Authorization is held before a later capture decision. Existing negotiated escrow is a separate settlement posture. V1 does not reuse an authorization hold as a long-running milestone schedule.

### Subscription or recurring billing

An open-ended cadence repeats until cancellation. The recurring-service contract already owns this behavior. Staged settlement is finite and exhausts an agreed total.

## Existing rails to compose

### Authoritative amount

Configured checkout can derive an exact deterministic price, and negotiation can establish an agreed amount. Staged settlement must consume one of those results; it must not introduce another pricing engine.

### Buyer approval

Nexez already binds approval to exact action input. Every staged charge needs a fresh approval bound to the agreement, schedule fingerprint, obligation, amount, currency, and paid predecessor lineage.

### Conditional fulfillment

Eligibility remains upstream. An ineligible or review-required configuration cannot create a payable staged agreement.

### Stripe Connect settlement

Each approved obligation may create one normal immediate-capture payment through the current connected-account settlement context. V1 does not save a card or autonomously charge a later stage.

### Order, refund, and dispute provenance

Existing checkout orders assume one payment is the transaction. Staged settlement needs an agreement parent and ordered obligation children, while every payment still retains its own refund/dispute lineage.

## Proposed v1 contract

### Source of truth

Schedules are explicit merchant-authored offer configuration. AI proposal, site-sync, and Nexxi merge paths may preserve them but must never invent, rewrite, or activate them.

### Allocation

- Two to five ordered obligations.
- Each obligation has a unique stable ID, buyer-safe label, stage kind, and positive basis-point allocation.
- Allocations sum to exactly `10,000` basis points.
- Resolved amounts are calculated in declared order; the final obligation receives the rounding remainder so the schedule equals the approved total exactly.
- At most one `commitment` stage, and if present it is first.
- Exactly one `completion` stage, and it is last.

Basis points avoid category-specific money fields and allow the same schedule to resolve against deterministic or negotiated totals. Runtime snapshots contain the exact resolved smallest-unit amounts.

### Sequential lifecycle

One agreement owns an ordered set of obligations. Only one obligation may be payable at a time.

Suggested obligation states:

`pending → ready-for-buyer-approval → approved → payment-pending → paid`

An obligation may also become `cancelled`, `refunded`, or `disputed` through explicit authoritative events.

The first obligation may become ready when the agreement is created. For later obligations:

1. the merchant declares the named deliverable ready;
2. Nexez presents the exact obligation and amount to the buyer;
3. the buyer explicitly approves that charge;
4. Nexez creates one payable session;
5. authoritative payment completion marks the obligation paid;
6. only then may the next obligation become ready.

V1 has no timer that silently charges a buyer and no model inference that declares work complete.

### Mutation

Before payment, a merchant may edit an offer schedule and a buyer may receive a newly resolved dry run. After the first successful payment, the agreement total, currency, allocation, labels, and ordering are immutable. A change order requires a new agreement rather than retroactively rewriting paid commercial history.

### Completion

The agreement is complete only when every obligation is paid. A paid deposit does not make the full service look paid, and an open balance does not make the first payment disappear.

## Transaction order

1. validate merchant-authored schedule;
2. validate/canonicalize buyer configuration and conditional fulfillment;
3. resolve one authoritative total and currency;
4. allocate exact stage amounts;
5. dry-run and bind agreement plus first-obligation approval;
6. settle one explicitly approved obligation;
7. record its payment lineage;
8. activate the next obligation only after the prior one is paid;
9. complete the agreement only after all obligations are paid.

## Public and agent contract

Agent surfaces may expose:

- schedule schema version and fingerprint;
- stage IDs, order, labels, kinds, and allocations;
- exact resolved amounts only after an authoritative total exists;
- current obligation state and safe next action;
- the rule that every payment requires fresh buyer approval.

They must not claim that a future milestone is complete, due, reserved, funded, or automatically chargeable unless the authoritative agreement ledger says so.

## Simulator consequence

The public simulator should consume the same production resolver as checkout. For a configured example it may truthfully show:

`agreed total → booking installment → remaining obligations → buyer approval required for each charge`

It must not animate fake payment completion, invent a merchant schedule from template metadata, or treat a Commerce Library scenario as live payable supply.

## Explicit v1 exclusions

- refundable security or damage deposits;
- escrow, authorization holds, or manual capture;
- automatic off-session or date-triggered charging;
- open-ended recurring billing;
- dynamic totals and in-place change orders;
- arbitrary formulas or free-form payment expressions;
- parallel, optional, or branching stage graphs;
- partial payment inside one obligation;
- multi-provider allocation or split settlement;
- inventory/resource reservation;
- invoice accounting, tax schedules, or revenue recognition;
- model-inferred completion or buyer approval.

## Implementation acceptance criteria

The runtime slice is not first-class until all of the following are true:

1. merchant authoring persists bounded schedules without AI invention;
2. validation rejects duplicate IDs, unsafe labels, invalid ordering, unsupported kinds, unbounded stage counts, and allocations that do not total `10,000`;
3. resolution consumes one authoritative total/currency and deterministically handles rounding;
4. agreement and obligation snapshots are immutable after first payment;
5. only one obligation is payable at a time;
6. each payment requires fresh approval bound to exact schedule/stage/amount/prior-payment lineage;
7. Stripe sessions settle only the current approved obligation;
8. webhook completion, refund, and dispute events map to the exact obligation and agreement;
9. public agent/MCP/OpenAPI surfaces expose the safe contract without private merchant notes;
10. merchant and buyer surfaces distinguish amount paid, current amount due, and remaining total;
11. the simulator uses the production schedule resolver rather than a scripted demo fork;
12. benchmark fixtures prove agents never call a deposit “full payment” or invent future milestone completion;
13. no template is promoted because it merely carries `DEPOSIT` or `MILESTONE` metadata.

## Architecture conclusion

Deposits and milestones are one design family only when every payment is an installment toward one authoritative total. The smallest general primitive is:

> **A finite merchant-authored allocation resolved into sequential, immutable, buyer-approved payment obligations under one agreement lineage.**

This gives Nexez staged commerce without becoming an invoicing language, escrow product, resource manager, or autonomous debt collector.
