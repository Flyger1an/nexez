import { NextResponse } from 'next/server'
import {
  getDemoPage,
  buildPublicDemoSchema,
  getRecommendations,
  interpretPublicQuery,
} from '@/lib/agent-simulator'
import { getRequestBaseUrl } from '@/lib/agent-page'
import { isLlmConfigured, llmComplete } from '@/lib/llm'
import { enforceRateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  // Public, unauthenticated demo endpoint that invokes a paid LLM — throttle it.
  const limited = await enforceRateLimit(request, 'public-simulate', 20, 60_000)
  if (limited) return limited

  let body: { query?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const { query } = body

    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    const demoPage = getDemoPage()
    // Query-aware interpretation: intent, ranked offers, tailored answer + actions.
    const interpretation = interpretPublicQuery(demoPage, query)
    const schema = buildPublicDemoSchema(demoPage, query, getRequestBaseUrl(request))
    const recommendations = getRecommendations(demoPage)

    let naturalLanguage = interpretation.answer
    // Advanced: Use platform LLM (Grok or configured) for more sophisticated, agent-like natural language response when available
    if (isLlmConfigured()) {
      try {
        const llmResponse = await llmComplete(
          `As an AI agent (e.g. like ChatGPT or Claude visiting this page), respond naturally and helpfully to the buyer query: "${query}". Use the page context: ${JSON.stringify({ name: demoPage.name, summary: demoPage.description, offers: interpretation.offers })}. Be concise, actionable, quote specific offers/prices if relevant. Do not mention guidelines.`,
          { maxTokens: 150, temperature: 0.5 }
        )
        if (llmResponse) naturalLanguage = llmResponse.trim()
      } catch (e) {
        // fall back to deterministic
      }
    }

    return NextResponse.json({
      success: true,
      query: interpretation.query,
      intent: interpretation.intent,
      intentLabel: interpretation.intentLabel,
      naturalLanguage,
      readiness: interpretation.readiness,
      confidence: interpretation.confidence,
      offers: interpretation.offers,
      agentActions: interpretation.agentActions,
      schema,
      recommendations,
      llmEnhanced: isLlmConfigured(),
    })
  } catch (error: any) {
    console.error('Public simulate error:', error)
    return NextResponse.json(
      { error: 'Simulation failed' },
      { status: 500 }
    )
  }
}
