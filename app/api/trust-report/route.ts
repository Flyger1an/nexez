import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isLlmConfigured, llmComplete } from '../../../lib/llm'
import { getTrustScore } from '../../../lib/agent-page'
import { createClient } from '../../../utils/supabase/server'
import { createAdminClient } from '../../../utils/supabase/admin'
import { ownerAllows } from '../../../lib/server/plan'
import { resolveFeatureOwner } from '../../../lib/server/page-access'
import { enforceRateLimit } from '../../../lib/rate-limit'

export async function POST(request: Request) {
  // Dashboard-only feature that invokes a paid LLM — require auth and throttle.
  const limited = await enforceRateLimit(request, 'trust-report', 15, 60_000)
  if (limited) return limited

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const { page, events, pageId } = await request.json()

    if (!page) {
      return NextResponse.json({ error: 'page data required' }, { status: 400 })
    }

    // Authorize: a `pageId` lets an editor-collaborator run the report on the page
    // OWNER's behalf (the AI gate is then decided on the OWNER's plan); the page-less /
    // sandbox flow self-gates on the caller. A stranger/viewer with a pageId is denied.
    const access = await resolveFeatureOwner({
      pageId,
      userId: user.id,
      userEmail: user.email,
      userEmailConfirmedAt: user.email_confirmed_at,
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 503 ? 'Server is not configured for this action.' : 'You do not have edit access to this page.' },
        { status: access.status },
      )
    }

    const score = getTrustScore(page, events || [])
    const verification = (page as any).verification_details || {}

    // The LLM-written report is an `aiFeatures` (Launch+) capability OF THE OWNER. Below
    // that, fall back to the deterministic score-only report (same fail-soft shape as
    // the no-LLM branch) so the feature still returns something useful.
    const aiAllowed = await ownerAllows(access.scoped ? createAdminClient() : supabase, access.ownerId, 'aiFeatures')
    if (!isLlmConfigured() || !aiAllowed) {
      return NextResponse.json({
        success: true,
        score,
        report: `Trust Score: ${score}/100. Based on readiness (${Math.round(score * 0.6)} base), verification signals, and events.${aiAllowed ? ' Configure LLM for advanced report.' : ' Upgrade to Launch for an AI-written trust report.'}`,
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
