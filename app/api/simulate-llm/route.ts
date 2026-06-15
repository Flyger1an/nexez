import { NextResponse } from 'next/server'
import { isLlmConfigured, llmComplete } from '../../../lib/llm'
import { buildParsedSchema } from '../../../lib/agent-simulator'
import { getRequestBaseUrl } from '../../../lib/agent-page'
import { supabase } from '../../../lib/supabase'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { ownerAllows } from '../../../lib/server/plan'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../utils/supabase/admin'

export async function POST(request: Request) {
  // Public endpoint that runs a paid LLM against any published slug — throttle it.
  const limited = await enforceRateLimit(request, 'simulate-llm', 20, 60_000)
  if (limited) return limited

  try {
    const { slug, query, pageId } = await request.json()

    if (!slug || !query) {
      return NextResponse.json({ error: 'slug and query required' }, { status: 400 })
    }

    const { data: pageData } = await supabase
      .from('pages_public')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .single()
    const page = pageData as any
    if (!page) {
      return NextResponse.json({ error: 'Page not found or not published' }, { status: 404 })
    }

    // Respect the page owner's consent: only send their page to a real LLM when the
    // page opted in (llm_opt_in). Otherwise fall back to the deterministic simulation
    // — this also stops an attacker forcing paid LLM calls against arbitrary slugs.
    // Plan gate: AI features unlock on Launch+. Resolve the owner's plan with the
    // admin client (this is a public route; the anon client can't read another
    // owner's billing row). If admin isn't configured, fall back to the opt-in gate.
    const planAllowsAi = hasSupabaseAdminEnv()
      ? await ownerAllows(createAdminClient(), page.owner_id, 'aiFeatures')
      : true
    const llmEnabled = isLlmConfigured() && page.llm_opt_in === true && planAllowsAi
    if (!llmEnabled) {
      const schema = buildParsedSchema(page, query, 'LLM-Agent', getRequestBaseUrl(request))
      return NextResponse.json({
        success: true,
        query,
        agent: 'LLM-Enhanced',
        schema,
        naturalLanguage: schema.page?.summary || 'Deterministic simulation (LLM not enabled for this page).',
        llmEnhanced: false,
      })
    }

    const model = process.env.LLM_MODEL || 'platform-llm'
    const schema = buildParsedSchema(page, query, `${model}-Agent`, getRequestBaseUrl(request))

    const prompt = `You are an AI agent (like the platform's configured LLM) analyzing this business page for the query: "${query}".
Page: ${page.name} - ${page.description || ''}
Offers: ${JSON.stringify(page.services || page.products || []).slice(0, 500)}
Audience: ${page.audience || 'qualified buyers'}
Location: ${page.location || 'N/A'}

Generate a realistic, helpful, concise agent response as if you visited the page. Include:
- Interpretation of the query
- Best matching offer(s) with reasons
- Suggested next action (book, contact, etc.)
- Any questions for clarification
Keep under 150 words, factual, agent-like tone.`

    const llmResponse = await llmComplete(prompt, {
      maxTokens: 200,
      temperature: 0.6,
    })

    return NextResponse.json({
      success: true,
      query,
      agent: `LLM-Enhanced (${model})`,
      schema,
      naturalLanguage: llmResponse || schema.page?.summary || 'LLM response unavailable.',
      llmEnhanced: true,
      model,
    })
  } catch (error: any) {
    console.error('Simulate LLM error:', error)
    return NextResponse.json({ error: 'Simulation failed' }, { status: 500 })
  }
}
