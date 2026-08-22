import type { AgentPage } from './agent-page'
import type { QueryRankAnalysis } from './agent-search'
import type { AgentSuccessReport } from './agent-simulator'
import type { SimulationHistoryEntry } from './simulation-history'

export const AGENT_LAB_ENGINE_VERSION = 'nexez.agent-lab.v2' as const

export type AgentLabCommerceEvidence = {
  offerKey: string
  offerName: string
  method: string
  endpoint: string
  checkoutStatus: string
  inspection: 'published_contract'
  runtimeExecuted: false
}

export type AgentLabRunEvidence = {
  execution: {
    boundary: 'server'
    engineVersion: string
    deterministicAgents: number
    llm: {
      requested: boolean
      executed: boolean
      model: string | null
      reason: string | null
    }
  }
  competitiveField: {
    rankingPolicy: string
    visiblePagesEvaluated: number
    totalPublished: number | null
    complete: boolean
    cap: number
  }
  commerce: {
    offersInspected: number
    runtimeDryRuns: 0
    scope: 'published_contract'
    notice: string
    offers: AgentLabCommerceEvidence[]
  }
}

export type AgentLabRunResult = {
  query: string
  results: SimulationHistoryEntry['result']['results']
  recommendations: string[]
  overallReadiness: number
  success: AgentSuccessReport
  rankAnalysis: QueryRankAnalysis
}

export type AgentLabRun = {
  id: string
  ownerId: string | null
  pageId: string
  pageSlug: string
  query: string
  engineVersion: string
  executionMode: 'deterministic' | 'deterministic_with_llm'
  readiness: number
  result: AgentLabRunResult
  evidence: AgentLabRunEvidence
  createdAt: string
  persisted: boolean
}

export function agentLabRunToHistoryEntry(run: AgentLabRun): SimulationHistoryEntry {
  return {
    id: run.id,
    timestamp: run.createdAt,
    agent: run.executionMode === 'deterministic_with_llm' ? 'Multi-agent + LLM' : 'Multi-agent',
    query: run.query,
    result: {
      query: run.query,
      results: run.result.results,
      recommendations: run.result.recommendations,
      overallReadiness: run.result.overallReadiness,
      success: run.result.success,
      rankAnalysis: run.result.rankAnalysis,
    },
    readiness: run.readiness,
    evidence: run.evidence,
  }
}

export function commerceEvidenceFromResults(
  results: SimulationHistoryEntry['result']['results'],
): AgentLabCommerceEvidence[] {
  const first = results[0] as any
  const offers = Array.isArray(first?.schema?.page?.offers) ? first.schema.page.offers : []

  return offers.map((offer: any) => ({
    offerKey: String(offer?.key ?? ''),
    offerName: String(offer?.name ?? 'Unnamed offer'),
    method: String(offer?.action?.method ?? 'POST'),
    endpoint: String(offer?.action?.endpoint ?? ''),
    checkoutStatus: String(offer?.action?.availability ?? 'published'),
    inspection: 'published_contract' as const,
    runtimeExecuted: false as const,
  }))
}

export function canPersistAgentLabRun(page: Pick<AgentPage, 'owner_id'>, userId: string | null) {
  return Boolean(userId && page.owner_id === userId)
}
