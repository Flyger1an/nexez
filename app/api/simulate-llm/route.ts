import { NextResponse } from 'next/server'
import { isLlmConfigured, llmComplete } from '../../../lib/llm'
import { buildParsedSchema } from '../../../lib/agent-simulator'
import { getRequestBaseUrl } from '../../../lib/agent-page'
import { supabase } from '../../../lib/supabase'

export async function POST(request: Request) {
  try {
    const { slug, query, pageId } = await request.json()

    if (!slug || !query) {
      return NextResponse.json({ error: 'slug and query required' }, { status: 400 })
    }

    const { data: pageData } = await supabase
      .from('pages')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .single()
    const page = pageData as any
    if (!page) {
      return NextResponse.json({ error: 'Page not found or not published' }, { status: 404 })
    }

    if (!isLlmConfigured()) {
      const schema = buildParsedSchema(page, query, 'LLM-Agent', getRequestBaseUrl(request))
      return NextResponse.json({
        success: true,
        query,
        agent: 'LLM-Enhanced',
        schema,
        naturalLanguage: schema.page?.summary || 'Deterministic simulation (LLM not configured).',
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
