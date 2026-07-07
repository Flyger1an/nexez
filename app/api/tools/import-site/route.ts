import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { analyzeSite } from '../../../../lib/importer'
import { isLlmConfigured, llmComplete } from '../../../../lib/llm'
import { captureError } from '../../../../lib/observability'
import { createClient } from '../../../../utils/supabase/server'
import { ownerAllows } from '../../../../lib/server/plan'
import { resolvePageAccess } from '../../../../lib/server/page-access'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

// Multi-page crawl (+ optional LLM extraction); allow headroom.
export const maxDuration = 45

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sign in to import a website.' }, { status: 401 })
  }

  // Phase 1 A: Thin production wrapper (full logic now in lib/importer.ts with multi-path, industry awareness, rich OfferItem output)
  const body = await request.json().catch(() => ({} as any))
  const {
    url,
    pageId,
    industry,
    targetBuyer,
    desiredAction,
    offerFocus,
    notes,
    location,
    clarifyingAnswers,
  } = body as {
    url?: string
    pageId?: string
    industry?: string
    targetBuyer?: string
    desiredAction?: string
    offerFocus?: string
    notes?: string
    location?: string
    clarifyingAnswers?: Array<{
      id?: string | null
      field?: string | null
      question?: string
      answer?: string
    }>
  }

  if (!url) {
    return NextResponse.json({ error: 'Website URL is required' }, { status: 400 })
  }

  // Collaboration: when a pageId is supplied, the action runs in the context of that
  // page - an editor-collaborator inherits the PAGE OWNER's plan (so the AI path is
  // gated on the owner's entitlement, not the logged-in collaborator's). When no
  // pageId is supplied (e.g. the create flow before a page exists, or the standalone
  // tools sandbox), keep the legacy self-gate. This route is stateless: it never
  // reads or writes the owner's data, so no admin-scoped DB I/O beyond the gate.
  let aiAllowed: boolean
  if (pageId !== undefined && pageId !== null && String(pageId).trim() !== '') {
    if (!hasSupabaseAdminEnv()) {
      return NextResponse.json({ error: 'Server is not configured for this action.' }, { status: 503 })
    }
    const access = await resolvePageAccess({
      pageId,
      userId: user.id,
      userEmail: user.email,
      userEmailConfirmedAt: user.email_confirmed_at,
      requireEditor: true,
    })
    if (!access) {
      return NextResponse.json({ error: 'You do not have edit access to this page.' }, { status: 403 })
    }
    // Gate on the OWNER's plan via the service-role client (the collaborator's
    // session client cannot read the owner's billing_subscriptions row under RLS).
    aiAllowed = await ownerAllows(createAdminClient(), access.ownerId, 'aiFeatures')
  } else {
    // LLM-assisted extraction + the auto agent-memory suggestion are `aiFeatures`
    // (Launch+). Below that, run the deterministic crawl only (still a real,
    // structured import) so Free users keep a working importer without the paid LLM.
    aiAllowed = await ownerAllows(supabase, user.id, 'aiFeatures')
  }
  const llmEnabled = isLlmConfigured() && aiAllowed

  // Phase 5 robustness: overall timeout guard so importer never hangs the request (per-fetch already timeout'd).
  // The deterministic crawl finishes well inside 14s, but the guided AI path can
  // add up to two ~12s model calls - give it headroom under maxDuration (45s)
  // so the race doesn't clip LLM-assisted imports.
  const OVERALL_TIMEOUT_MS = llmEnabled ? 40_000 : 14_000
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Analysis timed out. Partial results may be available on retry or try a simpler URL.')), OVERALL_TIMEOUT_MS))

  try {
    const result = await Promise.race([
      analyzeSite(url, {
        industry: industry || null,
        targetBuyer: targetBuyer || null,
        desiredAction: desiredAction || null,
        offerFocus: offerFocus || null,
        notes: notes || null,
        location: location || null,
        clarifyingAnswers: Array.isArray(clarifyingAnswers)
          ? clarifyingAnswers
              .map((item) => ({
                id: item.id || null,
                field: item.field || null,
                question: item.question || '',
                answer: item.answer || '',
              }))
              .filter((item) => item.question && item.answer)
          : null,
      }, { skipLlm: !aiAllowed }),
      timeout,
    ])

    let autoMemorySuggestion = null
    if (llmEnabled) {
      try {
        const memPrompt = `From this imported site data, generate 2-3 concise agent memory notes (buyer prefs, restrictions, key facts). Data: ${result.description} Offers: ${result.servicesText}`
        autoMemorySuggestion = await llmComplete(memPrompt, { maxTokens: 80 }) || null
      } catch { autoMemorySuggestion = null }
    }

    return NextResponse.json({
      ok: true,
      suggestedPage: {
        name: result.title,
        description: result.description,
        website_url: result.website_url,
        services: result.servicesText,
        industry: result.industry,
        logo_url: result.logo_url || null,
        audience: result.audience,
        location: result.location,
        cta_url: result.cta_url,
        cta_label: result.cta_label,
        faqs: result.faqs,
      },
      structuredOffers: result.structuredOffers,
      pagesAnalyzed: result.pagesAnalyzed,
      confidence: result.confidence,
      // Auto on import: LLM-generated memory suggestion if key configured (user can accept in settings)
      autoMemorySuggestion,
      reviewNotes: result.reviewNotes,
      sources: result.sources,
      clarifyingQuestions: result.clarifyingQuestions,
      readiness: result.readiness,
      aiStatus: result.aiStatus,
      aiAssisted: result.aiStatus.used,
      message: `Website analyzed across ${result.pagesAnalyzed} page(s). Rich structured offers ready for the Visual Builder.`,
    })
  } catch (error: any) {
    captureError(error, { route: 'import-site' })
    return NextResponse.json({
      error: error.message || 'Failed to analyze the website. Please try again or create the page manually.'
    }, { status: 500 })
  }
}
