import { getRequestBaseUrl } from '../../../lib/agent-page'
import {
  AGENT_SEARCH_RANKING_POLICY,
  searchAgentPages,
  type AgentSearchOptions,
} from '../../../lib/agent-search'
import { supabase } from '../../../lib/supabase'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { cleanLocationQuery, filterPagesByLocation, locationFilterMeta } from '../../../lib/location-filter'
import { loadReviewSummariesForSlugs } from '../../../lib/server/reviews'
import { loadStorefrontHandlesForSlugs } from '../../../lib/server/storefront'
import { loadPublicPageField } from '../../../lib/server/public-page-field'
import { resolvePublicCommerceCapabilities } from '../../../lib/server/public-commerce-capabilities'

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
  const filters = parseSearchFilters(url.searchParams)
  if (!filters.ok) {
    return Response.json({ error: filters.error, code: 'invalid_search_filter' }, { status: 400 })
  }

  let field
  try {
    field = await loadPublicPageField(supabase)
  } catch (error) {
    return Response.json(
      {
        error: 'Search is temporarily unavailable.',
        details: error instanceof Error ? error.message : 'Unknown discovery field error.',
      },
      { status: 500 },
    )
  }

  const baseUrl = getRequestBaseUrl(request)
  const visiblePages = field.pages
  const visibleSlugs = visiblePages.map((page) => page.slug)
  const [storefrontHandles, reviewSummaries, commerceCapabilities] = await Promise.all([
    loadStorefrontHandlesForSlugs(visibleSlugs),
    loadReviewSummariesForSlugs(visibleSlugs, 0),
    resolvePublicCommerceCapabilities(visibleSlugs),
  ])
  const locationFilteredPages = filterPagesByLocation(visiblePages, location)
  const results = searchAgentPages(locationFilteredPages, query, Number.isFinite(limit) ? limit : 10, baseUrl, {
    location,
    storefrontHandles,
    reviewSummaries,
    negotiationEligibleSlugs: commerceCapabilities.negotiationEligibleSlugs,
    checkoutReadySlugs: commerceCapabilities.checkoutReadySlugs,
    ...filters.options,
  })
  const searchParams = new URLSearchParams({ q: query })
  searchParams.set('limit', String(Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 10))
  if (location) searchParams.set('location', location)
  if (lat != null) searchParams.set('lat', String(lat))
  if (lng != null) searchParams.set('lng', String(lng))
  appendSearchFilters(searchParams, filters.options)

  return Response.json(
    {
      schema_version: 'nexez.agent-search.v1',
      ranking_policy: AGENT_SEARCH_RANKING_POLICY,
      generated_at: new Date().toISOString(),
      query,
      filters: serializeSearchFilters(filters.options),
      location_filter: locationFilterMeta(location, {
        lat,
        lng,
      }),
      result_count: results.length,
      field_coverage: {
        visible_pages_evaluated: visiblePages.length,
        total_published: field.totalPublished,
        complete: field.complete,
        cap: field.cap,
      },
      search_url: `${baseUrl}/api/agent-search?${searchParams.toString()}`,
      results,
      usage: {
        method: 'GET',
        example: `${baseUrl}/api/agent-search?q=plumbing&location=Chicago%2C%20IL&verified=true&nexez_checkout_ready=true`,
        note: 'Returns published AI-readable listings and offer-level actions. has_actionable_offer covers a Nexez action or provider handoff; nexez_checkout_ready separately confirms private payout readiness. Relevance is the hard first rank; exact location/service area, availability, actionability, verification, established verified-purchase reputation, readiness, and freshness resolve ties in that order. Sparse review history is neutral. lat/lng are context metadata only and do not filter or rerank results.',
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

const CATEGORIES = new Set(['all', 'professional', 'consumer'])
const PRICE_BANDS = new Set(['free', 'under_100', '100_500', '500_2000', '2000_plus', 'custom'])

function parseSearchFilters(searchParams: URLSearchParams):
  | { ok: true; options: AgentSearchOptions }
  | { ok: false; error: string } {
  const category = searchParams.get('category')?.trim().toLowerCase() || 'all'
  if (!CATEGORIES.has(category)) return { ok: false, error: 'category must be all, professional, or consumer.' }

  const priceBand = searchParams.get('price_band')?.trim().toLowerCase() || null
  if (priceBand && !PRICE_BANDS.has(priceBand)) {
    return { ok: false, error: 'price_band is not supported.' }
  }

  const minReadiness = scoreParam(searchParams.get('min_readiness'))
  if (minReadiness === 'invalid') return { ok: false, error: 'min_readiness must be an integer from 0 to 100.' }
  const minTrust = scoreParam(searchParams.get('min_trust'))
  if (minTrust === 'invalid') return { ok: false, error: 'min_trust must be an integer from 0 to 100.' }

  const verified = booleanParam(searchParams.get('verified'))
  if (verified === 'invalid') return { ok: false, error: 'verified must be true or false.' }
  const nexezCheckoutReady = booleanParam(searchParams.get('nexez_checkout_ready'))
  if (nexezCheckoutReady === 'invalid') return { ok: false, error: 'nexez_checkout_ready must be true or false.' }
  const supportsCheckout = booleanParam(searchParams.get('supports_checkout'))
  if (supportsCheckout === 'invalid') return { ok: false, error: 'supports_checkout must be true or false.' }
  const supportsNegotiation = booleanParam(searchParams.get('supports_negotiation'))
  if (supportsNegotiation === 'invalid') return { ok: false, error: 'supports_negotiation must be true or false.' }

  const industry = searchParams.get('industry')?.trim().slice(0, 100) || null
  return {
    ok: true,
    options: {
      category: category as AgentSearchOptions['category'],
      industry,
      minReadiness,
      minTrust,
      verified,
      nexezCheckoutReady,
      supportsCheckout,
      supportsNegotiation,
      priceBand: priceBand as AgentSearchOptions['priceBand'],
    },
  }
}

function scoreParam(value: string | null): number | null | 'invalid' {
  if (value === null || value.trim() === '') return null
  if (!/^\d{1,3}$/.test(value.trim())) return 'invalid'
  const score = Number(value)
  return score >= 0 && score <= 100 ? score : 'invalid'
}

function booleanParam(value: string | null): boolean | null | 'invalid' {
  if (value === null || value.trim() === '') return null
  if (value === 'true') return true
  if (value === 'false') return false
  return 'invalid'
}

function appendSearchFilters(searchParams: URLSearchParams, options: AgentSearchOptions) {
  if (options.category && options.category !== 'all') searchParams.set('category', options.category)
  if (options.industry) searchParams.set('industry', options.industry)
  if (options.minReadiness != null) searchParams.set('min_readiness', String(options.minReadiness))
  if (options.minTrust != null) searchParams.set('min_trust', String(options.minTrust))
  if (options.verified != null) searchParams.set('verified', String(options.verified))
  if (options.nexezCheckoutReady != null) searchParams.set('nexez_checkout_ready', String(options.nexezCheckoutReady))
  if (options.supportsCheckout != null) searchParams.set('supports_checkout', String(options.supportsCheckout))
  if (options.supportsNegotiation != null) searchParams.set('supports_negotiation', String(options.supportsNegotiation))
  if (options.priceBand) searchParams.set('price_band', options.priceBand)
}

function serializeSearchFilters(options: AgentSearchOptions) {
  return {
    category: options.category || 'all',
    industry: options.industry || null,
    min_readiness: options.minReadiness ?? null,
    min_trust: options.minTrust ?? null,
    verified: options.verified ?? null,
    nexez_checkout_ready: options.nexezCheckoutReady ?? null,
    supports_checkout: options.supportsCheckout ?? null,
    supports_negotiation: options.supportsNegotiation ?? null,
    price_band: options.priceBand ?? null,
  }
}

function optionalNumber(value: string | null) {
  if (value === null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
