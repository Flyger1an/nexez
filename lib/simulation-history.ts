import { AgentPage, getReadinessScore } from './agent-page'
import { getRecommendations, runMultiAgentSimulation } from './agent-simulator'
import type { QueryRankAnalysis } from './agent-search'
import type { AgentSuccessReport } from './agent-simulator'

export type SimulationHistoryEntry = {
  id: string
  timestamp: string
  agent: string
  query: string
  result: {
    query: string
    results: ReturnType<typeof runMultiAgentSimulation>['results']
    recommendations: string[]
    overallReadiness: number
    success?: AgentSuccessReport
    rankAnalysis?: QueryRankAnalysis
  }
  readiness: number
  evidence?: import('./agent-lab-run').AgentLabRunEvidence
}

export function normalizeSimulatorTarget(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''

  try {
    const url = new URL(trimmed)
    const firstPathSegment = url.pathname.split('/').filter(Boolean)[0] ?? ''
    return sanitizeSlug(firstPathSegment)
  } catch {
    return sanitizeSlug(trimmed)
  }
}

export function buildSimulationHistoryEntry(
  page: AgentPage,
  query: string,
  baseUrl?: string,
  results?: ReturnType<typeof runMultiAgentSimulation>['results'],
): SimulationHistoryEntry {
  const multi = runMultiAgentSimulation(page, query, baseUrl)
  const timestamp = new Date().toISOString()
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `sim-${page.id}-${timestamp}`

  return {
    id,
    timestamp,
    agent: 'Multi-agent',
    query,
    result: {
      query,
      results: results ?? multi.results,
      recommendations: getRecommendations(page),
      overallReadiness: getReadinessScore(page),
    },
    readiness: getReadinessScore(page),
  }
}

export function filterSimulationHistory(entries: SimulationHistoryEntry[], query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return entries

  return entries.filter((entry) =>
    [entry.query, entry.agent, entry.timestamp, String(entry.readiness)]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle)),
  )
}

export function getSimulationHistoryStats(entries: SimulationHistoryEntry[]) {
  const latest = entries[0] ?? null
  const oldest = entries[entries.length - 1] ?? null
  const averageReadiness = entries.length
    ? Math.round(entries.reduce((sum, entry) => sum + Number(entry.readiness || 0), 0) / entries.length)
    : 0
  const latestReadiness = latest ? Number(latest.readiness || 0) : 0
  const oldestReadiness = oldest ? Number(oldest.readiness || 0) : latestReadiness

  return {
    totalRuns: entries.length,
    latestReadiness,
    averageReadiness,
    readinessDelta: latestReadiness - oldestReadiness,
    latestQuery: latest?.query ?? '',
  }
}

export function exportSimulationHistory(entries: SimulationHistoryEntry[], page: Pick<AgentPage, 'name' | 'slug'>) {
  const stats = getSimulationHistoryStats(entries)

  return {
    page: {
      name: page.name,
      slug: page.slug,
    },
    exportedAt: new Date().toISOString(),
    stats,
    entries,
  }
}

function sanitizeSlug(value: string) {
  return value
    .replace(/^https?:\/\//i, '')
    .split(/[?#]/)[0]
    .split('/')
    .filter(Boolean)
    .pop()
    ?.trim()
    .replace(/^@/, '')
    .replace(/^\//, '')
    ?? ''
}
