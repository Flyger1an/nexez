import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isLlmConfigured, llmComplete } from '../../../lib/llm'
import { getReadinessScore, getServerVerificationEvidence, getTrustScore } from '../../../lib/agent-page'
import { createClient } from '../../../utils/supabase/server'
import { createAdminClient } from '../../../utils/supabase/admin'
import { ownerAllows } from '../../../lib/server/plan'
import { resolveFeatureOwner } from '../../../lib/server/page-access'
import { enforceRateLimit } from '../../../lib/rate-limit'

export async function POST(request: Request) {
  // Dashboard-only feature that invokes a paid LLM - require auth and throttle.
  const limited = await enforceRateLimit(request, 'trust-report', 15, 60_000)
  if (limited) return limited

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const { page, pageId } = await request.json()

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

    // Trust evidence must come from a persisted row. The page-shaped request body is
    // useful for previewing unsaved copy/readiness, but it is controlled by the caller
    // and therefore cannot assert verification or transaction history.
    const admin = access.scoped ? createAdminClient() : null
    let trustedPage = {
      ...page,
      custom_domain_verified: null,
      website_verified_at: null,
    }
    let trustedEvents: Array<{ event_type: string }> = []

    if (access.scoped && access.pageId && admin) {
      const { data: persisted } = await admin
        .from('pages')
        .select('slug, custom_domain_verified, website_verified_at')
        .eq('id', access.pageId)
        .eq('owner_id', access.ownerId)
        .maybeSingle<{
          slug: string
          custom_domain_verified: string | boolean | null
          website_verified_at: string | null
        }>()

      if (persisted) {
        trustedPage = {
          ...trustedPage,
          custom_domain_verified: persisted.custom_domain_verified,
          website_verified_at: persisted.website_verified_at,
        }
        const { data: persistedEvents } = await admin
          .from('checkout_events')
          .select('event_type')
          .eq('slug', persisted.slug)
          .order('created_at', { ascending: false })
          .limit(100)
        trustedEvents = (persistedEvents || []) as Array<{ event_type: string }>
      }
    }

    const score = getTrustScore(trustedPage, trustedEvents)
    const readinessBase = Math.round(getReadinessScore(trustedPage) * 0.6)
    const evidence = getServerVerificationEvidence(trustedPage)
    const claimedCredentialCount = Array.isArray(page?.verification_details?.docs_provided)
      ? page.verification_details.docs_provided.length
      : 0

    // The LLM-written report is an `aiFeatures` (Launch+) capability OF THE OWNER. Below
    // that, fall back to the deterministic score-only report (same fail-soft shape as
    // the no-LLM branch) so the feature still returns something useful.
    const aiAllowed = await ownerAllows(admin ?? supabase, access.ownerId, 'aiFeatures')
    if (!isLlmConfigured() || !aiAllowed) {
      return NextResponse.json({
        success: true,
        score,
        report: `Trust Score: ${score}/100. Based on readiness (${readinessBase} base), server-backed verification, and transaction events.${aiAllowed ? ' Configure LLM for advanced report.' : ' Upgrade to Launch for an AI-written trust report.'}`,
        llmEnhanced: false,
      })
    }

    const prompt = `Generate a concise trust report for this Nexez page for AI agents and business owner.
Page: ${page.name} - ${page.description || ''}
Readiness: ${readinessBase}/60 base
Server-backed verification: Custom domain ${evidence.customDomainVerified ? 'verified' : 'no'}, existing website ${evidence.websiteVerified ? 'verified' : 'no'}.
Seller-provided credentials: ${claimedCredentialCount} (claims only; excluded from verification and Trust Score).
Persisted events: ${trustedEvents.length} signals, completion implied.
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
