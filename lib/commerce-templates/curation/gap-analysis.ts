import { commerceCurationCandidates } from './index'
import type { CommerceCurationGapSignal } from './types'

export const COMMERCE_SCHEMA_GAP_ANALYSIS_VERSION = 2 as const

export type CommerceSchemaGapDisposition =
  | 'first-class'
  | 'weakly-structured'
  | 'broadly-missing'
  | 'not-justified'

export type CommerceSchemaGapAction =
  | 'no-schema-change'
  | 'harden-existing'
  | 'design-primitive'
  | 'defer'

export type CommerceSchemaGapFinding = {
  signal: CommerceCurationGapSignal
  disposition: CommerceSchemaGapDisposition
  action: CommerceSchemaGapAction
  currentRepresentation: string
  missingBehavior: string | null
  recommendation: string
  evidence: string[]
}

export type CommerceSchemaGapAnalysisEntry = CommerceSchemaGapFinding & {
  candidateCount: number
  candidateIds: string[]
}

/**
 * Architecture findings grounded in production code. Candidate counts/ids are
 * deliberately NOT stored here; they are derived from the #80 curation corpus.
 */
export const commerceSchemaGapFindings: CommerceSchemaGapFinding[] = [
  {
    signal: 'customer-requirements',
    disposition: 'first-class',
    action: 'no-schema-change',
    currentRepresentation: 'Merchant-authored OfferInputField schemas are typed, validated, exposed to agents, and buyer answers are canonicalized into transaction snapshots.',
    missingBehavior: null,
    recommendation: 'Keep extending the existing OfferInputField rail rather than creating a parallel requirement model.',
    evidence: ['lib/offer-configuration.ts', 'lib/offer-transaction-configuration.ts', 'lib/agent-offer-configuration.ts'],
  },
  {
    signal: 'recurrence-terms',
    disposition: 'first-class',
    action: 'no-schema-change',
    currentRepresentation: 'Merchant-authored recurring-service terms are validated against offer inputs, exposed to agents, resolved into an approval-bound agreement snapshot, settled through a dedicated Stripe subscription checkout, and reconciled into paid service-period order lineage.',
    missingBehavior: null,
    recommendation: 'Treat the recurring-service contract as the canonical recurrence rail and harden/extend it rather than creating a second subscription model for merchant services.',
    evidence: ['lib/recurring-service.ts', 'app/api/service-agreements/checkout/route.ts', 'lib/server/service-agreement-webhook.ts'],
  },
  {
    signal: 'conditional-fulfillment',
    disposition: 'broadly-missing',
    action: 'design-primitive',
    currentRepresentation: 'OfferInputField can declare that an answer affects eligibility/scope/availability and narrow booking constraints can block selected runtime states, but buyer-answer eligibility remains descriptive rather than an executable merchant contract.',
    missingBehavior: 'No merchant-authored predicate layer evaluates canonical required buyer inputs into a stable eligible/requires-review/ineligible decision that is bound through approval and settlement.',
    recommendation: 'Implement the bounded buyer-input decision layer defined by the conditional-fulfillment autopsy; keep inventory, trust/qualification, inspection lineage, and multi-provider workflow state in their own authoritative primitives.',
    evidence: ['lib/offer-configuration.ts', 'lib/offer-transaction-configuration.ts', 'lib/commerce-templates/curation/conditional-fulfillment-analysis.ts'],
  },
  {
    signal: 'structured-modifiers',
    disposition: 'first-class',
    action: 'no-schema-change',
    currentRepresentation: 'Independent select, boolean, and quantity modifiers have a constrained merchant-authored deterministic pricing DSL and exact checkout-time provenance.',
    missingBehavior: null,
    recommendation: 'Treat cross-field dependencies separately under conditional fulfillment rather than expanding the pricing DSL prematurely.',
    evidence: ['lib/offer-configuration.ts', 'lib/offer-configuration-pricing.ts'],
  },
  {
    signal: 'milestones',
    disposition: 'broadly-missing',
    action: 'design-primitive',
    currentRepresentation: 'CommerceTemplate names milestone pricing/payment semantics and OfferRules can cap project weeks, but runtime settlement still resolves one agreed amount.',
    missingBehavior: 'No merchant-authored milestone schedule binds deliverables, amounts, approvals, due conditions, and staged capture through the transaction lifecycle.',
    recommendation: 'Design milestone settlement as a staged transaction primitive, preferably sharing machinery with deposits rather than inventing category-specific flows.',
    evidence: ['lib/commerce-templates/schema.ts', 'lib/agent-page.ts', 'lib/settlement.ts'],
  },
  {
    signal: 'capacity-constraints',
    disposition: 'weakly-structured',
    action: 'harden-existing',
    currentRepresentation: 'Smart Rules enforce maxBookingsPerWeek and Calendly can deterministically derive available/limited/sold_out from that cap.',
    missingBehavior: 'Capacity is a booking-count ceiling only; there is no general quantity, staff, vehicle, room, equipment, or concurrent-resource reservation model.',
    recommendation: 'Generalize only after inventory/resource requirements are designed; preserve the existing weekly-cap path as a valid narrow primitive.',
    evidence: ['lib/offer-rules.ts', 'lib/calendly-availability.ts', 'lib/agent-page.ts'],
  },
  {
    signal: 'document-requirements',
    disposition: 'weakly-structured',
    action: 'harden-existing',
    currentRepresentation: 'OfferInputField supports required asset inputs and transaction validation preserves an asset reference in the approved configuration snapshot.',
    missingBehavior: 'The asset value is an opaque string/reference; the commerce contract does not type document class, secure collection, validation, expiry, or access policy.',
    recommendation: 'Keep the requirement on OfferInputField, then add secure typed asset semantics only when real promoted templates require them.',
    evidence: ['lib/offer-configuration.ts', 'lib/offer-transaction-configuration.ts'],
  },
  {
    signal: 'inventory-resource',
    disposition: 'broadly-missing',
    action: 'design-primitive',
    currentRepresentation: 'Inventory/capacity exist as template-level concepts and offers can publish generic attributes, but there is no reservable resource ledger tied to commerce actions.',
    missingBehavior: 'No deterministic reservation/allocation protects finite units, equipment, rooms, vehicles, staff slots, or other resources from oversubscription.',
    recommendation: 'Design a generalized reservable-resource primitive before inventory-rental or equipment-heavy templates become active.',
    evidence: ['lib/commerce-templates/schema.ts', 'lib/configured-offer.ts', 'lib/agent-page.ts'],
  },
  {
    signal: 'regulated-qualification',
    disposition: 'weakly-structured',
    action: 'harden-existing',
    currentRepresentation: 'Pages can carry seller-supplied credential records and reviewed metadata, while offer attributes can describe public merchant facts.',
    missingBehavior: 'Seller-writable credential metadata is explicitly not authoritative trust evidence and is not bound to offer eligibility or jurisdiction-specific transaction rules.',
    recommendation: 'Strengthen verified credential authority in the trust layer and reference it from commerce; do not copy qualification truth into templates.',
    evidence: ['lib/agent-page.ts', 'lib/offer-configuration.ts'],
  },
  {
    signal: 'quantity-pricing',
    disposition: 'first-class',
    action: 'no-schema-change',
    currentRepresentation: 'Quantity buyer inputs are validated as bounded integers and quantity-delta pricing deterministically applies merchant-authored unit deltas above an included quantity.',
    missingBehavior: null,
    recommendation: 'Use the current quantity rail for pre-known quantities; keep post-consumption metering separate under usage pricing.',
    evidence: ['lib/offer-configuration.ts', 'lib/offer-transaction-configuration.ts', 'lib/offer-configuration-pricing.ts'],
  },
  {
    signal: 'contract-terms',
    disposition: 'weakly-structured',
    action: 'harden-existing',
    currentRepresentation: 'Negotiation accepts bounded requestedTerms as a generic object and OfferRules expose included/excluded scope plus selected public constraints.',
    missingBehavior: 'Term semantics are not typed, comparable, approval-bound by field, or independently enforceable after agreement.',
    recommendation: 'Define a small typed term vocabulary only for repeated transaction-critical terms; retain free-form negotiation for the long tail.',
    evidence: ['lib/negotiation-input.ts', 'lib/offer-rules.ts', 'lib/agent-page.ts'],
  },
  {
    signal: 'inspection-first',
    disposition: 'weakly-structured',
    action: 'harden-existing',
    currentRepresentation: 'Templates can mark diagnostic/quote semantics and merchants can sell a diagnostic offer or collect condition inputs.',
    missingBehavior: 'There is no explicit transaction dependency that converts a completed inspection/diagnostic into an authorized scoped follow-up offer or quote.',
    recommendation: 'Model inspection-to-follow-up linkage only after a promoted diagnostic service proves the shared transition contract.',
    evidence: ['lib/commerce-templates/schema.ts', 'lib/offer-configuration.ts', 'lib/settlement.ts'],
  },
  {
    signal: 'minimum-charge',
    disposition: 'weakly-structured',
    action: 'harden-existing',
    currentRepresentation: 'Offers have a base/listed price and negotiable offers may privately enforce minPrice, while deterministic modifiers add to a base amount.',
    missingBehavior: 'There is no public merchant-authored minimum-charge rule for unit/configuration pricing independent of private negotiation floors.',
    recommendation: 'Extend deterministic pricing with a constrained minimum-final-amount rule only if promoted templates prove base price cannot express the need cleanly.',
    evidence: ['lib/agent-page.ts', 'lib/offer-rules.ts', 'lib/offer-configuration-pricing.ts'],
  },
  {
    signal: 'distance-travel-fee',
    disposition: 'weakly-structured',
    action: 'harden-existing',
    currentRepresentation: 'OfferItem carries a flat travelFee/serviceArea and buyer configuration supports a location input.',
    missingBehavior: 'No deterministic origin/destination, zone, threshold, or per-distance rule converts buyer location into an exact merchant-authored fee.',
    recommendation: 'Preserve flat travel fees; add deterministic zone/distance pricing only when several promoted mobile-service templates need the same rule.',
    evidence: ['lib/agent-page.ts', 'lib/offer-configuration.ts', 'lib/offer-configuration-pricing.ts'],
  },
  {
    signal: 'multi-unit-booking',
    disposition: 'weakly-structured',
    action: 'harden-existing',
    currentRepresentation: 'Quantity inputs and unit pricing can represent how many guests/items/sessions a buyer wants.',
    missingBehavior: 'A scalar quantity does not identify individual units, attach per-unit configuration, or reserve per-unit capacity/resources.',
    recommendation: 'Do not invent a generic unit graph yet; first separate simple quantity commerce from cases that truly require per-unit identity.',
    evidence: ['lib/offer-transaction-configuration.ts', 'lib/offer-configuration.ts'],
  },
  {
    signal: 'usage-rights',
    disposition: 'weakly-structured',
    action: 'harden-existing',
    currentRepresentation: 'CommerceTemplate has a LICENSING capability and merchants can publish rights text/attributes as merchant truth.',
    missingBehavior: 'Rights are not a typed grant with medium, territory, duration, exclusivity, transferability, or approval-bound usage terms.',
    recommendation: 'Add a compact rights contract only after multiple creative-service promotions demonstrate stable shared dimensions.',
    evidence: ['lib/commerce-templates/schema.ts', 'lib/offer-configuration.ts'],
  },
  {
    signal: 'qualification-fit',
    disposition: 'weakly-structured',
    action: 'harden-existing',
    currentRepresentation: 'Merchant attributes and eligibility-affecting buyer inputs can describe provider specialty and buyer needs.',
    missingBehavior: 'No deterministic fit policy evaluates the two sides and returns supported/unsupported/needs-review without inventing merchant capability.',
    recommendation: 'Build fit evaluation from verified merchant facts plus buyer inputs, not from template expectations.',
    evidence: ['lib/offer-configuration.ts', 'lib/offer-transaction-configuration.ts'],
  },
  {
    signal: 'multi-provider-orchestration',
    disposition: 'broadly-missing',
    action: 'design-primitive',
    currentRepresentation: 'CommerceTemplate can identify multi-provider commerce, but transactions still bind to one merchant offer and one settlement path.',
    missingBehavior: 'No transaction-level provider graph coordinates responsibility, availability, allocation, approval, or settlement across multiple providers.',
    recommendation: 'Keep this out of the first post-pilot expansion unless a chosen template genuinely requires orchestration; then design it as a larger product slice.',
    evidence: ['lib/commerce-templates/schema.ts', 'lib/settlement.ts'],
  },
  {
    signal: 'deposit-schedule',
    disposition: 'broadly-missing',
    action: 'design-primitive',
    currentRepresentation: 'CommerceTemplate names deposit-balance and milestone payment modes, while current checkout/negotiated settlement funds one amount at a time.',
    missingBehavior: 'No merchant-authored staged payment schedule binds deposit amount/rate, remaining balance, due conditions, or later captures to one transaction contract.',
    recommendation: 'Design deposits together with milestone settlement so staged payments share one approval/provenance model.',
    evidence: ['lib/commerce-templates/schema.ts', 'lib/settlement.ts'],
  },
  {
    signal: 'usage-pricing',
    disposition: 'not-justified',
    action: 'defer',
    currentRepresentation: 'Pre-known quantity/unit pricing is deterministic, but post-consumption metering is not a transaction primitive.',
    missingBehavior: 'No metered usage ledger calculates a final charge from consumption after service begins.',
    recommendation: 'Do not add metering from two curation signals; revisit if managed IT/automation or another promoted template produces a stable shared need.',
    evidence: ['lib/offer-configuration-pricing.ts', 'lib/commerce-templates/curation/index.ts'],
  },
  {
    signal: 'route-optimization',
    disposition: 'not-justified',
    action: 'defer',
    currentRepresentation: 'Delivery/service-area concepts exist, but routing is not part of the commerce transaction model.',
    missingBehavior: 'No route planner or route-capacity optimizer coordinates stops.',
    recommendation: 'Keep routing outside universal Commerce Schema while only one curated candidate signals the need.',
    evidence: ['lib/agent-page.ts', 'lib/commerce-templates/curation/index.ts'],
  },
]

function candidatesForSignal(signal: CommerceCurationGapSignal) {
  return commerceCurationCandidates.filter((candidate) => candidate.gapSignals.includes(signal))
}

export function analyzeCommerceSchemaGaps(): CommerceSchemaGapAnalysisEntry[] {
  return commerceSchemaGapFindings.map((finding) => {
    const candidates = candidatesForSignal(finding.signal)
    return {
      ...finding,
      candidateCount: candidates.length,
      candidateIds: candidates.map((candidate) => candidate.id),
    }
  })
}

export function summarizeCommerceSchemaGaps() {
  const entries = analyzeCommerceSchemaGaps()
  const dispositions: CommerceSchemaGapDisposition[] = [
    'first-class',
    'weakly-structured',
    'broadly-missing',
    'not-justified',
  ]

  return {
    version: COMMERCE_SCHEMA_GAP_ANALYSIS_VERSION,
    signalCount: entries.length,
    dispositionCounts: Object.fromEntries(
      dispositions.map((disposition) => [
        disposition,
        entries.filter((entry) => entry.disposition === disposition).length,
      ]),
    ) as Record<CommerceSchemaGapDisposition, number>,
    designPrimitiveSignals: entries
      .filter((entry) => entry.action === 'design-primitive')
      .map((entry) => entry.signal),
    deferredSignals: entries
      .filter((entry) => entry.action === 'defer')
      .map((entry) => entry.signal),
  }
}
