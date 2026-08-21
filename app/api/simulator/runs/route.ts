import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  AGENT_LAB_ENGINE_VERSION,
  canPersistAgentLabRun,
  commerceEvidenceFromResults,
  type AgentLabRun,
  type AgentLabRunEvidence,
} from '@/lib/agent-lab-run'
import {
  AgentPage,
  PUBLIC_PAGE_SELECT,
  getReadinessScore,
  getRequestBaseUrl,
} from '@/lib/agent-page'
import { AGENT_SEARCH_RANKING_POLICY, analyzeQueryRank } from '@/lib/agent-search'
import { getRecommendations, runMultiAgentSimulation } from '@/lib/agent-simulator'
import { enforceRateLimit } from '@/lib/rate-limit'
import { runLlmSimulation } from '@/lib/server/llm-simulation'
import { loadPublicPageField } from '@/lib/server/public-page-field'
import { createClient } from '@/utils/supabase/server'

const HISTORY_LIMIT = 100

type RunRow = {
  id: string
  owner_id: string
  page_id: string
  page_slug: string
  query: string
  engine_version: string
  execution_mode: 'deterministic' | 'deterministic_with_llm'
  readiness: number
  result: AgentLabRun['result']
  evidence: AgentLabRunEvidence
  created_at: string
}

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to view Agent Lab history.' }, { status: 401 })

  const url = new URL(request.url)
  const pageId = url.searchParams.get('pageId')?.trim() || ''
  const requestedLimit = Number(url.searchParams.get('limit') || 30)
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(HISTORY_LIMIT, Math.floor(requestedLimit)))
    : 30

  let query = supabase
    .from('agent_lab_simulation_runs')
    .select('id, owner_id, page_id, page_slug, query, engine_version, execution_mode, readiness, result, evidence, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (pageId) query = query.eq('page_id', pageId)

  const { data, error } = await query.returns<RunRow[]>()
  if (error) {
    return NextResponse.json({ error: 'Could not load Agent Lab history.' }, { status: 500 })
  }

  return NextResponse.json({ runs: (data ?? []).map((row) => rowToRun(row, true)) })
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'agent-lab-run', 20, 60_000)
  if (limited) return limited

  let body: { pageId?: unknown; slug?: unknown; query?: unknown; includeLlm?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const pageId = typeof body.pageId === 'string' ? body.pageId.trim() : ''
  const slug = typeof body.slug === 'string' ? body.slug.trim().replace(/^\//, '') : ''
  const query = typeof body.query === 'string' ? body.query.trim() : ''
  if ((!pageId && !slug) || !query) {
    return NextResponse.json({ error: 'A pageId or slug and a query are required.' }, { status: 400 })
  }
  if (query.length > 500) {
    return NextResponse.json({ error: 'Query must be 500 characters or fewer.' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()

  let page: AgentPage | null = null
  let ownedPage: { id: string; owner_id: string; slug: string } | null = null
  if (pageId && user) {
    const { data } = await supabase
      .from('pages')
      .select('id, owner_id, slug')
      .eq('id', pageId)
      .eq('owner_id', user.id)
      .eq('is_published', true)
      .maybeSingle<{ id: string; owner_id: string; slug: string }>()
    ownedPage = data
  }
  const publicSlug = ownedPage?.slug || slug
  if (publicSlug) {
    const { data } = await supabase
      .from('pages_public')
      .select(PUBLIC_PAGE_SELECT)
      .eq('slug', publicSlug)
      .eq('is_published', true)
      .maybeSingle<AgentPage>()
    page = data ? { ...data, owner_id: ownedPage?.owner_id ?? null } : null
  }
  if (!page) return NextResponse.json({ error: 'Published listing not found.' }, { status: 404 })

  try {
    const baseUrl = getRequestBaseUrl(request)
    const [field, deterministic] = await Promise.all([
      loadPublicPageField(supabase),
      Promise.resolve(runMultiAgentSimulation(page, query, baseUrl)),
    ])
    const rankAnalysis = analyzeQueryRank(field.pages, page, query)
    let results = deterministic.results
    const llmRequested = body.includeLlm !== false && page.llm_opt_in === true
    const llm = llmRequested
      ? await runLlmSimulation(page, query, baseUrl)
      : { executed: false, model: null, reason: 'not_requested', result: null }

    if (llm.executed && llm.result && deterministic.results[0]) {
      results = [
        ...deterministic.results,
        {
          ...deterministic.results[0],
          ...llm.result,
        },
      ]
    }

    const commerceOffers = commerceEvidenceFromResults(results)
    const evidence: AgentLabRunEvidence = {
      execution: {
        boundary: 'server',
        engineVersion: AGENT_LAB_ENGINE_VERSION,
        deterministicAgents: deterministic.results.length,
        llm: {
          requested: llmRequested,
          executed: llm.executed,
          model: llm.model,
          reason: llm.reason,
        },
      },
      competitiveField: {
        rankingPolicy: AGENT_SEARCH_RANKING_POLICY,
        visiblePagesEvaluated: field.pages.length,
        totalPublished: field.totalPublished,
        complete: field.complete,
        cap: field.cap,
      },
      commerce: {
        offersInspected: commerceOffers.length,
        runtimeDryRuns: 0,
        scope: 'published_contract',
        notice: 'Published action contracts were inspected. No checkout, payment, booking, inventory hold, or provider handoff was executed.',
        offers: commerceOffers,
      },
    }
    const createdAt = new Date().toISOString()
    const persistable = canPersistAgentLabRun(page, user?.id ?? null)
    const run: AgentLabRun = {
      id: crypto.randomUUID(),
      ownerId: persistable && user ? user.id : null,
      pageId: page.id,
      pageSlug: page.slug,
      query,
      engineVersion: AGENT_LAB_ENGINE_VERSION,
      executionMode: llm.executed ? 'deterministic_with_llm' : 'deterministic',
      readiness: getReadinessScore(page),
      result: {
        query,
        results,
        recommendations: getRecommendations(page),
        overallReadiness: getReadinessScore(page),
        success: deterministic.success,
        rankAnalysis,
      },
      evidence,
      createdAt,
      persisted: false,
    }

    if (persistable && user) {
      const { data, error } = await supabase
        .from('agent_lab_simulation_runs')
        .insert({
          id: run.id,
          owner_id: user.id,
          page_id: page.id,
          page_slug: page.slug,
          query,
          engine_version: AGENT_LAB_ENGINE_VERSION,
          execution_mode: run.executionMode,
          readiness: run.readiness,
          result: run.result,
          evidence,
          created_at: createdAt,
        })
        .select('id, owner_id, page_id, page_slug, query, engine_version, execution_mode, readiness, result, evidence, created_at')
        .single<RunRow>()
      if (error) {
        return NextResponse.json(
          { run, persisted: false, persistenceError: 'The analysis completed, but durable history could not be saved.' },
          { status: 200 },
        )
      }
      if (data) return NextResponse.json({ run: rowToRun(data, true), persisted: true })
    }

    return NextResponse.json({ run, persisted: false })
  } catch (error) {
    console.error('Agent Lab run failed:', error)
    return NextResponse.json({ error: 'Agent Lab analysis failed.' }, { status: 500 })
  }
}

function rowToRun(row: RunRow, persisted: boolean): AgentLabRun {
  return {
    id: row.id,
    ownerId: row.owner_id,
    pageId: row.page_id,
    pageSlug: row.page_slug,
    query: row.query,
    engineVersion: row.engine_version,
    executionMode: row.execution_mode,
    readiness: row.readiness,
    result: row.result,
    evidence: row.evidence,
    createdAt: row.created_at,
    persisted,
  }
}
