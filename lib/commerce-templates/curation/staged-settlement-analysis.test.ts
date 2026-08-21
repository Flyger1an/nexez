import { describe, expect, it } from 'vitest'
import { commerceCurationCandidates } from './index'
import {
  analyzeStagedSettlementPressure,
  stagedSettlementCandidateFindings,
  stagedSettlementV1Contract,
  summarizeStagedSettlementPressure,
} from './staged-settlement-analysis'
import { listCommerceTemplates } from '../registry'

function set(values: string[]) {
  return new Set(values)
}

describe('staged settlement architecture autopsy', () => {
  it('covers all and only candidates with deposit or milestone pressure exactly once', () => {
    const observed = commerceCurationCandidates
      .filter((candidate) =>
        candidate.capabilityTags.includes('DEPOSIT')
        || candidate.gapSignals.includes('milestones')
        || candidate.gapSignals.includes('deposit-schedule'),
      )
      .map((candidate) => candidate.id)
    const analyzed = stagedSettlementCandidateFindings.map((finding) => finding.candidateId)

    expect(observed).toHaveLength(19)
    expect(analyzed).toHaveLength(19)
    expect(set(analyzed).size).toBe(19)
    expect(set(analyzed)).toEqual(set(observed))
  })

  it('separates simple staged payments from resource and provider topology', () => {
    expect(summarizeStagedSettlementPressure()).toMatchObject({
      version: 1,
      candidateCount: 19,
      pressureCounts: {
        'reservation-commitment': 5,
        'deliverable-milestones': 7,
        'program-progress': 3,
        'dependent-topology': 4,
      },
      coverageCounts: {
        direct: 9,
        partial: 7,
        'adjacent-primitive': 3,
      },
    })
  })

  it('keeps security deposits and multi-provider settlement outside v1', () => {
    expect(summarizeStagedSettlementPressure().adjacentPrimitiveCandidateIds).toEqual([
      'events.party-rentals',
      'events.corporate-event-production',
      'commercial.property-turnover-service',
    ])
    expect(stagedSettlementV1Contract.exclusions).toEqual(expect.arrayContaining([
      'refundable-security-or-damage-deposits',
      'escrow-or-manual-capture-holds',
      'multi-provider-splits',
      'inventory-or-resource-reservation',
    ]))
  })

  it('grounds every adjacent-signal claim in the curation record', () => {
    const candidates = new Map(commerceCurationCandidates.map((candidate) => [candidate.id, candidate]))
    for (const finding of stagedSettlementCandidateFindings) {
      const candidate = candidates.get(finding.candidateId)
      expect(candidate).toBeDefined()
      for (const signal of finding.adjacentSignals) {
        expect(candidate?.gapSignals).toContain(signal)
      }
    }
  })

  it('defines a bounded sequential allocation rather than a payment workflow language', () => {
    expect(stagedSettlementV1Contract.allocation).toMatchObject({
      unit: 'basis-points',
      total: 10_000,
      minimumStages: 2,
      maximumStages: 5,
    })
    expect(stagedSettlementV1Contract.stageKinds).toEqual(['commitment', 'milestone', 'completion'])
    expect(stagedSettlementV1Contract.paymentPolicy).toContain('fresh buyer approval')
    expect(stagedSettlementV1Contract.evaluationOrder).toEqual([
      'validate-merchant-schedule',
      'resolve-authoritative-total-and-currency',
      'allocate-exact-stage-amounts',
      'bind-agreement-and-first-obligation-approval',
      'settle-one-approved-obligation',
      'record-payment-and-activate-next-obligation',
      'complete-only-when-all-obligations-are-paid',
    ])
    expect(stagedSettlementV1Contract.exclusions).toEqual(expect.arrayContaining([
      'automatic-off-session-charging',
      'date-triggered-autonomous-payment',
      'dynamic-total-or-change-order-mutation',
      'parallel-or-optional-stage-graphs',
      'llm-inferred-stage-completion',
    ]))
  })

  it('preserves the seven-template pilot registry during architecture analysis', () => {
    expect(listCommerceTemplates({ status: 'active' })).toHaveLength(7)
    expect(commerceCurationCandidates.filter((candidate) => candidate.status === 'pilot-active')).toHaveLength(7)
  })

  it('returns deterministic JSON-safe analysis payloads', () => {
    const payload = {
      analysis: analyzeStagedSettlementPressure(),
      summary: summarizeStagedSettlementPressure(),
      contract: stagedSettlementV1Contract,
    }
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload)
  })
})
