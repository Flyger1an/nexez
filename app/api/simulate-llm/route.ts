import { NextResponse } from 'next/server'
import { buildParsedSchema } from '../../../lib/agent-simulator'
import { AgentPage, PUBLIC_PAGE_SELECT, getRequestBaseUrl } from '../../../lib/agent-page'
import { supabase } from '../../../lib/supabase'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { runLlmSimulation } from '../../../lib/server/llm-simulation'

export async function POST(request: Request) {
  // Public endpoint that runs a paid LLM against any published slug - throttle it.
  const limited = await enforceRateLimit(request, 'simulate-llm', 20, 60_000)
  if (limited) return limited

  let body: { slug?: unknown; query?: unknown; pageId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
    const query = typeof body.query === 'string' ? body.query.trim() : ''
    if (!slug || !query) {
      return NextResponse.json({ error: 'slug and query required' }, { status: 400 })
    }

    const { data: pageData } = await supabase
      .from('pages_public')
      .select(PUBLIC_PAGE_SELECT)
      .eq('slug', slug)
      .eq('is_published', true)
      .single()
    const page = pageData as AgentPage | null
    if (!page) {
      return NextResponse.json({ error: 'Page not found or not published' }, { status: 404 })
    }

    const outcome = await runLlmSimulation(page, query, getRequestBaseUrl(request))
    if (!outcome.executed || !outcome.result) {
      const schema = buildParsedSchema(page, query, 'LLM-Agent', getRequestBaseUrl(request))
      return NextResponse.json({
        success: true,
        query,
        agent: 'LLM-Enhanced',
        schema,
        naturalLanguage: schema.page?.summary || 'Deterministic simulation (LLM not enabled for this page).',
        llmEnhanced: false,
        reason: outcome.reason,
      })
    }

    return NextResponse.json({
      success: true,
      query,
      agent: outcome.result.agent,
      schema: outcome.result.schema,
      naturalLanguage: outcome.result.naturalLanguage,
      llmEnhanced: true,
      model: outcome.model,
    })
  } catch (error: any) {
    console.error('Simulate LLM error:', error)
    return NextResponse.json({ error: 'Simulation failed' }, { status: 500 })
  }
}
