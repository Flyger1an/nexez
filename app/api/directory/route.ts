import { NextResponse } from 'next/server'
import { AgentPage, PUBLIC_PAGE_SELECT, getBaseUrl, getReadinessScore, getTrustScore } from '../../../lib/agent-page'
import { buildMarketplaceInsights, classifyMarketplaceCategory, summarizeMarketplacePage } from '../../../lib/marketplace'
import { supabase } from '../../../lib/supabase'
import { publicLaunchVisiblePages } from '../../../lib/public-page-visibility'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') || 'all'
  const q = (searchParams.get('q') || '').toLowerCase().trim()
  const minReadiness = Math.max(0, parseInt(searchParams.get('min_readiness') || '0', 10) || 0)

  const { data: pages } = await supabase
    .from('pages_public')
    .select(PUBLIC_PAGE_SELECT)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .returns<AgentPage[]>()

  let filtered = publicLaunchVisiblePages(pages).filter(p => {
    if (category === 'all') return true

    const isConsumer = classifyMarketplaceCategory(p) === 'consumer'

    if (category === 'consumer') return isConsumer
    if (category === 'professional') return !isConsumer
    return true
  })

  if (q) {
    filtered = filtered.filter(p =>
      [p.name, p.description, p.audience, p.location].some(v => v?.toLowerCase().includes(q))
    )
  }

  // Compute readiness then filter (Phase 2 support for min_readiness)
  const withReadiness = filtered.map(p => ({
    p,
    readiness: getReadinessScore({
      ...p,
      products: p.products ?? [],
      services: p.services ?? [],
      faqs: p.faqs ?? [],
      is_published: true,
    }),
  }))

  const ready = minReadiness > 0 ? withReadiness.filter(r => r.readiness >= minReadiness) : withReadiness

  const base = getBaseUrl()
  const results = ready.map(({ p, readiness }) => {
    const offerCount = (p.services?.length || 0) + (p.products?.length || 0)
    const hasLastBooking = !!p.last_booking
    const verifiedCustom = !!(p as any).custom_domain_verified && !!(p as any).custom_domain
    const marketplace = summarizeMarketplacePage(p)

    return {
      name: p.name,
      slug: p.slug,
      description: p.description,
      url: `${base}/${p.slug}`,
      agent_json_url: `${base}/${p.slug}/agent.json`,
      readiness,
      industry: p.industry || null,
      location: p.location,
      audience: p.audience,
      offer_count: offerCount,
      last_booking_at: (p.last_booking as any)?.at || null,
      has_recent_activity: hasLastBooking,
      custom_domain: verifiedCustom ? (p as any).custom_domain : null,
      // Agent-first extra signals
      agent_optimized: readiness >= 75,
      prefer_original_default: !!p.prefer_original_site,
      trust_score: getTrustScore(p),
      verified: !!( (p as any).verification_details?.domain_verified || (p as any).custom_domain_verified ),
      has_credentials: Array.isArray((p as any).verification_details?.docs_provided) && (p as any).verification_details.docs_provided.length > 0,
      marketplace,
    }
  })

  return NextResponse.json({
    schema_version: 'nexez.directory.v2',
    count: results.length,
    filters: { category, q: q || null, min_readiness: minReadiness || null },
    marketplace: buildMarketplaceInsights(publicLaunchVisiblePages(pages), {
      query: q || undefined,
      category,
      minReadiness,
    }),
    results,
    // Helpful for agents consuming the directory
    note: 'All results are published agent-optimized pages. Use /<slug>/agent.json or /<slug> for full context.',
  })
}
