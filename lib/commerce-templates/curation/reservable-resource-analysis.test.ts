import { describe, expect, it } from 'vitest'
import { listCommerceTemplates } from '../registry'
import { commerceCurationCandidates } from './index'
import {
  analyzeReservableResourcePressure,
  reservableResourceCandidateFindings,
  reservableResourceV1Contract,
  summarizeReservableResourcePressure,
} from './reservable-resource-analysis'

function set(values: string[]) {
  return new Set(values)
}

describe('reservable resource architecture autopsy', () => {
  it('covers all and only inventory or capacity candidates exactly once', () => {
    const observed = commerceCurationCandidates
      .filter((candidate) =>
        candidate.gapSignals.includes('inventory-resource')
        || candidate.gapSignals.includes('capacity-constraints'),
      )
      .map((candidate) => candidate.id)
    const analyzed = reservableResourceCandidateFindings.map((finding) => finding.candidateId)

    expect(observed).toHaveLength(20)
    expect(analyzed).toHaveLength(20)
    expect(set(analyzed).size).toBe(20)
    expect(set(analyzed)).toEqual(set(observed))
  })

  it('separates scalar holds from operational and provider topology', () => {
    expect(summarizeReservableResourcePressure()).toMatchObject({
      version: 1,
      candidateCount: 20,
      inventorySignalCount: 12,
      capacitySignalCount: 13,
      overlappingSignalCount: 5,
      pressureCounts: {
        'pooled-service-capacity': 8,
        'catalog-inventory': 3,
        'equipment-or-space': 3,
        'composite-operations': 6,
      },
      coverageCounts: {
        direct: 7,
        partial: 11,
        'adjacent-primitive': 2,
      },
    })
  })

  it('keeps multi-provider projects outside the v1 allocation claim', () => {
    expect(summarizeReservableResourcePressure().adjacentPrimitiveCandidateIds).toEqual([
      'events.corporate-event-production',
      'commercial.property-turnover-service',
    ])
    expect(reservableResourceV1Contract.exclusions).toEqual(expect.arrayContaining([
      'multi-provider-or-multi-location-orchestration',
      'refundable-security-or-damage-deposit-settlement',
      'external-stock-or-calendar-claims-without-confirmed-authority',
    ]))
  })

  it('grounds every adjacent-signal claim in the curation record', () => {
    const candidates = new Map(commerceCurationCandidates.map((candidate) => [candidate.id, candidate]))
    for (const finding of reservableResourceCandidateFindings) {
      const candidate = candidates.get(finding.candidateId)
      expect(candidate).toBeDefined()
      for (const signal of finding.adjacentSignals) {
        expect(candidate?.gapSignals).toContain(signal)
      }
    }
  })

  it('defines a bounded atomic hold instead of an inventory planning language', () => {
    expect(reservableResourceV1Contract.poolKinds).toEqual(['consumable', 'reusable'])
    expect(reservableResourceV1Contract.offerRequirements).toMatchObject({
      maximumPoolsPerOffer: 3,
      quantitySources: ['fixed', 'canonical-quantity-input'],
      maximumQuantityPerRequirement: 10_000,
    })
    expect(reservableResourceV1Contract.holdPolicy).toMatchObject({
      minimumTtlSeconds: 1_800,
      maximumTtlSeconds: 3_600,
    })
    expect(reservableResourceV1Contract.holdPolicy.atomicity).toContain('cannot drive remaining units below zero')
    expect(reservableResourceV1Contract.holdPolicy.paymentSession).toContain('immediate-confirmation payment methods')
    expect(reservableResourceV1Contract.holdPolicy.paymentSession).toContain('never from wall-clock expiry alone')
    expect(reservableResourceV1Contract.approvalPolicy).toContain('approval expires no later than the hold')
    expect(reservableResourceV1Contract.evaluationOrder).toEqual([
      'validate-canonical-buyer-configuration-and-fulfillment',
      'resolve-authoritative-price',
      'resolve-merchant-authored-resource-requirements',
      'atomically-create-expiring-allocation-hold',
      'bind-hold-and-allocation-to-buyer-approval',
      'settle-only-while-hold-and-approval-are-active',
      'commit-reservation-on-authoritative-payment',
      'release-expired-cancelled-or-failed-holds-exactly-once',
    ])
  })

  it('preserves the seven-template pilot registry during architecture analysis', () => {
    expect(listCommerceTemplates({ status: 'active' })).toHaveLength(7)
    expect(commerceCurationCandidates.filter((candidate) => candidate.status === 'pilot-active')).toHaveLength(7)
  })

  it('returns deterministic JSON-safe analysis payloads', () => {
    const payload = {
      analysis: analyzeReservableResourcePressure(),
      summary: summarizeReservableResourcePressure(),
      contract: reservableResourceV1Contract,
    }
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload)
  })
})
