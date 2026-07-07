import 'server-only'
import type { AgentSearchResult } from '../agent-search'
import type { SourceAdapter } from './source-adapters'

// External discovery sources. These broaden what Nexxi can *find* beyond the Nezez marketplace,
// but their results are DISCOVERY-ONLY: `offer: null` means no checkout/negotiate action, so they
// never enter the money path (Book/Negotiate + escrow stay Nexez-backed). Each is env-gated - with
// no API key the adapter reports unavailable and returns nothing, so prod is unaffected until the
// owner sets the key. A failing call throws and is isolated by searchAllSources' fan-out.
//
// ACTIVE source = Brave Search (AI-friendly: explicit AI-inference rights, transient use permitted).
// The Yelp + Google Places adapters below are RETAINED but NOT REGISTERED (see source-adapters.ts):
// Yelp's terms forbid feeding content to a generative-AI model and bar commercial use without
// consent; Google needs map/logo attribution + a master-ToS check. Kept for reference / a future
// compliant path; unregistered so neither can be accidentally key-activated.

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'
const YELP_ENDPOINT = 'https://api.yelp.com/v3/businesses/search'
const PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText'
const TIMEOUT_MS = 8_000

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function clamp(limit: number, max: number): number {
  return Math.min(Math.max(Math.floor(limit) || 1, 1), max)
}

/** Build a discovery-only result (no offer → not bookable; View opens the external listing). */
function externalResult(opts: {
  source: { id: string; label: string }
  name: string
  slug: string
  url: string
  description: string | null
  location: string | null
  industry: string | null
  score: number
}): AgentSearchResult {
  return {
    score: opts.score,
    source: opts.source,
    page: {
      name: opts.name,
      slug: opts.slug,
      url: opts.url,
      agent_json_url: '',
      description: opts.description,
      audience: null,
      location: opts.location,
      contact_email: null,
      industry: opts.industry,
      website_url: opts.url,
      cta_url: opts.url,
    },
    offer: null,
  }
}

// Rating dominates the score (0–5 band); API relevance order is a minor tiebreak. This puts
// well-rated external matches mid-pack so strong Nexez (transactable) results still lead, while
// a highly-rated relevant discovery result can outrank a barely-relevant Nexez page.
function externalScore(rating: number | null, index: number, count: number): number {
  const base = typeof rating === 'number' && rating > 0 ? rating : 3.5
  return base + ((count - index) / Math.max(count, 1)) * 0.5
}

const YELP_SOURCE = { id: 'yelp', label: 'Yelp' }

type YelpBusiness = {
  id?: string
  name?: string
  url?: string
  rating?: number
  review_count?: number
  price?: string
  categories?: { title?: string }[]
  location?: { display_address?: string[]; city?: string }
}

function yelpToResult(b: YelpBusiness, index: number, count: number): AgentSearchResult {
  const categories = (b.categories ?? []).map((c) => c.title).filter(Boolean).join(', ')
  const address = b.location?.display_address?.join(', ') || b.location?.city || null
  const bits = [categories, b.price, typeof b.rating === 'number' ? `${b.rating}★ (${b.review_count ?? 0})` : null]
    .filter(Boolean)
    .join(' · ')
  return externalResult({
    source: YELP_SOURCE,
    name: b.name || 'Unnamed business',
    slug: `yelp:${b.id ?? index}`,
    url: b.url || 'https://www.yelp.com',
    description: bits || null,
    location: address,
    industry: (b.categories?.[0]?.title) || null,
    score: externalScore(b.rating ?? null, index, count),
  })
}

/**
 * Yelp Fusion business search. Requires a buyer location (Yelp's API mandates location/lat-long).
 *
 * ⚠️ COMPLIANCE - DO NOT set YELP_API_KEY without resolving this first. Yelp's API Terms (Jan 2025,
 * §9) prohibit ingesting Yelp Content into a generative-AI model - but our agent feeds search
 * results to the LLM (the search tool result is added to the chat completion). The terms also bar
 * commercial use without Yelp's written consent, cap caching at 24h, and forbid blending Yelp
 * ratings with other sources. Treat Yelp as blocked for the LLM path absent written consent from
 * api@yelp.com (or a redesign that keeps Yelp results out of the model prompt). Adapter kept here,
 * dormant (no key), so it can be enabled cleanly once a compliant path exists.
 */
export const yelpAdapter: SourceAdapter = {
  id: YELP_SOURCE.id,
  label: YELP_SOURCE.label,
  available: () => Boolean(process.env.YELP_API_KEY),
  async search(query, limit, ctx) {
    const key = process.env.YELP_API_KEY
    const location = (ctx.location || '').trim()
    if (!key || !location) return []
    const params = new URLSearchParams({
      term: query,
      location,
      limit: String(clamp(limit, 20)),
      sort_by: 'best_match',
    })
    const res = await fetch(`${YELP_ENDPOINT}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${key}`, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`Yelp search failed with HTTP ${res.status}`)
    const json = (await res.json().catch(() => ({}))) as { businesses?: YelpBusiness[] }
    const businesses = Array.isArray(json.businesses) ? json.businesses : []
    return businesses.slice(0, clamp(limit, 20)).map((b, i) => yelpToResult(b, i, businesses.length))
  },
}

const PLACES_SOURCE = { id: 'google_places', label: 'Google' }

type GooglePlace = {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  websiteUri?: string
  googleMapsUri?: string
  rating?: number
  userRatingCount?: number
  primaryTypeDisplayName?: { text?: string }
  editorialSummary?: { text?: string }
}

function placeToResult(p: GooglePlace, index: number, count: number): AgentSearchResult {
  const type = p.primaryTypeDisplayName?.text || null
  const url = p.websiteUri || p.googleMapsUri || 'https://maps.google.com'
  const bits = [type, typeof p.rating === 'number' ? `${p.rating}★ (${p.userRatingCount ?? 0})` : null]
    .filter(Boolean)
    .join(' · ')
  return externalResult({
    source: PLACES_SOURCE,
    name: p.displayName?.text || 'Unnamed place',
    slug: `google:${p.id ?? index}`,
    url,
    description: p.editorialSummary?.text || bits || null,
    location: p.formattedAddress || null,
    industry: type,
    score: externalScore(p.rating ?? null, index, count),
  })
}

/** Google Places (new) Text Search. Works without a location; biases by it when present. */
export const googlePlacesAdapter: SourceAdapter = {
  id: PLACES_SOURCE.id,
  label: PLACES_SOURCE.label,
  available: () => Boolean(process.env.GOOGLE_PLACES_API_KEY),
  async search(query, limit, ctx) {
    const key = process.env.GOOGLE_PLACES_API_KEY
    if (!key) return []
    const textQuery = ctx.location ? `${query} in ${ctx.location}` : query
    const res = await fetch(PLACES_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,places.primaryTypeDisplayName,places.editorialSummary',
      },
      body: JSON.stringify({ textQuery, maxResultCount: clamp(limit, 20) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`Google Places search failed with HTTP ${res.status}`)
    const json = (await res.json().catch(() => ({}))) as { places?: GooglePlace[] }
    const places = Array.isArray(json.places) ? json.places : []
    return places.slice(0, clamp(limit, 20)).map((p, i) => placeToResult(p, i, places.length))
  },
}

const BRAVE_SOURCE = { id: 'brave', label: 'Web' }

type BraveWebResult = {
  title?: string
  url?: string
  description?: string
}

function braveToResult(r: BraveWebResult, index: number, count: number): AgentSearchResult {
  return externalResult({
    source: BRAVE_SOURCE,
    name: r.title ? stripHtml(r.title) : 'Web result',
    // Web results have no stable id; the index is unique within a result set (slug isn't used for
    // any action - these are discovery-only).
    slug: `brave:${index}`,
    url: r.url || 'https://search.brave.com',
    description: r.description ? stripHtml(r.description) : null,
    location: null,
    industry: null,
    score: externalScore(null, index, count),
  })
}

/**
 * Brave Search (web). AI-friendly: the Search plan grants AI-inference rights and permits transient
 * use, so feeding results to the LLM is allowed (we never persist them). The buyer location, when
 * set, is folded into the query. This is the ACTIVE external discovery source.
 */
export const braveAdapter: SourceAdapter = {
  id: BRAVE_SOURCE.id,
  label: BRAVE_SOURCE.label,
  available: () => Boolean(process.env.BRAVE_API_KEY),
  async search(query, limit, ctx) {
    const key = process.env.BRAVE_API_KEY
    if (!key) return []
    const q = ctx.location ? `${query} in ${ctx.location}` : query
    const params = new URLSearchParams({ q, count: String(clamp(limit, 20)) })
    const res = await fetch(`${BRAVE_ENDPOINT}?${params.toString()}`, {
      headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`Brave search failed with HTTP ${res.status}`)
    const json = (await res.json().catch(() => ({}))) as { web?: { results?: BraveWebResult[] } }
    const results = Array.isArray(json.web?.results) ? json.web!.results! : []
    return results.slice(0, clamp(limit, 20)).map((r, i) => braveToResult(r, i, results.length))
  },
}
