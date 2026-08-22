import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentLabResearchKind } from '../agent-lab-research'
import type { AgentOperationsData } from '../agent-operations'

const HISTORY_WINDOW = 500

type SimulationRow = { page_id: string; readiness: number; created_at: string }
type ResearchRow = {
  kind: AgentLabResearchKind
  target_host: string
  result: Record<string, any>
  created_at: string
}

export type AgentOperationsState = { data: AgentOperationsData; error: string | null }

function scoreResearchRow(row: ResearchRow): number | null {
  const score = row.kind === 'competitor_benchmark'
    ? row.result?.scores?.overall
    : row.result?.agentReady?.readiness
  return typeof score === 'number' && Number.isFinite(score) ? Math.round(score) : null
}

export async function loadAgentOperations(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<AgentOperationsState> {
  const [simulations, research] = await Promise.all([
    supabase
      .from('agent_lab_simulation_runs')
      .select('page_id, readiness, created_at')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_WINDOW)
      .returns<SimulationRow[]>(),
    supabase
      .from('agent_lab_research_runs')
      .select('kind, target_host, result, created_at')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_WINDOW)
      .returns<ResearchRow[]>(),
  ])

  if (simulations.error || research.error) {
    return {
      data: { simulationRuns: [], researchRuns: [], historyWindowComplete: false },
      error: 'Agent Lab evidence and research status are temporarily unavailable.',
    }
  }

  const simulationRows = simulations.data ?? []
  const researchRows = research.data ?? []
  return {
    data: {
      simulationRuns: simulationRows.map((row) => ({ pageId: row.page_id, readiness: row.readiness, createdAt: row.created_at })),
      researchRuns: researchRows.map((row) => ({ kind: row.kind, targetHost: row.target_host, score: scoreResearchRow(row), createdAt: row.created_at })),
      historyWindowComplete: simulationRows.length < HISTORY_WINDOW && researchRows.length < HISTORY_WINDOW,
    },
    error: null,
  }
}
