import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { analyzeCompetitorSite, analysisToMarkdown, analysisToJSON } from '@/lib/competitor-analyzer'
import { createClient } from '@/utils/supabase/server'
import { PUBLIC_PAGE_SELECT, getReadinessScore, getTrustScore, getOfferCount } from '@/lib/agent-page'

/**
 * POST /api/analyze-competitor
 * Body: { url: string, userPageSlug?: string }
 * Returns full CompetitorAnalysis (with optional userComparison side-by-side).
 * Caching + respectful scraping handled in lib.
 */
export async function POST(request: Request) {
  try {
    const { url, userPageSlug } = await request.json()

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url (string) is required' }, { status: 400 })
    }

    let userComparisonData: any = null
    if (userPageSlug && typeof userPageSlug === 'string') {
      // Server-side fetch of the user's Nexez page for side-by-side (owner not strictly required for read of published)
      try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)
        const { data: pageData, error: fetchError } = await supabase
          .from('pages')
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
