import { describe, expect, it } from 'vitest'
import {
  buildAgentOperationsSnapshot,
  buildResearchTrendIndex,
  researchRunScore,
  summarizeResearchRuns,
} from '../agent-operations'
import type { AgentLabResearchRun } from '../agent-lab-research'

function researchRun(
  id: string,
  kind: AgentLabResearchRun['kind'],
  host: string,
  score: number,
  createdAt: string,
): AgentLabResearchRun {
  return {
    id,
    kind,
    targetUrl: `https://${host}`,
    targetHost: host,
    comparedPageId: null,
    comparedPageSlug: null,
    result: kind === 'competitor_benchmark'
      ? { scores: { overall: score } } as any
      : { agentReady: { readiness: score } } as any,
    evidence: {} as any,
    createdAt,
  }
}

describe('Agent operations intelligence', () => {
  it('reads the honest primary score for both research modes', () => {
    expect(researchRunScore(researchRun('a', 'url_snapshot', 'one.test', 72, '2026-01-01'))).toBe(72)
    expect(researchRunScore(researchRun('b', 'competitor_benchmark', 'two.test', 61, '2026-01-01'))).toBe(61)
  })

  it('computes per-target deltas without comparing unrelated sites or modes', () => {
    const runs = [
      researchRun('new', 'competitor_benchmark', 'one.test', 68, '2026-02-01'),
      researchRun('url', 'url_snapshot', 'one.test', 90, '2026-01-20'),
      researchRun('old', 'competitor_benchmark', 'one.test', 61, '2026-01-01'),
      researchRun('other', 'competitor_benchmark', 'two.test', 20, '2026-01-01'),
    ]
    expect(buildResearchTrendIndex(runs).get('new')).toEqual({ current: 68, previous: 61, delta: 7 })
    expect(buildResearchTrendIndex(runs).has('url')).toBe(false)
    expect(summarizeResearchRuns(runs)).toMatchObject({ runs: 4, uniqueTargets: 3, trackedTargets: 1, risingTargets: 1 })
  })

  it('builds coverage, latest movement, and a bounded priority queue', () => {
    const pages = [
      { id: 'published-1', name: 'Ready', slug: 'ready', is_published: true, description: 'Description', website_url: 'https://ready.test', cta_url: 'https://ready.test/buy', audience: 'Teams', industry: 'Tech', location: 'Austin', contact_email: 'x@y.test', services: [{ name: 'Plan', price: '$10' }], products: [], faqs: [{ question: 'Q', answer: 'A' }] },
      { id: 'published-2', name: 'Untested', slug: 'untested', is_published: true },
      { id: 'draft-1', name: 'Draft', slug: 'draft', is_published: false },
    ] as any
    const snapshot = buildAgentOperationsSnapshot(pages, {
      simulationRuns: [{ pageId: 'published-1', readiness: 100, createdAt: '2026-03-01' }],
      researchRuns: [
        { kind: 'competitor_benchmark', targetHost: 'rival.test', score: 64, createdAt: '2026-03-03' },
        { kind: 'competitor_benchmark', targetHost: 'rival.test', score: 60, createdAt: '2026-02-01' },
      ],
      historyWindowComplete: true,
    })

    expect(snapshot).toMatchObject({ publishedListings: 2, testedPublishedListings: 1, coveragePercent: 50, latestResearchScore: 64, latestResearchDelta: 4 })
    expect(snapshot.actions.map((action) => action.key)).toEqual(['publish', 'test', 'readiness'])
    expect(snapshot.actions).toHaveLength(3)
  })

  it('starts with creation and competitor baselining for an empty workspace', () => {
    const snapshot = buildAgentOperationsSnapshot([], { simulationRuns: [], researchRuns: [], historyWindowComplete: true })
    expect(snapshot.actions.map((action) => action.key)).toEqual(['create', 'benchmark'])
    expect(snapshot.latestActivityAt).toBeNull()
  })
})
