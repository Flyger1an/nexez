import {
  AgentPage,
  CheckoutOffer,
  getBaseUrl,
  getCheckoutOfferKey,
  getCheckoutOffers,
  getCheckoutPath,
  getOfferDestination,
  getReadinessScore,
} from './agent-page'
import { getAgentJsonPath } from './agent-manifest'
import { summarizeMarketplacePage, type MarketplaceSummary } from './marketplace'
import { getPageLocationMatch, type LocationMatch } from './location-filter'

export type AgentSearchResult = {
  score: number
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
  }
  marketplace?: MarketplaceSummary
  location_match?: LocationMatch | null
  offer: {
    key: string
    type: 'service' | 'product'
    name: string
    description: string | null
    price: string | null
    checkout_url: string
    provider_url: string | null
    action: {
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
    }
  } | null
}

type AgentSearchOptions = {
  location?: string | null
}

export function searchAgentPages(pages: AgentPage[], query: string, limit = 10, baseUrl = getBaseUrl(), options: AgentSearchOptions = {}) {
  const tokens = tokenize(query)
  // Track readiness alongside each result so ties break toward higher-quality
  // pages (quality-aware discovery) without distorting the relevance score.
  const scored: { result: AgentSearchResult; readiness: number }[] = []

  for (const page of pages) {
    const offers = getCheckoutOffers(page)
    const readiness = getReadinessScore(page)
    const pageScore = scoreText(
      tokens,
      [page.name, page.slug, page.description, page.audience, page.location, page.contact_email].join(' '),
    )

    if (!offers.length) {
      if (pageScore > 0 || !tokens.length) {
        scored.push({ result: buildResult(page, null, pageScore || 1, baseUrl, options), readiness })
      }
      continue
    }

    for (const offer of offers) {
      const offerScore = scoreOffer(tokens, page, offer)

      if (offerScore > 0 || !tokens.length) {
        scored.push({ result: buildResult(page, offer, offerScore || pageScore || 1, baseUrl, options), readiness })
      }
    }
  }

  return scored
    .sort(
      (a, b) =>
        b.result.score - a.result.score ||
        b.readiness - a.readiness ||
        a.result.page.name.localeCompare(b.result.page.name),
    )
    .slice(0, Math.max(1, Math.min(limit, 50)))
    .map((s) => s.result)
}

export function buildResult(page: AgentPage, offer: CheckoutOffer | null, score: number, baseUrl: string, options: AgentSearchOptions = {}): AgentSearchResult {
  const offerKey = offer ? getCheckoutOfferKey(offer.kind, offer.index) : ''
  const locationMatch = options.location ? getPageLocationMatch(page, options.location) : null

  return {
    score,
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
    },
    marketplace: summarizeMarketplacePage(page),
    location_match: locationMatch,
    offer: offer
      ? {
          key: offerKey,
          type: offer.kind === 'services' ? 'service' : 'product',
          name: offer.name,
          description: offer.description || null,
          price: offer.price || null,
          checkout_url: `${baseUrl}${getCheckoutPath(page.slug, offer.kind, offer.index)}`,
          provider_url: getOfferDestination(page, offer) || null,
          action: {
            method: 'POST',
            endpoint: `${baseUrl}/api/checkout`,
            content_type: 'application/json',
            body: {
              slug: page.slug,
              offer: offerKey,
            },
            dry_run_body: {
              slug: page.slug,
              offer: offerKey,
              dryRun: true,
            },
          },
        }
      : null,
  }
}

function scoreOffer(tokens: string[], page: AgentPage, offer: CheckoutOffer) {
  const pageScore = scoreText(tokens, [page.name, page.description, page.audience, page.location].join(' '))
  const offerScore = scoreText(tokens, [offer.name, offer.description, offer.price].join(' '))
  return pageScore + offerScore * 2
}

function scoreText(tokens: string[], value: string) {
  if (!tokens.length) return 1

  const haystack = value.toLowerCase()
  return tokens.reduce((score, token) => {
    if (!token) return score
    if (haystack.includes(token)) return score + (haystack.split(token).length - 1)
    return score
  }, 0)
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1)
}

// ---------------------------------------------------------------------------
// Win-the-query discovery analysis.
// The simulator's third lens: not "how does an agent parse my page" but "when
// an agent searches Nexez for this, do I surface — and if not, who beats me and
// why?" Uses the SAME relevance + readiness ranking as `searchAgentPages`, so
// the projected rank matches what /api/agent-search would actually return.
// ---------------------------------------------------------------------------

const RANK_SEARCHABLE_STOPSCORE = 0

// Tokens too generic to be useful *advice*. The ranking still counts them (so the
// projected rank matches what /api/agent-search actually returns), but we never
// tell an owner to "add the term 'next'" to win — only meaningful terms surface
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
  const offers = getCheckoutOffers(page)
  if (!offers.length) return scoreText(tokens, [page.name, page.slug, page.description, page.audience, page.location, page.contact_email].join(' '))
  return offers.reduce((best, offer) => Math.max(best, scoreOffer(tokens, page, offer)), 0)
}

/** Which query tokens appear anywhere in this page's searchable text. */
function matchedTokenSet(tokens: string[], page: AgentPage): Set<string> {
  const hay = pageSearchText(page).toLowerCase()
  return new Set(tokens.filter((t) => hay.includes(t)))
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
  const targetScore = pageBestScore(tokens, target)
  const targetReadiness = getReadinessScore(target)
  const targetMatched = matchedTokenSet(tokens, target)

  // The competitive field: other published pages, scored the same way. Dedupe
  // the target itself (it may also be in the published set).
  const others = field
    .filter((p) => p.slug !== target.slug && p.is_published)
    .map((p) => ({ page: p, score: pageBestScore(tokens, p), readiness: getReadinessScore(p), matched: matchedTokenSet(tokens, p) }))

  // Pages that actually surface for this query (score > 0), plus the target.
  const competing = others.filter((o) => o.score > RANK_SEARCHABLE_STOPSCORE || !tokens.length)
  const matched = tokens.length === 0 || targetScore > 0

  const ranked = [...competing, { page: target, score: targetScore, readiness: targetReadiness, matched: targetMatched }].sort(
    (a, b) => b.score - a.score || b.readiness - a.readiness || a.page.name.localeCompare(b.page.name),
  )

  const rank = ranked.findIndex((r) => r.page.slug === target.slug) + 1
  const field_ = ranked.length

  const above = ranked.slice(0, Math.max(0, rank - 1))
  const competitorsAbove: RankCompetitor[] = above.slice(0, 5).map((c) => {
    // All terms they match and you don't (faithful), then the meaningful subset
    // we're willing to recommend adding.
    const rawMisses = [...c.matched].filter((t) => !targetMatched.has(t))
    const termsYouMiss = meaningfulTerms(rawMisses)
    const reasons: string[] = []
    if (c.score > targetScore) reasons.push('Stronger relevance — matches more of your query')
    else if (c.score === targetScore && c.readiness > targetReadiness)
      reasons.push(`Tied on relevance, but more complete (readiness ${c.readiness}% vs your ${targetReadiness}%)`)
    if (termsYouMiss.length) reasons.push(`Mentions ${termsYouMiss.map((t) => `“${t}”`).join(', ')} where your page doesn't`)
    if (!reasons.length) reasons.push('Edges you out on the readiness tie-break')
    return { name: c.page.name, slug: c.page.slug, score: c.score, readiness: c.readiness, reasons, termsYouMiss }
  })

  const termsToAdd = [...new Set(competitorsAbove.flatMap((c) => c.termsYouMiss))]

  const toWin: string[] = []
  if (!matched && tokens.length) {
    const keyTerms = meaningfulTerms(tokens)
    toWin.push(
      keyTerms.length
        ? `Your page doesn't surface for this query. Work its key terms into an offer name or description: ${keyTerms.map((t) => `“${t}”`).join(', ')}.`
        : `Your page doesn't surface for this query. Name your offers the way buyers phrase what they want.`,
    )
  } else if (rank === 1) {
    toWin.push('You already rank #1 for this query — keep your readiness high to hold the top spot.')
  } else {
    if (termsToAdd.length) toWin.push(`Add the terms rivals match and you don't: ${termsToAdd.map((t) => `“${t}”`).join(', ')}.`)
    const tiedHigherReadiness = above.some((c) => c.score === targetScore && c.readiness > targetReadiness)
    if (tiedHigherReadiness) toWin.push(`Raise your readiness (currently ${targetReadiness}%) — publish, and fill in audience, FAQs, and prices to win the tie-break.`)
    if (!termsToAdd.length && !tiedHigherReadiness) toWin.push('Sharpen your offer names and descriptions to match buyer phrasing more directly.')
  }
  if (!target.is_published) toWin.unshift('This page is unpublished, so it has no real discovery rank yet — the position above is projected. Publish to compete.')

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
