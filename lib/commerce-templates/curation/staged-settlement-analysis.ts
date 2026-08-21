import { commerceCurationCandidates } from './index'
import type { CommerceCurationGapSignal } from './types'

export const STAGED_SETTLEMENT_AUTOPSY_VERSION = 1 as const

export type StagedSettlementPressure =
  | 'reservation-commitment'
  | 'deliverable-milestones'
  | 'program-progress'
  | 'dependent-topology'

export type StagedSettlementV1Coverage = 'direct' | 'partial' | 'adjacent-primitive'

export type StagedSettlementCandidateFinding = {
  candidateId: string
  primaryPressure: StagedSettlementPressure
  v1Coverage: StagedSettlementV1Coverage
  rationale: string
  adjacentSignals: CommerceCurationGapSignal[]
}

/**
 * Human-reviewed decomposition of every candidate that either declares the
 * DEPOSIT capability or carries the milestones/deposit-schedule gap. The
 * architecture judgment is explicit; candidate metadata remains derived from
 * the canonical 63-candidate corpus.
 */
export const stagedSettlementCandidateFindings: StagedSettlementCandidateFinding[] = [
  {
    candidateId: 'home.interior-painting',
    primaryPressure: 'deliverable-milestones',
    v1Coverage: 'direct',
    rationale: 'A bounded agreed total can be allocated across kickoff, preparation, and completion without modeling materials as inventory.',
    adjacentSignals: ['quantity-pricing'],
  },
  {
    candidateId: 'home.moving-service',
    primaryPressure: 'reservation-commitment',
    v1Coverage: 'partial',
    rationale: 'An upfront installment can commit the booking, but crew, vehicle, volume, and route truth remain resource and orchestration concerns.',
    adjacentSignals: ['inventory-resource', 'capacity-constraints', 'distance-travel-fee'],
  },
  {
    candidateId: 'automotive.ceramic-coating',
    primaryPressure: 'deliverable-milestones',
    v1Coverage: 'partial',
    rationale: 'A deposit and completion balance are stageable only after the inspection-first scope establishes an authoritative total.',
    adjacentSignals: ['inspection-first', 'document-requirements'],
  },
  {
    candidateId: 'events.event-photography',
    primaryPressure: 'reservation-commitment',
    v1Coverage: 'direct',
    rationale: 'A booking installment and later balance can share one schedule without inventing availability or licensing terms.',
    adjacentSignals: ['usage-rights'],
  },
  {
    candidateId: 'events.wedding-videography',
    primaryPressure: 'deliverable-milestones',
    v1Coverage: 'direct',
    rationale: 'Booking, event coverage, and final delivery are a natural sequential obligation schedule over one agreed amount.',
    adjacentSignals: ['usage-rights'],
  },
  {
    candidateId: 'events.private-chef',
    primaryPressure: 'reservation-commitment',
    v1Coverage: 'direct',
    rationale: 'A non-refundable booking installment and event balance can be represented as payments toward one authoritative total.',
    adjacentSignals: ['capacity-constraints'],
  },
  {
    candidateId: 'events.event-catering',
    primaryPressure: 'reservation-commitment',
    v1Coverage: 'partial',
    rationale: 'A booking installment is stageable, while guest capacity, inventory, and final quantity changes stay outside the payment schedule.',
    adjacentSignals: ['capacity-constraints', 'inventory-resource'],
  },
  {
    candidateId: 'events.event-planning',
    primaryPressure: 'dependent-topology',
    v1Coverage: 'partial',
    rationale: 'Planner fees may be staged, but vendor procurement and multiple-provider responsibility cannot be represented as one merchant payment schedule.',
    adjacentSignals: ['multi-provider-orchestration', 'document-requirements'],
  },
  {
    candidateId: 'events.party-rentals',
    primaryPressure: 'dependent-topology',
    v1Coverage: 'adjacent-primitive',
    rationale: 'The dominant deposit pressure is refundable damage security tied to reservable inventory, not installments toward one service total.',
    adjacentSignals: ['inventory-resource', 'capacity-constraints', 'conditional-fulfillment'],
  },
  {
    candidateId: 'events.corporate-event-production',
    primaryPressure: 'dependent-topology',
    v1Coverage: 'adjacent-primitive',
    rationale: 'Milestone labels do not solve multi-vendor allocations, procurement, inventory, and provider-specific settlement.',
    adjacentSignals: ['multi-provider-orchestration', 'inventory-resource', 'contract-terms'],
  },
  {
    candidateId: 'personal.bridal-beauty-package',
    primaryPressure: 'reservation-commitment',
    v1Coverage: 'direct',
    rationale: 'A booking installment and event-day balance fit a sequential schedule once party size and capacity are resolved.',
    adjacentSignals: ['multi-unit-booking', 'capacity-constraints'],
  },
  {
    candidateId: 'professional.brand-identity-package',
    primaryPressure: 'deliverable-milestones',
    v1Coverage: 'direct',
    rationale: 'Kickoff, concept approval, and final delivery can be explicit buyer-approved obligations over one package total.',
    adjacentSignals: ['usage-rights', 'document-requirements'],
  },
  {
    candidateId: 'professional.web-design-project',
    primaryPressure: 'deliverable-milestones',
    v1Coverage: 'direct',
    rationale: 'The pilot project can prove kickoff, design approval, and launch payments after the negotiated total becomes authoritative.',
    adjacentSignals: ['document-requirements', 'conditional-fulfillment'],
  },
  {
    candidateId: 'professional.video-production',
    primaryPressure: 'deliverable-milestones',
    v1Coverage: 'partial',
    rationale: 'Production stages are payment-addressable, while crew, equipment, and rights remain separate provider/resource/trust contracts.',
    adjacentSignals: ['multi-provider-orchestration', 'inventory-resource', 'usage-rights'],
  },
  {
    candidateId: 'professional.ai-automation-implementation',
    primaryPressure: 'deliverable-milestones',
    v1Coverage: 'direct',
    rationale: 'Discovery, implementation, and handoff can be sequential buyer-approved obligations once the total scope is agreed.',
    adjacentSignals: ['document-requirements', 'conditional-fulfillment', 'usage-pricing'],
  },
  {
    candidateId: 'education.test-prep-program',
    primaryPressure: 'program-progress',
    v1Coverage: 'partial',
    rationale: 'A finite program may use staged obligations, but periodic instruction can be better represented by the existing recurring-service rail.',
    adjacentSignals: ['recurrence-terms'],
  },
  {
    candidateId: 'education.college-admissions-consulting',
    primaryPressure: 'program-progress',
    v1Coverage: 'direct',
    rationale: 'Application phases and review cycles can become sequential obligations under one consulting package total.',
    adjacentSignals: ['document-requirements', 'regulated-qualification'],
  },
  {
    candidateId: 'pet.dog-training',
    primaryPressure: 'program-progress',
    v1Coverage: 'partial',
    rationale: 'Finite training phases may be staged, while open-ended session cadence remains owned by recurring service.',
    adjacentSignals: ['recurrence-terms', 'qualification-fit'],
  },
  {
    candidateId: 'commercial.property-turnover-service',
    primaryPressure: 'dependent-topology',
    v1Coverage: 'adjacent-primitive',
    rationale: 'One schedule cannot truthfully allocate multiple providers, resources, inspections, and handoffs in a turnover project.',
    adjacentSignals: ['multi-provider-orchestration', 'inventory-resource', 'conditional-fulfillment'],
  },
]

/**
 * Bounded v1 architecture. A schedule allocates one authoritative agreed total;
 * it is not an escrow product, an invoicing language, or an automatic workflow.
 */
export const stagedSettlementV1Contract = {
  merchantTruth: 'Schedules are explicit merchant-authored offer configuration and must be preserved across AI/site-sync proposal merges.',
  totalSource: 'The schedule resolves only after deterministic pricing or negotiation establishes one authoritative agreed total and currency.',
  allocation: {
    unit: 'basis-points',
    total: 10_000,
    minimumStages: 2,
    maximumStages: 5,
    rounding: 'Resolve stages in declared order and assign the final-stage remainder so allocations exactly equal the agreed total.',
  },
  stageKinds: ['commitment', 'milestone', 'completion'] as const,
  paymentPolicy: 'Exactly one stage is payable at a time. Every payment requires a fresh buyer approval bound to the agreement, schedule, stage, amount, currency, and prior paid-stage lineage.',
  activationPolicy: 'The first stage may activate at agreement creation. A later stage becomes payable only after the merchant declares its deliverable ready and the buyer explicitly approves that exact obligation.',
  mutationPolicy: 'After the first payment, schedule or total changes require a new agreement; paid obligations are immutable.',
  ledgerPolicy: 'Persist one agreement plus ordered obligations and one payment lineage per obligation; do not overload one-payment checkout_orders into a multi-payment aggregate.',
  evaluationOrder: [
    'validate-merchant-schedule',
    'resolve-authoritative-total-and-currency',
    'allocate-exact-stage-amounts',
    'bind-agreement-and-first-obligation-approval',
    'settle-one-approved-obligation',
    'record-payment-and-activate-next-obligation',
    'complete-only-when-all-obligations-are-paid',
  ],
  exclusions: [
    'refundable-security-or-damage-deposits',
    'escrow-or-manual-capture-holds',
    'automatic-off-session-charging',
    'date-triggered-autonomous-payment',
    'open-ended-or-recurring-billing',
    'dynamic-total-or-change-order-mutation',
    'parallel-or-optional-stage-graphs',
    'partial-payment-within-a-stage',
    'multi-provider-splits',
    'inventory-or-resource-reservation',
    'llm-inferred-stage-completion',
  ],
} as const

function stagedSettlementCandidates() {
  return commerceCurationCandidates.filter((candidate) =>
    candidate.capabilityTags.includes('DEPOSIT')
    || candidate.gapSignals.includes('milestones')
    || candidate.gapSignals.includes('deposit-schedule'),
  )
}

export function analyzeStagedSettlementPressure() {
  const candidates = new Map(stagedSettlementCandidates().map((candidate) => [candidate.id, candidate] as const))
  return stagedSettlementCandidateFindings.map((finding) => {
    const candidate = candidates.get(finding.candidateId)
    if (!candidate) throw new Error(`Staged-settlement autopsy references unknown candidate ${finding.candidateId}`)
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

export function summarizeStagedSettlementPressure() {
  const entries = analyzeStagedSettlementPressure()
  const pressureKinds: StagedSettlementPressure[] = [
    'reservation-commitment',
    'deliverable-milestones',
    'program-progress',
    'dependent-topology',
  ]
  const coverageKinds: StagedSettlementV1Coverage[] = ['direct', 'partial', 'adjacent-primitive']
  return {
    version: STAGED_SETTLEMENT_AUTOPSY_VERSION,
    candidateCount: entries.length,
    pressureCounts: Object.fromEntries(
      pressureKinds.map((pressure) => [pressure, entries.filter((entry) => entry.primaryPressure === pressure).length]),
    ) as Record<StagedSettlementPressure, number>,
    coverageCounts: Object.fromEntries(
      coverageKinds.map((coverage) => [coverage, entries.filter((entry) => entry.v1Coverage === coverage).length]),
    ) as Record<StagedSettlementV1Coverage, number>,
    directCandidateIds: entries.filter((entry) => entry.v1Coverage === 'direct').map((entry) => entry.candidateId),
    adjacentPrimitiveCandidateIds: entries.filter((entry) => entry.v1Coverage === 'adjacent-primitive').map((entry) => entry.candidateId),
  }
}
