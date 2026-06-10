import { NextResponse } from 'next/server'
import { isLlmConfigured, llmComplete } from '../../../lib/llm'
import { getTrustScore } from '../../../lib/agent-page'

export async function POST(request: Request) {
  try {
    const { page, events } = await request.json()

    if (!page) {
      return NextResponse.json({ error: 'page data required' }, { status: 400 })
    }

    const score = getTrustScore(page, events || [])
    const verification = (page as any).verification_details || {}

    if (!isLlmConfigured()) {
      return NextResponse.json({
        success: true,
        score,
        report: `Trust Score: ${score}/100. Based on readiness (${Math.round(score * 0.6)} base), verification signals, and events. Configure LLM for advanced report.`,
        llmEnhanced: false,
      })
    }

    const prompt = `Generate a concise trust report for this Nexez page for AI agents and business owner.
Page: ${page.name} - ${page.description || ''}
Readiness: ${Math.round(score * 0.6)}/60 base
Verification: Email ${verification.email_verified ? 'verified' : 'no'}, Domain ${verification.domain_verified || page.custom_domain_verified ? 'verified' : 'no'}, Docs: ${(verification.docs_provided || []).length}
Events: ${(events || []).length} signals, completion implied.
Trust Score: ${score}/100

Provide:
- 1 sentence summary of current trust level for agents.
- 2-3 specific, actionable recommendations to improve (e.g. add more verification, offers).
Keep under 120 words, professional, agent-focused.`

    const report = await llmComplete(prompt, { maxTokens: 150, temperature: 0.4 })

    return NextResponse.json({
      success: true,
      score,
      report: report || `Trust Score: ${score}/100. Solid base from readiness and signals.`,
      llmEnhanced: true,
    })
  } catch (error: any) {
    console.error('Trust report error:', error)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
