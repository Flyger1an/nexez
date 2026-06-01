import { NextResponse } from 'next/server'
import { analyzeSite } from '../../../../lib/importer'

export async function POST(request: Request) {
  // Phase 1 A: Thin production wrapper (full logic now in lib/importer.ts with multi-path, industry awareness, rich OfferItem output)
  const body = await request.json().catch(() => ({} as any))
  const { url, industry } = body as { url?: string; industry?: string }

  if (!url) {
    return NextResponse.json({ error: 'Website URL is required' }, { status: 400 })
  }

  try {
    const result = await analyzeSite(url, industry || null)

    return NextResponse.json({
      ok: true,
      suggestedPage: {
        name: result.title,
        description: result.description,
        website_url: result.website_url,
        services: result.servicesText,
        industry: result.industry,
      },
      structuredOffers: result.structuredOffers,
      message: `Website analyzed across ${result.pagesAnalyzed} page(s). Rich structured offers ready for the Visual Builder.`,
    })
  } catch (error: any) {
    console.error('Site import error:', error)
    return NextResponse.json({
      error: error.message || 'Failed to analyze the website. Please try again or create the page manually.'
    }, { status: 500 })
  }
}