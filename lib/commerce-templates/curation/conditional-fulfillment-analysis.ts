import { commerceCurationCandidates } from './index'
import type { CommerceCurationGapSignal } from './types'

export const CONDITIONAL_FULFILLMENT_AUTOPSY_VERSION = 1 as const

export type ConditionalFulfillmentPressure =
  | 'buyer-answer-policy'
  | 'prerequisite-evidence'
  | 'live-state'
  | 'dependent-workflow'

export type ConditionalFulfillmentV1Coverage = 'direct' | 'partial' | 'adjacent-primitive'

export type ConditionalFulfillmentCandidateFinding = {
  candidateId: string
  primaryPressure: ConditionalFulfillmentPressure
  v1Coverage: ConditionalFulfillmentV1Coverage
  rationale: string
  adjacentSignals: CommerceCurationGapSignal[]
}

/**
 * Human-reviewed decomposition of the 16 curated conditional-fulfillment
 * signals. Counts and candidate metadata are still derived from the #80 corpus;
 * this list records only the architecture interpretation that cannot be inferred
 * mechanically from the signal name alone.
 */
export const conditionalFulfillmentCandidateFindings: ConditionalFulfillmentCandidateFinding[] = [
  {
    candidateId: 'home.move-out-cleaning',
    primaryPressure: 'buyer-answer-policy',
    v1Coverage: 'direct',
    rationale: 'Deadline, access, handoff, and property-context answers can deterministically block or require review before settlement.',
    adjacentSignals: [],
  },
  {
    candidateId: 'home.emergency-plumbing',
    primaryPressure: 'live-state',
    v1Coverage: 'partial',
    rationale: 'Buyer triage answers are evaluable, but live availability and diagnostic uncertainty must remain separate runtime/workflow concerns.',
    adjacentSignals: ['inspection-first'],
  },
  {
    candidateId: 'home.lawn-care-subscription',
    primaryPressure: 'buyer-answer-policy',
    v1Coverage: 'partial',
    rationale: 'Property and seasonal answers can gate eligibility, while exact geography/resource availability should not be faked by the condition evaluator.',
    adjacentSignals: ['recurrence-terms'],
  },
  {
    candidateId: 'home.appliance-repair',
    primaryPressure: 'dependent-workflow',
    v1Coverage: 'partial',
    rationale: 'Model/type answers can gate intake, but inspection-to-follow-up authorization is a separate transaction-lineage problem.',
    adjacentSignals: ['inspection-first'],
  },
  {
    candidateId: 'automotive.mobile-brake-service',
    primaryPressure: 'buyer-answer-policy',
    v1Coverage: 'partial',
    rationale: 'Merchant-declared vehicle fitment can be evaluated from buyer inputs; regulated or safety qualification cannot be inferred by the rule layer.',
    adjacentSignals: ['regulated-qualification'],
  },
  {
    candidateId: 'automotive.pre-purchase-inspection',
    primaryPressure: 'prerequisite-evidence',
    v1Coverage: 'direct',
    rationale: 'Required vehicle/location/reference evidence can fail closed before checkout without pretending an opaque asset reference has been substantively verified.',
    adjacentSignals: ['document-requirements'],
  },
  {
    candidateId: 'automotive.mobile-tire-service',
    primaryPressure: 'live-state',
    v1Coverage: 'partial',
    rationale: 'Vehicle compatibility inputs can be evaluated, but actual tire availability requires the future reservable-resource primitive.',
    adjacentSignals: ['inventory-resource'],
  },
  {
    candidateId: 'events.party-rentals',
    primaryPressure: 'live-state',
    v1Coverage: 'adjacent-primitive',
    rationale: 'The decisive question is finite inventory availability and reservation, not a static buyer-answer rule.',
    adjacentSignals: ['inventory-resource', 'capacity-constraints', 'deposit-schedule'],
  },
  {
    candidateId: 'events.proposal-setup',
    primaryPressure: 'live-state',
    v1Coverage: 'partial',
    rationale: 'Location/access answers can gate the request, while decor inventory must be resolved by resource state rather than a merchant-authored literal rule.',
    adjacentSignals: ['inventory-resource'],
  },
  {
    candidateId: 'professional.tax-preparation',
    primaryPressure: 'prerequisite-evidence',
    v1Coverage: 'partial',
    rationale: 'Entity/readiness answers and required evidence presence can gate intake, but secure typed documents and professional qualification stay outside v1.',
    adjacentSignals: ['document-requirements', 'regulated-qualification'],
  },
  {
    candidateId: 'professional.web-design-project',
    primaryPressure: 'prerequisite-evidence',
    v1Coverage: 'direct',
    rationale: 'Merchant-required assets and project-readiness answers can deterministically stop autonomous checkout or route the buyer to review.',
    adjacentSignals: ['document-requirements', 'milestones'],
  },
  {
    candidateId: 'professional.ai-automation-implementation',
    primaryPressure: 'prerequisite-evidence',
    v1Coverage: 'direct',
    rationale: 'Integration/data-access readiness can be represented as required merchant-authored buyer evidence before an autonomous transaction proceeds.',
    adjacentSignals: ['document-requirements', 'milestones'],
  },
  {
    candidateId: 'pet.pet-sitting',
    primaryPressure: 'buyer-answer-policy',
    v1Coverage: 'direct',
    rationale: 'Pet profile, medication, overnight, and access answers can deterministically require review or make the declared offer ineligible.',
    adjacentSignals: ['capacity-constraints'],
  },
  {
    candidateId: 'commercial.pressure-washing',
    primaryPressure: 'buyer-answer-policy',
    v1Coverage: 'direct',
    rationale: 'Surface type, access, and water-availability answers are merchant-authored intake facts that can be deterministically evaluated before pricing/checkout.',
    adjacentSignals: [],
  },
  {
    candidateId: 'commercial.pest-control',
    primaryPressure: 'dependent-workflow',
    v1Coverage: 'partial',
    rationale: 'Property/pest answers can gate intake, but inspection transitions and regulated treatment authority are separate primitives.',
    adjacentSignals: ['regulated-qualification', 'inspection-first', 'recurrence-terms'],
  },
  {
    candidateId: 'commercial.property-turnover-service',
    primaryPressure: 'dependent-workflow',
    v1Coverage: 'adjacent-primitive',
    rationale: 'The dominant complexity is multi-provider, inventory, and milestone orchestration; a buyer-answer rule layer alone would create false coverage.',
    adjacentSignals: ['multi-provider-orchestration', 'milestones', 'inventory-resource'],
  },
]

export type ConditionalFulfillmentV1Decision = 'eligible' | 'requires-review' | 'ineligible'

/**
 * Proposed v1 boundary for the implementation PR. This is intentionally a
 * constrained decision contract, not an executable-programming or workflow DSL.
 */
export const conditionalFulfillmentV1Contract = {
  merchantTruth: 'Rules are explicitly merchant-authored offer configuration and must be preserved across AI/site-sync proposal merges.',
  evaluatorInput: 'Rules consume only the normalized checkout-time OfferTransactionConfiguration produced from the authoritative offer schema.',
  inputSource: 'buyer-input',
  referencedInputPolicy: 'Every v1 rule must reference an existing required OfferInputField so missing evidence is handled by the existing configuration validator before rule evaluation.',
  decisions: ['eligible', 'requires-review', 'ineligible'] as ConditionalFulfillmentV1Decision[],
  defaultDecision: 'eligible' as ConditionalFulfillmentV1Decision,
  severityOrder: ['eligible', 'requires-review', 'ineligible'] as ConditionalFulfillmentV1Decision[],
  reviewBehavior: 'requires-review blocks autonomous settlement and returns stable reason/next-action metadata; existing negotiation/contact surfaces may be reused when available, but v1 does not invent a universal review queue.',
  approvalBinding: 'The deterministic fulfillment decision and rule/configuration fingerprints must be recomputed before approval and settlement so buyer approval cannot authorize a different eligibility result.',
  evaluationOrder: [
    'validate-and-canonicalize-buyer-configuration',
    'evaluate-merchant-fulfillment-rules',
    'resolve-deterministic-pricing',
    'dry-run-and-bind-buyer-approval',
    'settle-only-if-eligible',
  ],
  operatorsByValueType: {
    boolean: ['equals'],
    'single-select': ['equals', 'in'],
    'multi-select': ['contains', 'contains-any', 'contains-all'],
    number: ['equals', 'lt', 'lte', 'gt', 'gte'],
    quantity: ['equals', 'lt', 'lte', 'gt', 'gte'],
    text: ['present'],
    location: ['present'],
    asset: ['present'],
    date: ['before', 'on-or-before', 'on-or-after', 'after'],
    'date-time': ['before', 'on-or-before', 'on-or-after', 'after'],
  },
  exclusions: [
    'arbitrary-javascript-or-expression-language',
    'llm-or-fuzzy-rule-evaluation',
    'cross-field-formulas',
    'conditional-pricing',
    'conditional-field-visibility-or-dynamic-requiredness',
    'service-area-geocoding-or-distance-computation',
    'inventory-or-resource-reservation',
    'credential-or-document-authenticity-verification',
    'inspection-to-follow-up-lineage',
    'multi-provider-orchestration',
    'automatic-workflow-mutation',
  ],
} as const

function conditionalCandidates() {
  return commerceCurationCandidates.filter((candidate) => candidate.gapSignals.includes('conditional-fulfillment'))
}

export function analyzeConditionalFulfillmentPressure() {
  const candidates = new Map(conditionalCandidates().map((candidate) => [candidate.id, candidate] as const))
  return conditionalFulfillmentCandidateFindings.map((finding) => {
    const candidate = candidates.get(finding.candidateId)
    if (!candidate) throw new Error(`Conditional-fulfillment autopsy references unknown candidate ${finding.candidateId}`)
    return {
      ...finding,
      ordinal: candidate.ordinal,
      title: candidate.title,
      domain: candidate.domain,
      status: candidate.status,
      capabilityTags: candidate.capabilityTags,
      observedGapSignals: candidate.gapSignals,
    }
  })
}

export function summarizeConditionalFulfillmentPressure() {
  const entries = analyzeConditionalFulfillmentPressure()
  const pressureKinds: ConditionalFulfillmentPressure[] = [
    'buyer-answer-policy',
    'prerequisite-evidence',
    'live-state',
    'dependent-workflow',
  ]
  const coverageKinds: ConditionalFulfillmentV1Coverage[] = ['direct', 'partial', 'adjacent-primitive']
  return {
    version: CONDITIONAL_FULFILLMENT_AUTOPSY_VERSION,
    candidateCount: entries.length,
    pressureCounts: Object.fromEntries(
      pressureKinds.map((pressure) => [pressure, entries.filter((entry) => entry.primaryPressure === pressure).length]),
    ) as Record<ConditionalFulfillmentPressure, number>,
    coverageCounts: Object.fromEntries(
      coverageKinds.map((coverage) => [coverage, entries.filter((entry) => entry.v1Coverage === coverage).length]),
    ) as Record<ConditionalFulfillmentV1Coverage, number>,
    directCandidateIds: entries.filter((entry) => entry.v1Coverage === 'direct').map((entry) => entry.candidateId),
    adjacentPrimitiveCandidateIds: entries.filter((entry) => entry.v1Coverage === 'adjacent-primitive').map((entry) => entry.candidateId),
  }
}
