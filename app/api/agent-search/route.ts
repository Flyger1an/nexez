import { AgentPage, PUBLIC_PAGE_SELECT, getRequestBaseUrl } from '../../../lib/agent-page'
import { searchAgentPages } from '../../../lib/agent-search'
import { supabase } from '../../../lib/supabase'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { publicLaunchVisiblePages } from '../../../lib/public-page-visibility'
import { cleanLocationQuery, filterPagesByLocation, locationFilterMeta } from '../../../lib/location-filter'
import { loadReviewSummariesForSlugs } from '../../../lib/server/reviews'
import { loadStorefrontHandlesForSlugs } from '../../../lib/server/storefront'

export async function GET(request: Request) {
  // Public agent-facing search - throttle to blunt scraping/DB abuse.
  const limited = await enforceRateLimit(request, 'agent-search', 30, 60_000)
  if (limited) return limited

  const url = new URL(request.url)
  const query = url.searchParams.get('q') || ''
  const limit = Number(url.searchParams.get('limit') || 10)
  const location = cleanLocationQuery(url.searchParams.get('location'))
  const lat = optionalNumber(url.searchParams.get('lat'))
  const lng = optionalNumber(url.searchParams.get('lng'))

  const { data: pages, error } = await supabase
    .from('pages_public')
    .select(PUBLIC_PAGE_SELECT)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(100)
    .returns<AgentPage[]>()

  if (error) {
    return Response.json(
      {
        error: 'Search is temporarily unavailable.',
        details: error.message,
      },
      { status: 500 },
    )
  }

  const baseUrl = getRequestBaseUrl(request)
  const visiblePages = publicLaunchVisiblePages(pages)
  const visibleSlugs = visiblePages.map((page) => page.slug)
  const [storefrontHandles, reviewSummaries] = await Promise.all([
    loadStorefrontHandlesForSlugs(visibleSlugs),
    loadReviewSummariesForSlugs(visibleSlugs, 0),
  ])
  const locationFilteredPages = filterPagesByLocation(visiblePages, location)
  const results = searchAgentPages(locationFilteredPages, query, Number.isFinite(limit) ? limit : 10, baseUrl, {
    location,
    storefrontHandles,
    reviewSummaries,
  })
  const searchParams = new URLSearchParams({ q: query })
  if (location) searchParams.set('location', location)
  if (lat != null) searchParams.set('lat', String(lat))
  if (lng != null) searchParams.set('lng', String(lng))

  return Response.json(
    {
      schema_version: 'nexez.agent-search.v1',
      generated_at: new Date().toISOString(),
      query,
      location_filter: locationFilterMeta(location, {
        lat,
        lng,
      }),
      result_count: results.length,
      search_url: `${baseUrl}/api/agent-search?${searchParams.toString()}`,
      results,
      usage: {
        method: 'GET',
        example: `${baseUrl}/api/agent-search?q=plumbing&location=Chicago%2C%20IL`,
        note: 'Returns published AI-readable pages and offer-level checkout actions. Pass location to filter by page location and offer service areas. lat/lng are context metadata only and do not filter or rerank results.',
      },
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=180',
        // Out of Google's index; agents still fetch/crawl this freely.
        'X-Robots-Tag': 'noindex',
      },
    },
  )
}

function optionalNumber(value: string | null) {
  if (value === null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
