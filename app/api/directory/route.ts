import { NextResponse } from 'next/server'
import { AgentPage, PUBLIC_PAGE_SELECT, getBaseUrl, getReadinessScore } from '../../../lib/agent-page'
import { buildAgentStorefrontRef } from '../../../lib/agent-manifest'
import { buildMarketplaceInsights, classifyMarketplaceCategory, summarizeMarketplacePage } from '../../../lib/marketplace'
import { supabase } from '../../../lib/supabase'
import { publicLaunchVisiblePages } from '../../../lib/public-page-visibility'
import { cleanLocationQuery, filterPagesByLocation, getPageLocationMatch, locationFilterMeta } from '../../../lib/location-filter'
import { loadReviewSummariesForSlugs } from '../../../lib/server/reviews'
import { loadStorefrontHandlesForSlugs } from '../../../lib/server/storefront'
import { resolvePublicCommerceCapabilities } from '../../../lib/server/public-commerce-capabilities'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') || 'all'
  const q = (searchParams.get('q') || '').toLowerCase().trim()
  const minReadiness = Math.max(0, parseInt(searchParams.get('min_readiness') || '0', 10) || 0)
  const location = cleanLocationQuery(searchParams.get('location'))
  const lat = optionalNumber(searchParams.get('lat'))
  const lng = optionalNumber(searchParams.get('lng'))

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
  filtered = filterPagesByLocation(filtered, location)

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
  const readySlugs = ready.map(({ p }) => p.slug)
  const [storefrontHandles, reviewSummaries, commerceCapabilities] = await Promise.all([
    loadStorefrontHandlesForSlugs(readySlugs),
    loadReviewSummariesForSlugs(readySlugs, 0),
    resolvePublicCommerceCapabilities(readySlugs),
  ])
  const results = ready.map(({ p, readiness }) => {
    const offerCount = (p.services?.length || 0) + (p.products?.length || 0)
    const hasLastBooking = !!p.last_booking
    const verifiedCustom = !!(p as any).custom_domain_verified && !!(p as any).custom_domain
    const marketplace = summarizeMarketplacePage(p, {
      negotiationAllowed: commerceCapabilities.negotiationEligibleSlugs.has(p.slug),
      nexezCheckoutReady: commerceCapabilities.checkoutReadySlugs.has(p.slug),
    })
    const locationMatch = location ? getPageLocationMatch(p, location) : null
    const storefrontHandle = storefrontHandles.get(p.slug)
    const storefront = storefrontHandle ? buildAgentStorefrontRef(storefrontHandle, base) : null
    const reviewSummary = reviewSummaries.get(p.slug)

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
      trust_score: marketplace.trust_score,
      // `marketplace.verified` is derived only from server-backed domain/website
      // proof. Credential presence is disclosed separately and is not verification.
      verified: marketplace.verified,
      has_credentials: marketplace.has_credentials,
      rating_summary: reviewSummary?.count
        ? {
            average: reviewSummary.average,
            count: reviewSummary.count,
            verified_count: reviewSummary.verified_count,
            reputation_score: reviewSummary.reputation_score,
            distribution: reviewSummary.distribution,
            recent_positive_tags: reviewSummary.recent_positive_tags,
          }
        : null,
      marketplace,
      location_match: locationMatch,
      ...(storefront ? { storefront } : {}),
    }
  })

  return NextResponse.json({
    schema_version: 'nexez.directory.v2',
    count: results.length,
    filters: { category, q: q || null, min_readiness: minReadiness || null, location: location || null },
    location_filter: locationFilterMeta(location, {
      lat,
      lng,
    }),
    marketplace: buildMarketplaceInsights(ready.map(({ p }) => p), {
      query: q || undefined,
      category,
      minReadiness,
      negotiationEligibleSlugs: commerceCapabilities.negotiationEligibleSlugs,
      checkoutReadySlugs: commerceCapabilities.checkoutReadySlugs,
    }),
    results,
    // Helpful for agents consuming the directory
    note: 'All results are published agent-optimized listings. Use /<slug>/agent.json or /<slug> for full context.',
  })
}

function optionalNumber(value: string | null) {
  if (value === null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
