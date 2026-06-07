import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { analyzeSite } from '../../../../lib/importer'
import { captureError } from '../../../../lib/observability'
import { createClient } from '../../../../utils/supabase/server'

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
    industry,
    targetBuyer,
    desiredAction,
    offerFocus,
    notes,
    location,
    clarifyingAnswers,
  } = body as {
    url?: string
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

  // Phase 5 robustness: overall timeout guard so importer never hangs the request (per-fetch already timeout'd)
  const OVERALL_TIMEOUT_MS = 14000
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
      }),
      timeout,
    ])

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
