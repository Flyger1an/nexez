import { describe, expect, it, vi } from 'vitest'
import { loadAgentOperations } from './agent-operations'

function client(results: Record<string, { data: any[] | null; error: any }>) {
  const calls: Array<{ table: string; owner: string | null; limit: number | null }> = []
  return {
    calls,
    supabase: {
      from(table: string) {
        const call = { table, owner: null as string | null, limit: null as number | null }
        calls.push(call)
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn((_key: string, value: string) => { call.owner = value; return chain }),
          order: vi.fn(() => chain),
          limit: vi.fn((value: number) => { call.limit = value; return chain }),
          returns: vi.fn(async () => results[table]),
        }
        return chain
      },
    } as any,
  }
}

describe('loadAgentOperations', () => {
  it('loads owner-scoped minimal rows in bounded windows and returns safe scores', async () => {
    const { supabase, calls } = client({
      agent_lab_simulation_runs: { data: [{ page_id: 'p1', readiness: 82, created_at: '2026-08-21' }], error: null },
      agent_lab_research_runs: {
        data: [
          { kind: 'url_snapshot', target_host: 'one.test', result: { agentReady: { readiness: 71 } }, created_at: '2026-08-21' },
          { kind: 'competitor_benchmark', target_host: 'two.test', result: { scores: { overall: 58 }, private: 'discarded' }, created_at: '2026-08-20' },
        ],
        error: null,
      },
    })

    const result = await loadAgentOperations(supabase, 'owner-1')
    expect(calls).toEqual([
      { table: 'agent_lab_simulation_runs', owner: 'owner-1', limit: 500 },
      { table: 'agent_lab_research_runs', owner: 'owner-1', limit: 500 },
    ])
    expect(result.data).toEqual({
      simulationRuns: [{ pageId: 'p1', readiness: 82, createdAt: '2026-08-21' }],
      researchRuns: [
        { kind: 'url_snapshot', targetHost: 'one.test', score: 71, createdAt: '2026-08-21' },
        { kind: 'competitor_benchmark', targetHost: 'two.test', score: 58, createdAt: '2026-08-20' },
      ],
      historyWindowComplete: true,
    })
    expect(JSON.stringify(result.data)).not.toContain('private')
  })

  it('fails closed instead of turning missing evidence into zero activity', async () => {
    const { supabase } = client({
      agent_lab_simulation_runs: { data: null, error: { message: 'unavailable' } },
      agent_lab_research_runs: { data: [], error: null },
    })
    const result = await loadAgentOperations(supabase, 'owner-1')
    expect(result.error).toMatch(/temporarily unavailable/)
    expect(result.data.historyWindowComplete).toBe(false)
  })
})
