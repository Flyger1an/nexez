import { AgentPage, getReadinessScore } from './agent-page'
import type { AnalyticsTrustLevel } from './contracts/analytics'

export type AgentVisit = {
  id: string
  page_id: string
  owner_id: string | null
  slug: string
  path: string
  referrer: string | null
  query: string | null
  user_agent: string | null
  ip_hash: string | null
  is_ai_agent: boolean
  agent_type: string
  confidence_score: number
  detection_signals: Record<string, unknown>
  ingestion_key?: string | null
  ingestion_source?: string
  trust_level?: AnalyticsTrustLevel
  created_at: string
}

export type AgentVisitTrafficFilter = 'all' | 'ai' | 'human'

export function filterAgentVisits(
  visits: AgentVisit[],
  filters: { pageId?: string; query?: string; traffic?: AgentVisitTrafficFilter },
) {
  const query = filters.query?.trim().toLowerCase()

  return visits.filter((visit) => {
    if (filters.pageId && visit.page_id !== filters.pageId) return false
    if (filters.traffic === 'ai' && !visit.is_ai_agent) return false
    if (filters.traffic === 'human' && visit.is_ai_agent) return false

    if (!query) return true

    return [visit.slug, visit.path, visit.referrer, visit.query, visit.user_agent, visit.agent_type]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query))
  })
}

export function getTrafficSplit(visits: AgentVisit[]) {
  const ai = visits.filter((visit) => visit.is_ai_agent).length
  const human = Math.max(0, visits.length - ai)
  return { ai, human, total: visits.length }
}

export function getAgentTypeBreakdown(visits: AgentVisit[]) {
  const counts = new Map<string, { agentType: string; total: number; avgConfidence: number }>()

  for (const visit of visits) {
    if (!visit.is_ai_agent) continue
    const current = counts.get(visit.agent_type) ?? { agentType: visit.agent_type, total: 0, avgConfidence: 0 }
    current.avgConfidence = (current.avgConfidence * current.total + Number(visit.confidence_score || 0)) / (current.total + 1)
    current.total += 1
    counts.set(visit.agent_type, current)
  }

  return [...counts.values()].sort((a, b) => b.total - a.total || b.avgConfidence - a.avgConfidence)
}

export function getTopPagesByAgentVisits(visits: AgentVisit[], pages: AgentPage[]) {
  const pageMap = new Map(pages.map((page) => [page.id, page]))
  const counts = new Map<string, { pageId: string; slug: string; name: string; total: number }>()

  for (const visit of visits) {
    if (!visit.is_ai_agent) continue
    const page = pageMap.get(visit.page_id)
    const current = counts.get(visit.page_id) ?? {
      pageId: visit.page_id,
      slug: visit.slug,
      name: page?.name || visit.slug,
      total: 0,
    }
    current.total += 1
    counts.set(visit.page_id, current)
  }

  return [...counts.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

export function getReadinessTrendSummary(pages: AgentPage[]) {
  const currentScores = pages.map((page) => getReadinessScore(page))
  const currentAverage = average(currentScores)
  const previousScores = pages
    .map((page) => {
      const versions = Array.isArray(page.versions) ? page.versions : []
      const latest = versions[0]
      return latest ? getReadinessScore({ ...page, ...latest, is_published: page.is_published }) : null
    })
    .filter((score): score is number => typeof score === 'number')
  const previousAverage = previousScores.length ? average(previousScores) : currentAverage

  return {
    currentAverage,
    previousAverage,
    delta: currentAverage - previousAverage,
    versionSnapshots: previousScores.length,
  }
}

function average(values: number[]) {
  if (!values.length) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}
