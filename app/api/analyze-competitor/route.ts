import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { analyzeCompetitorSite, analysisToMarkdown, analysisToJSON } from '@/lib/competitor-analyzer'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { PUBLIC_PAGE_SELECT, getReadinessScore, getTrustScore, getOfferCount } from '@/lib/agent-page'
import { enforceRateLimit } from '@/lib/rate-limit'
import { ownerAllows } from '@/lib/server/plan'
import { resolveFeatureOwner } from '@/lib/server/page-access'

// Scrapes an external site; allow headroom.
export const maxDuration = 30

/**
 * POST /api/analyze-competitor
 * Body: { url: string, userPageSlug?: string }
 * Returns full CompetitorAnalysis (with optional userComparison side-by-side).
 * Caching + respectful scraping handled in lib.
 */
export async function POST(request: Request) {
  // Dashboard-only feature that performs outbound scraping - require auth and throttle.
  const limited = await enforceRateLimit(request, 'analyze-competitor', 10, 60_000)
  if (limited) return limited

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let url: unknown
  let userPageSlug: unknown
  let pageId: unknown
  try {
    ;({ url, userPageSlug, pageId } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url (string) is required' }, { status: 400 })
  }

  // Authorize + gate on the EFFECTIVE OWNER: a `pageId` lets an editor-collaborator run
  // the analysis for the page OWNER (AI gate on the OWNER's plan); the page-less/sandbox
  // flow self-gates. LLM competitor analysis is an AI feature (Launch+) with no
  // deterministic fallback, so return a clear upgrade signal below the threshold.
  const access = await resolveFeatureOwner({
    pageId: typeof pageId === 'string' ? pageId : undefined,
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
  if (!(await ownerAllows(access.scoped ? createAdminClient() : supabase, access.ownerId, 'aiFeatures'))) {
    return NextResponse.json({ error: 'Competitor analysis is an AI feature. Upgrade to the Launch plan or higher to unlock it.', upgrade: 'launch' }, { status: 402 })
  }

  try {
    let userComparisonData: any = null
    if (userPageSlug && typeof userPageSlug === 'string') {
      // Server-side fetch of a published page for side-by-side. Read the redacted
      // pages_public VIEW (not base `pages`): this is a by-slug, NOT owner-scoped
      // read with the authed client, so reading base pages would depend on the
      // broad published-read RLS policy we're removing (H1). The view exposes the
      // same PUBLIC_PAGE_SELECT columns minus owner-private offer `rules`.
      try {
        const { data: pageData, error: fetchError } = await supabase
          .from('pages_public')
          .select(PUBLIC_PAGE_SELECT)
          .eq('slug', userPageSlug.replace(/^\//, ''))
          .eq('is_published', true)
          .single()

        if (pageData && !fetchError) {
          // compute live scores (events not fetched here for speed; caller can enhance)
          const page = pageData as any
          const readiness = getReadinessScore(page)
          const trust = getTrustScore(page)
          const offerCount = getOfferCount(page)
          userComparisonData = {
            slug: page.slug,
            name: page.name,
            readiness,
            trust,
            offerCount,
            description: page.description,
          }
        }
      } catch (e) {
        // non-fatal for side-by-side
        console.warn('userPageSlug side-by-side lookup failed (non-fatal)', e)
      }
    }

    const analysis = await analyzeCompetitorSite(url, {
      userNexezPage: userComparisonData,
    })

    return NextResponse.json({
      success: true,
      analysis,
      // convenience exports
      markdown: analysisToMarkdown(analysis),
      json: analysisToJSON(analysis),
    })
  } catch (error: any) {
    console.error('analyze-competitor error', error)
    return NextResponse.json({ error: 'Analysis failed', detail: String(error?.message || error) }, { status: 500 })
  }
}

// Optional GET for quick health / docs (not used in UI yet)
export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: 'POST { url: "https://example.com", userPageSlug?: "your-slug" }',
    note: 'Returns detailed agent-perception analysis + optional side-by-side. Cached 48h. Respects robots.txt.',
  })
}
