import { describe, expect, it } from 'vitest'
import {
  agentLabRunToHistoryEntry,
  canPersistAgentLabRun,
  commerceEvidenceFromResults,
  type AgentLabRun,
} from '../agent-lab-run'

describe('Agent Lab run evidence', () => {
  it('labels commerce inspection without claiming a runtime transaction', () => {
    const offers = commerceEvidenceFromResults([{
      agent: 'ChatGPT',
      readiness: 80,
      recommendations: [],
      verdict: {} as any,
      schema: {
        page: {
          offers: [{
            key: 'services-0',
            name: 'Strategy session',
            action: { method: 'POST', endpoint: 'https://nexez.test/api/checkout', availability: 'live' },
          }],
        },
      },
    }] as any)

    expect(offers).toEqual([expect.objectContaining({
      offerKey: 'services-0',
      inspection: 'published_contract',
      runtimeExecuted: false,
    })])
  })

  it('permits persistence only when the authenticated user owns the listing', () => {
    expect(canPersistAgentLabRun({ owner_id: 'owner-1' }, 'owner-1')).toBe(true)
    expect(canPersistAgentLabRun({ owner_id: 'owner-1' }, 'stranger')).toBe(false)
    expect(canPersistAgentLabRun({ owner_id: null }, 'owner-1')).toBe(false)
  })

  it('preserves success, rank, and evidence when converting a durable run for replay', () => {
    const run = {
      id: 'run-1', ownerId: 'owner-1', pageId: 'page-1', pageSlug: 'acme', query: 'strategy',
      engineVersion: 'nexez.agent-lab.v2', executionMode: 'deterministic', readiness: 88,
      result: {
        query: 'strategy', results: [], recommendations: ['Improve offer names'], overallReadiness: 88,
        success: { query: 'strategy', intent: 'overview', score: 88, verdict: 'ready', summary: 'Ready', checks: [] },
        rankAnalysis: { query: 'strategy', targetSlug: 'acme', published: true, matched: true, rank: 1, field: 3, targetScore: 2, targetReadiness: 88, competitorsAbove: [], termsToAdd: [], toWin: [] },
      },
      evidence: {
        execution: { boundary: 'server', engineVersion: 'nexez.agent-lab.v2', deterministicAgents: 5, llm: { requested: false, executed: false, model: null, reason: 'not_requested' } },
        competitiveField: { rankingPolicy: 'nexez.discovery-ranking.v1', visiblePagesEvaluated: 3, totalPublished: 3, complete: true, cap: 1_000 },
        commerce: { offersInspected: 0, runtimeDryRuns: 0, scope: 'published_contract', notice: 'No transaction executed.', offers: [] },
      },
      createdAt: '2026-08-21T00:00:00.000Z', persisted: true,
    } satisfies AgentLabRun

    expect(agentLabRunToHistoryEntry(run)).toMatchObject({
      id: 'run-1',
      result: { success: { score: 88 }, rankAnalysis: { rank: 1 } },
      evidence: { execution: { boundary: 'server' } },
    })
  })
})
