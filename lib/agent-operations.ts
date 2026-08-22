import { getReadinessScore, type AgentPage } from './agent-page'
import type { AgentLabResearchKind, AgentLabResearchRun } from './agent-lab-research'

export type AgentOperationsSimulationRow = {
  pageId: string
  readiness: number
  createdAt: string
}

export type AgentOperationsResearchRow = {
  kind: AgentLabResearchKind
  targetHost: string
  score: number | null
  createdAt: string
}

export type AgentOperationsData = {
  simulationRuns: AgentOperationsSimulationRow[]
  researchRuns: AgentOperationsResearchRow[]
  historyWindowComplete: boolean
}

export type AgentOperationsAction = {
  key: 'create' | 'publish' | 'test' | 'readiness' | 'benchmark' | 'review'
  title: string
  detail: string
  href: string
}

export type AgentOperationsSnapshot = {
  simulationRuns: number
  researchRuns: number
  uniqueResearchTargets: number
  publishedListings: number
  testedPublishedListings: number
  coveragePercent: number
  latestActivityAt: string | null
  latestResearchScore: number | null
  latestResearchDelta: number | null
  latestResearchTarget: string | null
  historyWindowComplete: boolean
  actions: AgentOperationsAction[]
}

export type ResearchTrend = {
  current: number
  previous: number
  delta: number
}

export type ResearchTrendSummary = {
  runs: number
  uniqueTargets: number
  trackedTargets: number
  risingTargets: number
  fallingTargets: number
  stableTargets: number
  latestActivityAt: string | null
}

type OperationsPage = Pick<AgentPage, 'id' | 'name' | 'slug' | 'is_published'> & Partial<AgentPage>

export function researchRunScore(run: Pick<AgentLabResearchRun, 'kind' | 'result'>): number | null {
  const result = run.result as unknown as Record<string, any>
  const score = run.kind === 'competitor_benchmark'
    ? result?.scores?.overall
    : result?.agentReady?.readiness
  return typeof score === 'number' && Number.isFinite(score) ? Math.round(score) : null
}

export function buildResearchTrendIndex(runs: AgentLabResearchRun[]): Map<string, ResearchTrend> {
  const byTarget = new Map<string, AgentLabResearchRun[]>()
  for (const run of runs) {
    const key = `${run.kind}:${run.targetHost.toLowerCase()}`
    const group = byTarget.get(key)
    if (group) group.push(run)
    else byTarget.set(key, [run])
  }

  const trends = new Map<string, ResearchTrend>()
  for (const group of byTarget.values()) {
    group.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    let previousScore: number | null = null
    for (const run of group) {
      const current = researchRunScore(run)
      if (current != null && previousScore != null) {
        trends.set(run.id, { current, previous: previousScore, delta: current - previousScore })
      }
      if (current != null) previousScore = current
    }
  }
  return trends
}

export function summarizeResearchRuns(runs: AgentLabResearchRun[]): ResearchTrendSummary {
  const trends = buildResearchTrendIndex(runs)
  const latestByTarget = new Map<string, ResearchTrend>()
  const ordered = [...runs].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  for (const run of ordered) {
    const key = `${run.kind}:${run.targetHost.toLowerCase()}`
    const trend = trends.get(run.id)
    if (trend && !latestByTarget.has(key)) latestByTarget.set(key, trend)
  }

  let risingTargets = 0
  let fallingTargets = 0
  let stableTargets = 0
  for (const trend of latestByTarget.values()) {
    if (trend.delta > 0) risingTargets += 1
    else if (trend.delta < 0) fallingTargets += 1
    else stableTargets += 1
  }

  return {
    runs: runs.length,
    uniqueTargets: new Set(runs.map((run) => `${run.kind}:${run.targetHost.toLowerCase()}`)).size,
    trackedTargets: latestByTarget.size,
    risingTargets,
    fallingTargets,
    stableTargets,
    latestActivityAt: ordered[0]?.createdAt ?? null,
  }
}

export function buildAgentOperationsSnapshot(
  pages: OperationsPage[],
  data: AgentOperationsData,
): AgentOperationsSnapshot {
  const published = pages.filter((page) => page.is_published)
  const testedPageIds = new Set(data.simulationRuns.map((run) => run.pageId))
  const testedPublishedListings = published.filter((page) => testedPageIds.has(page.id)).length
  const coveragePercent = published.length ? Math.round((testedPublishedListings / published.length) * 100) : 0
  const researchTargets = new Set(data.researchRuns.map((run) => run.targetHost.toLowerCase()))
  const activityDates = [
    ...data.simulationRuns.map((run) => run.createdAt),
    ...data.researchRuns.map((run) => run.createdAt),
  ].filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a))

  const latestResearch = [...data.researchRuns]
    .filter((run) => run.score != null)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]
  const previousComparable = latestResearch
    ? [...data.researchRuns]
        .filter((run) => run !== latestResearch && run.kind === latestResearch.kind && run.targetHost.toLowerCase() === latestResearch.targetHost.toLowerCase() && run.score != null)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]
    : null

  const actions: AgentOperationsAction[] = []
  if (!pages.length) {
    actions.push({ key: 'create', title: 'Create the first listing', detail: 'Publish an agent surface before measuring coverage.', href: '/create' })
  } else {
    const draft = pages.find((page) => !page.is_published)
    if (draft) actions.push({ key: 'publish', title: `Publish ${draft.name}`, detail: 'Draft listings cannot participate in public discovery or evidence runs.', href: `/dashboard/${draft.id}/settings#general` })

    const untested = published.find((page) => !testedPageIds.has(page.id))
    if (untested) actions.push({ key: 'test', title: `Test ${untested.name}`, detail: 'Create the first attributable Agent Lab run for this published listing.', href: `/dashboard/${untested.id}/test` })

    const lowestReadiness = [...pages].sort((a, b) => getReadinessScore(a) - getReadinessScore(b))[0]
    if (lowestReadiness && getReadinessScore(lowestReadiness) < 85) {
      actions.push({ key: 'readiness', title: `Raise ${lowestReadiness.name} readiness`, detail: `Current readiness is ${getReadinessScore(lowestReadiness)}%. Close the highest-impact listing gaps.`, href: `/dashboard/${lowestReadiness.id}/settings#trust-verification` })
    }
  }

  if (!data.researchRuns.some((run) => run.kind === 'competitor_benchmark')) {
    actions.push({ key: 'benchmark', title: 'Benchmark a competitor', detail: 'Establish an external baseline and save it for trend tracking.', href: '/simulator?mode=compare' })
  }
  if (!actions.length && data.researchRuns.length) {
    actions.push({ key: 'review', title: 'Review saved research', detail: 'Reopen the latest snapshots and decide what to test next.', href: '/simulator?mode=compare' })
  }

  return {
    simulationRuns: data.simulationRuns.length,
    researchRuns: data.researchRuns.length,
    uniqueResearchTargets: researchTargets.size,
    publishedListings: published.length,
    testedPublishedListings,
    coveragePercent,
    latestActivityAt: activityDates[0] ?? null,
    latestResearchScore: latestResearch?.score ?? null,
    latestResearchDelta: latestResearch && previousComparable && latestResearch.score != null && previousComparable.score != null
      ? latestResearch.score - previousComparable.score
      : null,
    latestResearchTarget: latestResearch?.targetHost ?? null,
    historyWindowComplete: data.historyWindowComplete,
    actions: actions.slice(0, 3),
  }
}
