import { commerceCurationCandidates } from './index'
import type { CommerceCurationGapSignal } from './types'

export const RESERVABLE_RESOURCE_AUTOPSY_VERSION = 1 as const

export type ReservableResourcePressure =
  | 'pooled-service-capacity'
  | 'catalog-inventory'
  | 'equipment-or-space'
  | 'composite-operations'

export type ReservableResourceV1Coverage = 'direct' | 'partial' | 'adjacent-primitive'

export type ReservableResourceCandidateFinding = {
  candidateId: string
  primaryPressure: ReservableResourcePressure
  v1Coverage: ReservableResourceV1Coverage
  rationale: string
  adjacentSignals: CommerceCurationGapSignal[]
}

/**
 * Human-reviewed decomposition of every candidate carrying an inventory or
 * capacity gap. Candidate metadata remains derived from the canonical corpus;
 * this list records the architecture judgment the shared signal cannot express.
 */
export const reservableResourceCandidateFindings: ReservableResourceCandidateFinding[] = [
  {
    candidateId: 'home.moving-service',
    primaryPressure: 'composite-operations',
    v1Coverage: 'partial',
    rationale: 'Atomic pooled holds can protect a bounded crew or vehicle window, but volume, route, and multi-resource assignment remain operational planning concerns.',
    adjacentSignals: ['distance-travel-fee', 'customer-requirements'],
  },
  {
    candidateId: 'automotive.fleet-detailing-contract',
    primaryPressure: 'pooled-service-capacity',
    v1Coverage: 'partial',
    rationale: 'A service window can reserve bounded vehicle throughput, while recurring multi-asset identity and contract scheduling remain separate rails.',
    adjacentSignals: ['recurrence-terms', 'multi-unit-booking', 'contract-terms'],
  },
  {
    candidateId: 'automotive.mobile-tire-service',
    primaryPressure: 'catalog-inventory',
    v1Coverage: 'direct',
    rationale: 'Interchangeable units of an explicitly merchant-authored tire SKU can be held before payment without inferring fitment or live supplier stock.',
    adjacentSignals: ['customer-requirements', 'conditional-fulfillment'],
  },
  {
    candidateId: 'events.private-chef',
    primaryPressure: 'pooled-service-capacity',
    v1Coverage: 'direct',
    rationale: 'A merchant-authored event window and guest-capacity pool can be atomically held after the exact buyer quantity is canonicalized.',
    adjacentSignals: ['quantity-pricing', 'customer-requirements'],
  },
  {
    candidateId: 'events.event-catering',
    primaryPressure: 'composite-operations',
    v1Coverage: 'partial',
    rationale: 'A bounded event-capacity pool is reservable, while menus, staffing, delivery, and replenishable supplies cannot be collapsed into one scalar allocation.',
    adjacentSignals: ['quantity-pricing', 'minimum-charge'],
  },
  {
    candidateId: 'events.dj-service',
    primaryPressure: 'equipment-or-space',
    v1Coverage: 'direct',
    rationale: 'An interchangeable equipment package or performance-capacity pool can be held for one explicit event window.',
    adjacentSignals: ['distance-travel-fee', 'structured-modifiers'],
  },
  {
    candidateId: 'events.party-rentals',
    primaryPressure: 'catalog-inventory',
    v1Coverage: 'partial',
    rationale: 'Rental units can be held for a declared window, but delivery, pickup, damage inspection, and refundable security remain separate contracts.',
    adjacentSignals: ['deposit-schedule', 'conditional-fulfillment'],
  },
  {
    candidateId: 'events.proposal-setup',
    primaryPressure: 'catalog-inventory',
    v1Coverage: 'direct',
    rationale: 'Merchant-authored decor pools can be held for one setup window after the buyer configuration selects exact bounded quantities.',
    adjacentSignals: ['structured-modifiers', 'conditional-fulfillment'],
  },
  {
    candidateId: 'events.corporate-event-production',
    primaryPressure: 'composite-operations',
    v1Coverage: 'adjacent-primitive',
    rationale: 'Equipment counts do not solve vendor responsibility, procurement, staffing, or provider-specific commitments in a production graph.',
    adjacentSignals: ['multi-provider-orchestration', 'milestones', 'contract-terms'],
  },
  {
    candidateId: 'personal.bridal-beauty-package',
    primaryPressure: 'pooled-service-capacity',
    v1Coverage: 'partial',
    rationale: 'A party-size capacity window is holdable, while per-person services and provider schedules still need multi-unit booking semantics.',
    adjacentSignals: ['multi-unit-booking', 'deposit-schedule'],
  },
  {
    candidateId: 'personal.private-yoga-instruction',
    primaryPressure: 'pooled-service-capacity',
    v1Coverage: 'direct',
    rationale: 'An explicit class or instructor-capacity window can reserve the canonical participant quantity without identifying every attendee.',
    adjacentSignals: ['recurrence-terms', 'customer-requirements'],
  },
  {
    candidateId: 'professional.video-production',
    primaryPressure: 'equipment-or-space',
    v1Coverage: 'partial',
    rationale: 'A merchant-owned equipment pool can be reserved, but crew/provider topology, production milestones, and rights remain outside the hold ledger.',
    adjacentSignals: ['multi-provider-orchestration', 'usage-rights', 'milestones'],
  },
  {
    candidateId: 'education.music-lessons',
    primaryPressure: 'equipment-or-space',
    v1Coverage: 'partial',
    rationale: 'Shared instruments or rooms can be held, while instructor fit, lesson recurrence, and external calendars keep their own authority.',
    adjacentSignals: ['recurrence-terms', 'qualification-fit'],
  },
  {
    candidateId: 'pet.pet-sitting',
    primaryPressure: 'pooled-service-capacity',
    v1Coverage: 'direct',
    rationale: 'A merchant-authored care window can reserve a bounded number of interchangeable care slots after pet quantity is validated.',
    adjacentSignals: ['customer-requirements', 'conditional-fulfillment'],
  },
  {
    candidateId: 'pet.mobile-pet-grooming',
    primaryPressure: 'pooled-service-capacity',
    v1Coverage: 'direct',
    rationale: 'One explicit service window can atomically reserve a bounded mobile-grooming capacity unit without inventing route feasibility.',
    adjacentSignals: ['customer-requirements', 'structured-modifiers'],
  },
  {
    candidateId: 'commercial.recurring-janitorial-service',
    primaryPressure: 'composite-operations',
    v1Coverage: 'partial',
    rationale: 'A bounded crew-capacity pool is holdable, while recurring staffing plans, supplies, SLAs, and site-by-site schedules remain contract operations.',
    adjacentSignals: ['contract-terms', 'recurrence-terms'],
  },
  {
    candidateId: 'commercial.junk-removal',
    primaryPressure: 'pooled-service-capacity',
    v1Coverage: 'partial',
    rationale: 'Truck or load capacity can be reserved as pooled units, but photos, restricted materials, disposal authority, and final volume remain separate truth.',
    adjacentSignals: ['quantity-pricing', 'document-requirements', 'regulated-qualification'],
  },
  {
    candidateId: 'commercial.laundry-pickup-delivery',
    primaryPressure: 'pooled-service-capacity',
    v1Coverage: 'partial',
    rationale: 'Processing capacity can be held for a declared window, while route slots, turnaround, and recurring pickup coordination are not one resource pool.',
    adjacentSignals: ['route-optimization', 'recurrence-terms', 'quantity-pricing'],
  },
  {
    candidateId: 'commercial.property-turnover-service',
    primaryPressure: 'composite-operations',
    v1Coverage: 'adjacent-primitive',
    rationale: 'A scalar resource hold cannot coordinate multiple providers, inspections, supplies, milestones, and handoffs under one turnover engagement.',
    adjacentSignals: ['multi-provider-orchestration', 'milestones', 'conditional-fulfillment'],
  },
  {
    candidateId: 'commercial.commercial-landscaping',
    primaryPressure: 'composite-operations',
    v1Coverage: 'partial',
    rationale: 'A crew or equipment pool can protect one service window, while seasonal recurrence, multi-site scheduling, and SLA commitments remain separate.',
    adjacentSignals: ['contract-terms', 'recurrence-terms'],
  },
]

/**
 * Bounded v1 architecture. Nexez owns atomic holds only for merchant-authored,
 * interchangeable pools; it does not become a warehouse, calendar, or planner.
 */
export const reservableResourceV1Contract = {
  merchantTruth: 'Resource pools, quantities, offer requirements, and availability windows are explicit merchant-authored configuration preserved across AI and integration merges.',
  poolKinds: ['consumable', 'reusable'] as const,
  unitPolicy: 'V1 pools contain interchangeable integer units. Serialized assets, per-unit condition, substitutions, and bundles are excluded.',
  offerRequirements: {
    maximumPoolsPerOffer: 3,
    quantitySources: ['fixed', 'canonical-quantity-input'] as const,
    maximumQuantityPerRequirement: 10_000,
    inputPolicy: 'A dynamic quantity must reference one existing required quantity input and consume only its canonical transaction value.',
  },
  windowPolicy: 'Reusable pools allocate against an explicit merchant-authored availability-window ID with immutable start/end instants. Consumable pools allocate from current on-hand units without inventing supplier stock.',
  holdPolicy: {
    minimumTtlSeconds: 1_800,
    maximumTtlSeconds: 3_600,
    atomicity: 'Availability check, allocation, and hold creation occur in one database transaction; active, payment-pending, and committed allocations cannot drive remaining units below zero.',
    idempotency: 'One scoped idempotency key resolves to one hold and identical allocation fingerprint.',
    paymentSession: 'Use immediate-confirmation payment methods and expire the Checkout Session at the hold deadline. Once attached, allocation releases only after authoritative session expiry/failure, never from wall-clock expiry alone.',
  },
  commitmentPolicy: 'An active or payment-pending hold converts atomically only from its authoritative successful payment event. Unattached expiry, cancellation, or authoritative session expiry/failure releases allocation exactly once.',
  approvalPolicy: 'Buyer approval binds pool versions, window, quantities, allocation fingerprint, hold ID, and hold expiry; approval expires no later than the hold.',
  authorityPolicy: 'Nexez may reserve only Nexez-owned pools. Calendly, external inventory, venue, supplier, and provider systems remain authoritative and are never represented as held without a confirmed integration contract.',
  availabilityPolicy: 'Public and agent surfaces expose only aggregate available quantity and safe window identifiers from the production resolver, never private unit identities or uncommitted merchant operations.',
  evaluationOrder: [
    'validate-canonical-buyer-configuration-and-fulfillment',
    'resolve-authoritative-price',
    'resolve-merchant-authored-resource-requirements',
    'atomically-create-expiring-allocation-hold',
    'bind-hold-and-allocation-to-buyer-approval',
    'settle-only-while-hold-and-approval-are-active',
    'commit-reservation-on-authoritative-payment',
    'release-expired-cancelled-or-failed-holds-exactly-once',
  ],
  exclusions: [
    'serialized-or-individually-assigned-assets',
    'substitution-or-bundle-optimization',
    'warehouse-purchasing-or-supplier-replenishment',
    'external-stock-or-calendar-claims-without-confirmed-authority',
    'continuous-interval-or-route-optimization',
    'multi-provider-or-multi-location-orchestration',
    'refundable-security-or-damage-deposit-settlement',
    'asynchronous-payment-methods-that-outlive-the-hold',
    'maintenance-condition-or-inspection-state',
    'automatic-overbooking-or-waitlists',
    'llm-inferred-pools-quantities-or-availability',
  ],
} as const

function reservableResourceCandidates() {
  return commerceCurationCandidates.filter((candidate) =>
    candidate.gapSignals.includes('inventory-resource')
    || candidate.gapSignals.includes('capacity-constraints'),
  )
}

export function analyzeReservableResourcePressure() {
  const candidates = new Map(reservableResourceCandidates().map((candidate) => [candidate.id, candidate] as const))
  return reservableResourceCandidateFindings.map((finding) => {
    const candidate = candidates.get(finding.candidateId)
    if (!candidate) throw new Error(`Reservable-resource autopsy references unknown candidate ${finding.candidateId}`)
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

export function summarizeReservableResourcePressure() {
  const entries = analyzeReservableResourcePressure()
  const pressureKinds: ReservableResourcePressure[] = [
    'pooled-service-capacity',
    'catalog-inventory',
    'equipment-or-space',
    'composite-operations',
  ]
  const coverageKinds: ReservableResourceV1Coverage[] = ['direct', 'partial', 'adjacent-primitive']
  return {
    version: RESERVABLE_RESOURCE_AUTOPSY_VERSION,
    candidateCount: entries.length,
    inventorySignalCount: entries.filter((entry) => entry.observedGapSignals.includes('inventory-resource')).length,
    capacitySignalCount: entries.filter((entry) => entry.observedGapSignals.includes('capacity-constraints')).length,
    overlappingSignalCount: entries.filter((entry) =>
      entry.observedGapSignals.includes('inventory-resource')
      && entry.observedGapSignals.includes('capacity-constraints'),
    ).length,
    pressureCounts: Object.fromEntries(
      pressureKinds.map((pressure) => [pressure, entries.filter((entry) => entry.primaryPressure === pressure).length]),
    ) as Record<ReservableResourcePressure, number>,
    coverageCounts: Object.fromEntries(
      coverageKinds.map((coverage) => [coverage, entries.filter((entry) => entry.v1Coverage === coverage).length]),
    ) as Record<ReservableResourceV1Coverage, number>,
    directCandidateIds: entries.filter((entry) => entry.v1Coverage === 'direct').map((entry) => entry.candidateId),
    adjacentPrimitiveCandidateIds: entries.filter((entry) => entry.v1Coverage === 'adjacent-primitive').map((entry) => entry.candidateId),
  }
}
