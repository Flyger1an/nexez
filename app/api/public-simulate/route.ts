import { NextResponse } from 'next/server'
import { 
  getDemoPage, 
  buildPublicDemoSchema, 
  getRecommendations 
} from '@/lib/agent-simulator'

export async function POST(request: Request) {
  try {
    const { query } = await request.json()

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    const demoPage = getDemoPage()
    const schema = buildPublicDemoSchema(demoPage, query)
    const recommendations = getRecommendations(demoPage)

    // Simple but realistic natural language summary for the teaser
    const audienceText = (demoPage.audience || 'ambitious teams').toLowerCase()
    const nlSummary = `${demoPage.name} helps ${audienceText}. They offer ${demoPage.services?.length || 0} main services and some products, all clearly priced with direct actions. The page is highly structured so agents can parse offers, compare, and route intent immediately.`

    return NextResponse.json({
      success: true,
      query,
      schema,
      recommendations,
      naturalLanguage: nlSummary,
    })
  } catch (error: any) {
    console.error('Public simulate error:', error)
    return NextResponse.json(
      { error: 'Simulation failed' }, 
      { status: 500 }
    )
  }
}
