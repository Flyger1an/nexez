import { describe, expect, it } from 'vitest'
import { commerceCurationCandidates } from './index'
import {
  analyzeConditionalFulfillmentPressure,
  conditionalFulfillmentCandidateFindings,
  conditionalFulfillmentV1Contract,
  summarizeConditionalFulfillmentPressure,
} from './conditional-fulfillment-analysis'
import { listCommerceTemplates } from '../registry'

function set(values: string[]) {
  return new Set(values)
}

describe('conditional fulfillment architecture autopsy', () => {
  it('covers all and only the 16 curated conditional-fulfillment candidates exactly once', () => {
    const observed = commerceCurationCandidates
      .filter((candidate) => candidate.gapSignals.includes('conditional-fulfillment'))
      .map((candidate) => candidate.id)
    const analyzed = conditionalFulfillmentCandidateFindings.map((finding) => finding.candidateId)

    expect(observed).toHaveLength(16)
    expect(analyzed).toHaveLength(16)
    expect(set(analyzed).size).toBe(16)
    expect(set(analyzed)).toEqual(set(observed))
  })

  it('separates buyer-policy pressure from evidence, live state, and dependent workflows', () => {
    expect(summarizeConditionalFulfillmentPressure()).toMatchObject({
      version: 1,
      candidateCount: 16,
      pressureCounts: {
        'buyer-answer-policy': 5,
        'prerequisite-evidence': 4,
        'live-state': 4,
        'dependent-workflow': 3,
      },
      coverageCounts: {
        direct: 6,
        partial: 8,
        'adjacent-primitive': 2,
      },
    })
  })

  it('does not pretend the condition layer solves inventory or multi-provider topology', () => {
    const summary = summarizeConditionalFulfillmentPressure()
    expect(summary.adjacentPrimitiveCandidateIds).toEqual([
      'events.party-rentals',
      'commercial.property-turnover-service',
    ])

    expect(conditionalFulfillmentV1Contract.exclusions).toContain('inventory-or-resource-reservation')
    expect(conditionalFulfillmentV1Contract.exclusions).toContain('multi-provider-orchestration')
    expect(conditionalFulfillmentV1Contract.exclusions).toContain('inspection-to-follow-up-lineage')
  })

  it('keeps adjacent-signal claims grounded in each candidate curation record', () => {
    const candidates = new Map(commerceCurationCandidates.map((candidate) => [candidate.id, candidate]))
    for (const finding of conditionalFulfillmentCandidateFindings) {
      const candidate = candidates.get(finding.candidateId)
      expect(candidate).toBeDefined()
      for (const signal of finding.adjacentSignals) {
        expect(candidate?.gapSignals).toContain(signal)
      }
    }
  })

  it('defines a fail-closed buyer-input decision contract rather than a general rules engine', () => {
    expect(conditionalFulfillmentV1Contract.inputSource).toBe('buyer-input')
    expect(conditionalFulfillmentV1Contract.decisions).toEqual(['eligible', 'requires-review', 'ineligible'])
    expect(conditionalFulfillmentV1Contract.defaultDecision).toBe('eligible')
    expect(conditionalFulfillmentV1Contract.referencedInputPolicy).toContain('required OfferInputField')
    expect(conditionalFulfillmentV1Contract.evaluationOrder).toEqual([
      'validate-and-canonicalize-buyer-configuration',
      'evaluate-merchant-fulfillment-rules',
      'resolve-deterministic-pricing',
      'dry-run-and-bind-buyer-approval',
      'settle-only-if-eligible',
    ])
    expect(conditionalFulfillmentV1Contract.exclusions).toEqual(expect.arrayContaining([
      'arbitrary-javascript-or-expression-language',
      'llm-or-fuzzy-rule-evaluation',
      'cross-field-formulas',
      'conditional-pricing',
      'conditional-field-visibility-or-dynamic-requiredness',
      'automatic-workflow-mutation',
    ]))
  })

  it('keeps v1 operators constrained by already-normalized input type', () => {
    expect(conditionalFulfillmentV1Contract.operatorsByValueType).toEqual({
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
    })
  })

  it('preserves the seven-template pilot registry during architecture analysis', () => {
    expect(listCommerceTemplates({ status: 'active' })).toHaveLength(7)
    expect(commerceCurationCandidates.filter((candidate) => candidate.status === 'pilot-active')).toHaveLength(7)
  })

  it('returns deterministic JSON-safe analysis payloads', () => {
    const payload = {
      analysis: analyzeConditionalFulfillmentPressure(),
      summary: summarizeConditionalFulfillmentPressure(),
      contract: conditionalFulfillmentV1Contract,
    }
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload)
  })
})
