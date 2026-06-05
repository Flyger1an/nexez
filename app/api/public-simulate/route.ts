import { NextResponse } from 'next/server'
import {
  getDemoPage,
  buildPublicDemoSchema,
  getRecommendations,
  interpretPublicQuery,
} from '@/lib/agent-simulator'
import { getRequestBaseUrl } from '@/lib/agent-page'

export async function POST(request: Request) {
  try {
    const { query } = await request.json()

    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    const demoPage = getDemoPage()
    // Query-aware interpretation: intent, ranked offers, tailored answer + actions.
    const interpretation = interpretPublicQuery(demoPage, query)
    const schema = buildPublicDemoSchema(demoPage, query, getRequestBaseUrl(request))
    const recommendations = getRecommendations(demoPage)

    return NextResponse.json({
      success: true,
      query: interpretation.query,
      intent: interpretation.intent,
      intentLabel: interpretation.intentLabel,
      naturalLanguage: interpretation.answer,
      readiness: interpretation.readiness,
      confidence: interpretation.confidence,
      offers: interpretation.offers,
      agentActions: interpretation.agentActions,
      schema,
      recommendations,
    })
  } catch (error: any) {
    console.error('Public simulate error:', error)
    return NextResponse.json(
      { error: 'Simulation failed' },
      { status: 500 }
    )
  }
}
