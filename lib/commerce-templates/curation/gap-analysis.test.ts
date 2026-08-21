import { describe, expect, it } from 'vitest'
import { commerceCurationCandidates } from './index'
import {
  analyzeCommerceSchemaGaps,
  commerceSchemaGapFindings,
  summarizeCommerceSchemaGaps,
} from './gap-analysis'
import { listCommerceTemplates } from '../registry'

function set(values: string[]) {
  return new Set(values)
}

describe('commerce schema gap analysis', () => {
  it('covers every observed curation gap signal exactly once with no orphan findings', () => {
    const observed = new Set(commerceCurationCandidates.flatMap((candidate) => candidate.gapSignals))
    const analyzed = commerceSchemaGapFindings.map((finding) => finding.signal)

    expect(analyzed).toHaveLength(21)
    expect(set(analyzed).size).toBe(21)
    expect(set(analyzed)).toEqual(observed)

    for (const entry of analyzeCommerceSchemaGaps()) {
      expect(entry.candidateCount).toBeGreaterThan(0)
      expect(entry.candidateIds).toHaveLength(entry.candidateCount)
    }
  })

  it('derives candidate counts from the curation corpus rather than duplicating them', () => {
    const entries = new Map(analyzeCommerceSchemaGaps().map((entry) => [entry.signal, entry]))

    expect(entries.get('customer-requirements')?.candidateCount).toBe(31)
    expect(entries.get('recurrence-terms')?.candidateCount).toBe(19)
    expect(entries.get('conditional-fulfillment')?.candidateCount).toBe(16)
    expect(entries.get('milestones')?.candidateCount).toBe(13)
    expect(entries.get('inventory-resource')?.candidateCount).toBe(12)
    expect(entries.get('usage-pricing')?.candidateCount).toBe(2)
    expect(entries.get('route-optimization')?.candidateCount).toBe(1)
    expect(entries.get('route-optimization')?.candidateIds).toEqual(['commercial.laundry-pickup-delivery'])
  })

  it('keeps first-class findings limited to behavior with real deterministic production rails', () => {
    const firstClass = analyzeCommerceSchemaGaps()
      .filter((entry) => entry.disposition === 'first-class')
      .map((entry) => entry.signal)

    expect(firstClass).toEqual([
      'customer-requirements',
      'recurrence-terms',
      'conditional-fulfillment',
      'structured-modifiers',
      'milestones',
      'inventory-resource',
      'quantity-pricing',
      'deposit-schedule',
    ])
  })

  it('identifies the bounded design-primitive queue without auto-promoting weak or niche signals', () => {
    const summary = summarizeCommerceSchemaGaps()

    expect(summary.version).toBe(5)
    expect(summary.signalCount).toBe(21)
    expect(summary.dispositionCounts).toEqual({
      'first-class': 8,
      'weakly-structured': 10,
      'broadly-missing': 1,
      'not-justified': 2,
    })
    expect(summary.designPrimitiveSignals).toEqual(['multi-provider-orchestration'])
    expect(summary.deferredSignals).toEqual(['usage-pricing', 'route-optimization'])
  })

  it('keeps disposition and recommended action semantically consistent', () => {
    const expectedAction = {
      'first-class': 'no-schema-change',
      'weakly-structured': 'harden-existing',
      'broadly-missing': 'design-primitive',
      'not-justified': 'defer',
    } as const

    for (const finding of commerceSchemaGapFindings) {
      expect(finding.action).toBe(expectedAction[finding.disposition])
      if (finding.disposition === 'first-class') {
        expect(finding.missingBehavior).toBeNull()
      } else {
        expect(finding.missingBehavior).not.toBeNull()
      }
    }
  })

  it('keeps evidence and recommendations explicit for every finding', () => {
    for (const finding of commerceSchemaGapFindings) {
      expect(finding.currentRepresentation.length).toBeGreaterThan(20)
      expect(finding.recommendation.length).toBeGreaterThan(20)
      expect(finding.evidence.length).toBeGreaterThan(0)
      expect(finding.evidence.every((path) => path.startsWith('lib/') || path.startsWith('app/'))).toBe(true)
    }
  })

  it('does not activate post-pilot templates as a side effect of analysis', () => {
    expect(listCommerceTemplates({ status: 'active' })).toHaveLength(7)
    expect(commerceCurationCandidates.filter((candidate) => candidate.status === 'pilot-active')).toHaveLength(7)
  })

  it('returns deterministic JSON-safe reports', () => {
    const payload = {
      analysis: analyzeCommerceSchemaGaps(),
      summary: summarizeCommerceSchemaGaps(),
    }
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload)
  })
})
