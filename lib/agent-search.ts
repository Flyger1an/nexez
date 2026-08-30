import {
  AgentPage,
  CheckoutOffer,
  getBaseUrl,
  getCheckoutOfferKey,
  getCheckoutOffers,
  getCheckoutPath,
  getAgentOfferType,
  getOfferDestination,
  getPreferredOriginalOfferUrl,
  getReadinessScore,
  isOfferActionAvailable,
} from './agent-page'
import { buildAgentStorefrontRef, getAgentJsonPath, type AgentStorefrontRef } from './agent-manifest'
import {
  summarizeMarketplacePage,
  parseMarketplacePriceCents,
  type MarketplaceCategory,
  type MarketplacePriceBand,
  type MarketplaceSummary,
} from './marketplace'
import { getPageLocationMatch, type LocationMatch } from './location-filter'
import type { ReviewSummary } from './reviews'
import { commerceIdentityTokenFamily } from './commerce-templates/curation/simulation'
import { buildAgentOfferConfiguration } from './agent-offer-configuration'
import type { NexieCommerceRail } from '../contracts/nexie/v1'

export type AgentSearchResult = {
  score: number
  matched_query_terms: string[]
  match_reasons: string[]
  ranking?: AgentSearchRankingEvidence
  /** Which source surfaced this result (set by searchAllSources). Absent = the Nexez marketplace. */
  source?: { id: string; label: string }
  page: {
    name: string
    slug: string
    url: string
    agent_json_url: string
    description: string | null
    audience: string | null
    location: string | null
    contact_email: string | null
    industry?: string | null
    website_url?: string | null
    cta_url?: string | null
    storefront?: AgentStorefrontRef
    rating_summary?: ReviewSummary | null
  }
  marketplace?: MarketplaceSummary
  location_match?: LocationMatch | null
  offer: {
    key: string
    type: 'service' | 'product'
    name: string
    description: string | null
    price: string | null
    /** Human/browser handoff. Null when neither an authoritative Nexez action nor
     * an explicitly preferred provider handoff is currently available. */
    checkout_url: string | null
    provider_url: string | null
    /** Machine action. Provider-only handoffs use checkout_url and leave this
     * null; this field is reserved for executable Nexez POST contracts. */
    action: {
      type: 'nexez_checkout' | 'negotiation'
      rail: NexieCommerceRail
      method: 'POST'
      endpoint: string
      content_type: 'application/json'
      body: {
        slug: string
        offer: string
      }
      dry_run_body: {
        slug: string
        offer: string
        dryRun: true
      }
      /** Merchant-authored buyer inputs. The agent must collect every required
       * value verbatim before it calls trigger_booking. */
      input_schema: Record<string, unknown> | null
      required_input_fields: string[]
      idempotency_key_required: boolean
    } | null
  } | null
}

export const AGENT_SEARCH_RANKING_POLICY = 'nexez.discovery-ranking.v1' as const

export type AgentSearchRankingEvidence = {
  policy_version: typeof AGENT_SEARCH_RANKING_POLICY
  relevance: number
  location: 'not-requested' | 'exact-or-service-area' | 'broad' | 'unmatched'
  availability: 'listing-only' | 'available' | 'limited' | 'unspecified' | 'sold-out'
  actionability: 'transaction-ready' | 'needs-confirmation' | 'listing-only' | 'unavailable'
  seller_verified: boolean
  agent_ready_certified: boolean
  verified_purchase_reviews: number
  reputation: number | null
  review_evidence: 'cold-start' | 'established-positive' | 'established-neutral' | 'established-concerning'
  readiness: number
  freshness: 'recent' | 'current' | 'stale' | 'unknown'
}

export type AgentSearchOptions = {
  location?: string | null
  storefrontHandles?: Map<string, string>
  reviewSummaries?: Map<string, ReviewSummary>
  /** Slugs whose owners authoritatively unlock negotiation. Absent means none;
   * public capability advertising fails closed. */
  negotiationEligibleSlugs?: ReadonlySet<string>
  /** Slugs whose owners are operationally ready for Nexez-settled checkout. */
  checkoutReadySlugs?: ReadonlySet<string>
  category?: MarketplaceCategory | 'all'
  industry?: string | null
  minReadiness?: number | null
  minTrust?: number | null
  verified?: boolean | null
  nexezCheckoutReady?: boolean | null
  supportsCheckout?: boolean | null
  supportsNegotiation?: boolean | null
  priceBand?: MarketplacePriceBand | null
  queryTokens?: string[]
  now?: Date
}

export function searchAgentPages(pages: AgentPage[], query: string, limit = 10, baseUrl = getBaseUrl(), options: AgentSearchOptions = {}) {
  const tokens = tokenize(query)
  const scored: AgentSearchResult[] = []

  for (const page of pages) {
    const offers = getCheckoutOffers(page)
    const marketplace = summarizeMarketplacePage(page, {
      negotiationAllowed: options.negotiationEligibleSlugs?.has(page.slug) === true,
      nexezCheckoutReady: options.checkoutReadySlugs?.has(page.slug) === true,
    })
    if (!matchesSearchFilters(page, marketplace, options)) continue
    const pageScore = scorePage(tokens, page)
    const searchableOffers = offers.filter((offer) => offer.availability !== 'sold_out')

    if (!searchableOffers.length) {
      if (pageScore > 0 || !tokens.length) {
        scored.push(buildResult(page, null, pageScore || 1, baseUrl, { ...options, queryTokens: tokens }, marketplace))
      }
      continue
    }

    for (const offer of searchableOffers) {
      const offerScore = scoreOffer(tokens, page, offer)

      if (offerScore > 0 || !tokens.length) {
        scored.push(buildResult(page, offer, offerScore || pageScore || 1, baseUrl, { ...options, queryTokens: tokens }, marketplace))
      }
    }
  }

  return scored
    .sort(compareAgentSearchResults)
    .slice(0, Math.max(1, Math.min(limit, 50)))
}

export function buildResult(
  page: AgentPage,
  offer: CheckoutOffer | null,
  score: number,
  baseUrl: string,
  options: AgentSearchOptions = {},
  marketplace = summarizeMarketplacePage(page, {
    negotiationAllowed: options.negotiationEligibleSlugs?.has(page.slug) === true,
    nexezCheckoutReady: options.checkoutReadySlugs?.has(page.slug) === true,
  }),
): AgentSearchResult {
  const offerKey = offer ? getCheckoutOfferKey(offer.kind, offer.index) : ''
  const locationMatch = options.location ? getPageLocationMatch(page, options.location) : null
  const storefrontHandle = options.storefrontHandles?.get(page.slug)
  const storefront = storefrontHandle ? buildAgentStorefrontRef(storefrontHandle, baseUrl) : null
  const reviewSummary = options.reviewSummaries?.get(page.slug) ?? null
  const matchedQueryTerms = getMatchedQueryTerms(options.queryTokens ?? [], page, offer)
  const ranking = buildAgentSearchRankingEvidence(page, offer, score, marketplace, locationMatch, reviewSummary, options.now)
  const matchReasons = buildMatchReasons(matchedQueryTerms, marketplace, locationMatch, options, ranking)
  const execution = offer ? buildOfferExecution(page, offer, offerKey, baseUrl, marketplace) : null

  return {
    score,
    matched_query_terms: matchedQueryTerms,
    match_reasons: matchReasons,
    ranking,
    page: {
      name: page.name,
      slug: page.slug,
      url: `${baseUrl}/${page.slug}`,
      agent_json_url: `${baseUrl}${getAgentJsonPath(page.slug)}`,
      description: page.description,
      audience: page.audience,
      location: page.location,
      contact_email: page.contact_email,
      industry: page.industry ?? null,
      website_url: page.website_url ?? null,
      cta_url: page.cta_url ?? null,
      ...(storefront ? { storefront } : {}),
      rating_summary: reviewSummary?.count ? reviewSummary : null,
    },
    marketplace,
    location_match: locationMatch,
    offer: offer
      ? {
          key: offerKey,
          type: getAgentOfferType(offer),
          name: offer.name,
          description: offer.description || null,
          price: offer.price || null,
          checkout_url: execution?.checkoutUrl ?? null,
          provider_url: getOfferDestination(page, offer) || null,
          action: execution?.action ?? null,
        }
      : null,
  }
}

function buildOfferExecution(
  page: AgentPage,
  offer: CheckoutOffer,
  offerKey: string,
  baseUrl: string,
  marketplace: MarketplaceSummary,
): {
  checkoutUrl: string
  action: NonNullable<NonNullable<AgentSearchResult['offer']>['action']> | null
} | null {
  if (!isOfferActionAvailable(offer)) return null

  const preferredProviderUrl = getPreferredOriginalOfferUrl(page, offer)
  if (preferredProviderUrl) {
    return { checkoutUrl: preferredProviderUrl, action: null }
  }

  const body = { slug: page.slug, offer: offerKey }
  const dryRunBody = { ...body, dryRun: true as const }
  if (offer.offerType === 'negotiable') {
    if (!marketplace.supports_negotiation) return null
    return {
      checkoutUrl: `${baseUrl}/${page.slug}?negotiate=${encodeURIComponent(offerKey)}#negotiate`,
      action: {
        type: 'negotiation',
        rail: 'negotiation',
        method: 'POST',
        endpoint: `${baseUrl}/api/negotiations`,
        content_type: 'application/json',
        body,
        dry_run_body: dryRunBody,
        input_schema: null,
        required_input_fields: [],
        idempotency_key_required: false,
      },
    }
  }

  if ((parseMarketplacePriceCents(offer.price) ?? 0) <= 0 || !marketplace.nexez_checkout_ready) {
    return null
  }

  const configuration = buildAgentOfferConfiguration(offer)
  const checkoutPath = configuration?.checkout.path ?? '/api/checkout'
  const rail: NexieCommerceRail = checkoutPath === '/api/service-agreements/checkout'
    ? 'recurring'
    : checkoutPath === '/api/staged-settlements/checkout'
      ? 'staged'
      : checkoutPath === '/api/reservable-resources/checkout'
        ? 'reservable'
        : configuration?.input_schema
          ? 'configured'
          : 'one_time'
  const inputSchema = configuration?.input_schema ?? null
  const requiredInputFields = Array.isArray(inputSchema?.required)
    ? inputSchema.required.filter((value): value is string => typeof value === 'string')
    : []

  return {
    checkoutUrl: `${baseUrl}${getCheckoutPath(page.slug, offer.kind, offer.index)}`,
    action: {
      type: 'nexez_checkout',
      rail,
      method: 'POST',
      endpoint: `${baseUrl}${checkoutPath}`,
      content_type: 'application/json',
      body,
      dry_run_body: dryRunBody,
      input_schema: inputSchema,
      required_input_fields: requiredInputFields,
      idempotency_key_required: configuration?.checkout.idempotency_key_required === true,
    },
  }
}

const ESTABLISHED_REVIEW_COUNT = 3

export function buildAgentSearchRankingEvidence(
  page: AgentPage,
  offer: CheckoutOffer | null,
  relevance: number,
  marketplace = summarizeMarketplacePage(page),
  locationMatch: LocationMatch | null = null,
  reviewSummary: ReviewSummary | null = null,
  now = new Date(),
): AgentSearchRankingEvidence {
  const reviewCount = reviewSummary?.verified_count ?? 0
  const reputation = reviewCount > 0 ? reviewSummary?.reputation_score ?? null : null
  const reviewEvidence = reviewCount < ESTABLISHED_REVIEW_COUNT
    ? 'cold-start'
    : (reputation ?? 0) >= 4.3
      ? 'established-positive'
      : (reputation ?? 0) < 3.7
        ? 'established-concerning'
        : 'established-neutral'
  const availability = !offer
    ? 'listing-only'
    : offer.availability === 'sold_out'
      ? 'sold-out'
      : offer.availability === 'limited'
        ? 'limited'
        : offer.availability === 'available'
          ? 'available'
          : 'unspecified'
  const actionability = !offer
    ? 'listing-only'
    : offer.availability === 'sold_out'
      ? 'unavailable'
      : (offer.offerType !== 'negotiable'
          && (parseMarketplacePriceCents(offer.price) ?? 0) > 0
          && marketplace.nexez_checkout_ready)
        || (offer.offerType === 'negotiable' && marketplace.supports_negotiation)
        || Boolean(getPreferredOriginalOfferUrl(page, offer))
        ? 'transaction-ready'
        : 'needs-confirmation'

  return {
    policy_version: AGENT_SEARCH_RANKING_POLICY,
    relevance,
    location: !locationMatch?.active
      ? 'not-requested'
      : !locationMatch.matched
        ? 'unmatched'
        : locationMatch.mode === 'broad'
          ? 'broad'
          : 'exact-or-service-area',
    availability,
    actionability,
    seller_verified: marketplace.verified,
    agent_ready_certified: marketplace.certified,
    verified_purchase_reviews: reviewCount,
    reputation,
    review_evidence: reviewEvidence,
    readiness: marketplace.readiness,
    freshness: freshnessFor(page.updated_at, now),
  }
}

export function compareAgentSearchResults(a: AgentSearchResult, b: AgentSearchResult): number {
  const relevance = b.score - a.score
  if (relevance) return relevance

  const aRanking = a.ranking
  const bRanking = b.ranking
  if (aRanking && bRanking) {
    const evidence =
      locationRank(bRanking.location) - locationRank(aRanking.location)
      || availabilityRank(bRanking.availability) - availabilityRank(aRanking.availability)
      || actionabilityRank(bRanking.actionability) - actionabilityRank(aRanking.actionability)
      || Number(bRanking.seller_verified) - Number(aRanking.seller_verified)
      || Number(bRanking.agent_ready_certified) - Number(aRanking.agent_ready_certified)
      || reviewEvidenceRank(bRanking.review_evidence) - reviewEvidenceRank(aRanking.review_evidence)
    if (evidence) return evidence

    const bothEstablished = aRanking.review_evidence !== 'cold-start'
      && bRanking.review_evidence !== 'cold-start'
    if (bothEstablished) {
      const reputation = (bRanking.reputation ?? 0) - (aRanking.reputation ?? 0)
      if (reputation) return reputation
    }

    const completion = bRanking.readiness - aRanking.readiness
      || freshnessRank(bRanking.freshness) - freshnessRank(aRanking.freshness)
    if (completion) return completion
  }

  return a.page.name.localeCompare(b.page.name)
    || a.page.slug.localeCompare(b.page.slug)
    || (a.offer?.key ?? '').localeCompare(b.offer?.key ?? '')
}

function locationRank(value: AgentSearchRankingEvidence['location']) {
  if (value === 'exact-or-service-area') return 3
  if (value === 'broad') return 2
  if (value === 'not-requested') return 1
  return 0
}

function availabilityRank(value: AgentSearchRankingEvidence['availability']) {
  if (value === 'available') return 4
  if (value === 'limited') return 3
  if (value === 'unspecified') return 2
  if (value === 'listing-only') return 1
  return 0
}

function actionabilityRank(value: AgentSearchRankingEvidence['actionability']) {
  if (value === 'transaction-ready') return 3
  if (value === 'needs-confirmation') return 2
  if (value === 'listing-only') return 1
  return 0
}

function reviewEvidenceRank(value: AgentSearchRankingEvidence['review_evidence']) {
  if (value === 'established-positive') return 2
  if (value === 'established-concerning') return 0
  return 1
}

function freshnessRank(value: AgentSearchRankingEvidence['freshness']) {
  if (value === 'recent') return 3
  if (value === 'current') return 2
  if (value === 'stale') return 1
  return 0
}

function freshnessFor(updatedAt: string | null | undefined, now: Date): AgentSearchRankingEvidence['freshness'] {
  const timestamp = Date.parse(updatedAt ?? '')
  if (!Number.isFinite(timestamp)) return 'unknown'
  const ageDays = Math.max(0, (now.getTime() - timestamp) / 86_400_000)
  if (ageDays <= 30) return 'recent'
  if (ageDays <= 120) return 'current'
  return 'stale'
}

function matchesSearchFilters(page: AgentPage, summary: MarketplaceSummary, options: AgentSearchOptions) {
  if (options.category && options.category !== 'all' && summary.category !== options.category) return false
  if (options.industry) {
    const industry = page.industry?.trim().toLowerCase() ?? ''
    if (!industry.includes(options.industry.trim().toLowerCase())) return false
  }
  if (options.minReadiness != null && summary.readiness < options.minReadiness) return false
  if (options.minTrust != null && summary.trust_score < options.minTrust) return false
  if (options.verified != null && summary.verified !== options.verified) return false
  if (options.nexezCheckoutReady != null && summary.nexez_checkout_ready !== options.nexezCheckoutReady) return false
  if (options.supportsCheckout != null && summary.supports_checkout !== options.supportsCheckout) return false
  if (options.supportsNegotiation != null && summary.supports_negotiation !== options.supportsNegotiation) return false
  if (options.priceBand && summary.price_band !== options.priceBand) return false
  return true
}

function getMatchedQueryTerms(tokens: string[], page: AgentPage, offer: CheckoutOffer | null) {
  if (!tokens.length) return []
  const evidenceFamilies = tokenFamilyCounts([
    page.name,
    page.slug,
    page.description,
    page.audience,
    page.location,
    page.industry,
    offer?.name,
    offer?.description,
    offer?.price,
  ].filter(Boolean).join(' '))
  return [...new Set(tokens.filter((token) => evidenceFamilies.has(commerceIdentityTokenFamily(token))))]
}

function buildMatchReasons(
  matchedTerms: string[],
  summary: MarketplaceSummary,
  locationMatch: LocationMatch | null,
  options: AgentSearchOptions,
  ranking: AgentSearchRankingEvidence,
) {
  const reasons: string[] = []
  if (matchedTerms.length) reasons.push(`Matches query terms: ${matchedTerms.join(', ')}`)
  if (locationMatch?.matched) reasons.push(`Matches location or service area: ${locationMatch.query}`)
  if (options.category && options.category !== 'all') reasons.push(`Matches ${options.category} category`)
  if (options.industry) reasons.push(`Matches industry: ${summary.industry || options.industry}`)
  if (options.minReadiness != null) reasons.push(`Readiness ${summary.readiness} meets minimum ${options.minReadiness}`)
  if (options.minTrust != null) reasons.push(`Trust score ${summary.trust_score} meets minimum ${options.minTrust}`)
  if (options.verified === true) reasons.push('Seller verification signal present')
  if (options.verified === false) reasons.push('Seller has no verification signal')
  if (options.nexezCheckoutReady === true) reasons.push('Nexez payout and settlement readiness confirmed')
  if (options.nexezCheckoutReady === false) reasons.push('Nexez settlement readiness is not confirmed')
  if (options.supportsCheckout === true) reasons.push('Supports checkout or booking')
  if (options.supportsCheckout === false) reasons.push('Does not expose checkout or booking')
  if (options.supportsNegotiation === true) reasons.push('Supports negotiation')
  if (options.supportsNegotiation === false) reasons.push('Fixed-price or non-negotiable offers only')
  if (options.priceBand) reasons.push(`Matches price band: ${options.priceBand}`)
  if (ranking.availability === 'available') reasons.push('Offer explicitly reports available inventory or capacity')
  if (ranking.availability === 'limited') reasons.push('Offer reports limited availability')
  if (ranking.availability === 'unspecified') reasons.push('Availability is not published and still requires confirmation')
  if (ranking.actionability === 'transaction-ready') reasons.push('Operational Nexez checkout, entitled negotiation, or provider action is available')
  if (ranking.seller_verified) reasons.push('Seller identity has server-backed website or domain verification')
  if (ranking.review_evidence === 'cold-start') {
    reasons.push('Limited verified-purchase history is treated neutrally for cold-start fairness')
  } else if (ranking.verified_purchase_reviews > 0) {
    reasons.push(`${ranking.verified_purchase_reviews} verified-purchase reviews with Bayesian-adjusted reputation`)
  }
  if (ranking.freshness === 'recent') reasons.push('Listing facts were updated within 30 days')
  if (!reasons.length) reasons.push('Published agent-readable offer')
  return reasons
}

function scoreOffer(tokens: string[], page: AgentPage, offer: CheckoutOffer) {
  return (
    scoreText(tokens, [page.name, page.slug].join(' ')) * 3
    + scoreText(tokens, [page.description, page.audience, page.location, page.industry].join(' '))
    + scoreText(tokens, offer.name) * 6
    + scoreText(tokens, [offer.description, offer.price].join(' ')) * 2
  )
}

function scorePage(tokens: string[], page: AgentPage) {
  return (
    scoreText(tokens, [page.name, page.slug].join(' ')) * 3
    + scoreText(tokens, [page.description, page.audience, page.location, page.contact_email, page.industry].join(' '))
  )
}

function scoreText(tokens: string[], value: string) {
  if (!tokens.length) return 1

  const evidenceFamilies = new Set(tokenFamilyCounts(value).keys())
  return tokens.reduce(
    (score, token) => score + (evidenceFamilies.has(commerceIdentityTokenFamily(token)) ? 1 : 0),
    0,
  )
}

function tokenize(value: string) {
  return [...new Set(value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1))]
}

function tokenFamilyCounts(value: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const token of tokenize(value)) {
    const family = commerceIdentityTokenFamily(token)
    counts.set(family, (counts.get(family) ?? 0) + 1)
  }
  return counts
}

// ---------------------------------------------------------------------------
// Win-the-query discovery analysis.
// The simulator's third lens: not "how does an agent parse my page" but "when
// an agent searches Nexez for this, do I surface - and if not, who beats me and
// why?" Uses the same bounded relevance + evidence comparator as
// `searchAgentPages`, so
// the projected rank matches what /api/agent-search would actually return.
// ---------------------------------------------------------------------------

const RANK_SEARCHABLE_STOPSCORE = 0

// Tokens too generic to be useful *advice*. The ranking still counts them (so the
// projected rank matches what /api/agent-search actually returns), but we never
// tell an owner to "add the term 'next'" to win - only meaningful terms surface
// as suggestions. Includes common English plus the default-query boilerplate
// ("Book X and confirm price, fit, and next steps").
const SUGGESTION_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'this', 'that', 'are', 'can', 'could', 'would', 'will',
  'book', 'buy', 'find', 'confirm', 'best', 'fit', 'price', 'pricing', 'cost', 'next', 'steps', 'step',
  'recommend', 'action', 'evaluate', 'near', 'help', 'need', 'want', 'get', 'about', 'how', 'much',
  'call', 'service', 'services', 'standard',
])

function meaningfulTerms(tokens: string[]): string[] {
  return tokens.filter((t) => !SUGGESTION_STOPWORDS.has(t))
}

function pageSearchText(page: AgentPage): string {
  const offers = getCheckoutOffers(page)
  return [
    page.name,
    page.slug,
    page.description,
    page.audience,
    page.location,
    page.contact_email,
    ...offers.flatMap((o) => [o.name, o.description, o.price]),
  ]
    .filter(Boolean)
    .join(' ')
}

/** A page's best relevance score for a query, mirroring searchAgentPages' per-offer ranking. */
function pageBestScore(tokens: string[], page: AgentPage): number {
  const offers = getCheckoutOffers(page).filter((offer) => offer.availability !== 'sold_out')
  if (!offers.length) return scorePage(tokens, page)
  return offers.reduce((best, offer) => Math.max(best, scoreOffer(tokens, page, offer)), 0)
}

function pageBestOffer(tokens: string[], page: AgentPage): CheckoutOffer | null {
  return getCheckoutOffers(page)
    .filter((offer) => offer.availability !== 'sold_out')
    .sort((a, b) => scoreOffer(tokens, page, b) - scoreOffer(tokens, page, a))[0] ?? null
}

/** Which query tokens appear anywhere in this page's searchable text. */
function matchedTokenSet(tokens: string[], page: AgentPage): Set<string> {
  const evidenceFamilies = tokenFamilyCounts(pageSearchText(page))
  return new Set(tokens.filter((token) => evidenceFamilies.has(commerceIdentityTokenFamily(token))))
}

export type RankCompetitor = {
  name: string
  slug: string
  score: number
  readiness: number
  reasons: string[]
  termsYouMiss: string[]
}

export type QueryRankAnalysis = {
  query: string
  targetSlug: string
  published: boolean
  matched: boolean
  rank: number
  field: number
  targetScore: number
  targetReadiness: number
  competitorsAbove: RankCompetitor[]
  termsToAdd: string[]
  toWin: string[]
}

/**
 * Where `target` ranks for `query` against the published `field`, and what it
 * would take to climb. Pure + deterministic. When the target is unpublished the
 * rank is "projected" (where it would land once live) and `published` is false.
 */
export function analyzeQueryRank(field: AgentPage[], target: AgentPage, query: string): QueryRankAnalysis {
  const tokens = tokenize(query)
  const projectedTarget = { ...target, is_published: true }
  const targetScore = pageBestScore(tokens, projectedTarget)
  const targetReadiness = getReadinessScore(target)
  const targetMatched = matchedTokenSet(tokens, target)

  // The competitive field: other published pages, scored the same way. Dedupe
  // the target itself (it may also be in the published set).
  const others = field
    .filter((p) => p.slug !== target.slug && p.is_published)
    .map((p) => projectedRankRow(p, tokens))

  // Pages that actually surface for this query (score > 0), plus the target.
  const competing = others.filter((o) => o.score > RANK_SEARCHABLE_STOPSCORE || !tokens.length)
  const matched = tokens.length === 0 || targetScore > 0

  const targetRow = projectedRankRow(projectedTarget, tokens)
  const ranked = [...competing, targetRow].sort((a, b) => compareAgentSearchResults(a.result, b.result))

  const rank = ranked.findIndex((r) => r.page.slug === target.slug) + 1
  const field_ = ranked.length

  const above = ranked.slice(0, Math.max(0, rank - 1))
  const competitorsAbove: RankCompetitor[] = above.slice(0, 5).map((c) => {
    // All terms they match and you don't (faithful), then the meaningful subset
    // we're willing to recommend adding.
    const rawMisses = [...c.matched].filter((t) => !targetMatched.has(t))
    const termsYouMiss = meaningfulTerms(rawMisses)
    const reasons: string[] = []
    if (c.score > targetScore) reasons.push('Stronger relevance - matches more of your query')
    else if (c.score === targetScore && c.readiness > targetReadiness)
      reasons.push(`Tied on relevance, but more complete (readiness ${c.readiness}% vs your ${targetReadiness}%)`)
    if (termsYouMiss.length) reasons.push(`Mentions ${termsYouMiss.map((t) => `“${t}”`).join(', ')} where your listing doesn't`)
    if (!reasons.length) reasons.push('Edges you out on the published evidence tie-break')
    return { name: c.page.name, slug: c.page.slug, score: c.score, readiness: c.readiness, reasons, termsYouMiss }
  })

  const termsToAdd = [...new Set(competitorsAbove.flatMap((c) => c.termsYouMiss))]

  const toWin: string[] = []
  if (!matched && tokens.length) {
    const keyTerms = meaningfulTerms(tokens)
    toWin.push(
      keyTerms.length
        ? `Your listing doesn't surface for this query. Work its key terms into an offer name or description: ${keyTerms.map((t) => `“${t}”`).join(', ')}.`
        : `Your listing doesn't surface for this query. Name your offers the way buyers phrase what they want.`,
    )
  } else if (rank === 1) {
    toWin.push('You already rank #1 for this query - keep your readiness high to hold the top spot.')
  } else {
    if (termsToAdd.length) toWin.push(`Add the terms rivals match and you don't: ${termsToAdd.map((t) => `“${t}”`).join(', ')}.`)
    const tiedHigherReadiness = above.some((c) => c.score === targetScore && c.readiness > targetReadiness)
    if (tiedHigherReadiness) toWin.push(`Raise your readiness (currently ${targetReadiness}%) - publish, and fill in audience, FAQs, and prices to win the tie-break.`)
    if (!termsToAdd.length && !tiedHigherReadiness) toWin.push('Sharpen your offer names and descriptions to match buyer phrasing more directly.')
  }
  if (!target.is_published) toWin.unshift('This listing is unpublished, so it has no real discovery rank yet - the position above is projected. Publish to compete.')

  return {
    query,
    targetSlug: target.slug,
    published: Boolean(target.is_published),
    matched,
    rank,
    field: field_,
    targetScore,
    targetReadiness,
    competitorsAbove,
    termsToAdd,
    toWin,
  }
}

function projectedRankRow(page: AgentPage, tokens: string[]) {
  const score = pageBestScore(tokens, page)
  const offer = pageBestOffer(tokens, page)
  return {
    page,
    score,
    readiness: getReadinessScore(page),
    matched: matchedTokenSet(tokens, page),
    result: buildResult(
      page,
      offer,
      score,
      'https://nexez.invalid',
      { queryTokens: tokens },
    ),
  }
}
