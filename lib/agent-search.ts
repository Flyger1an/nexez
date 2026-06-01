import {
  AgentPage,
  CheckoutOffer,
  getBaseUrl,
  getCheckoutOfferKey,
  getCheckoutOffers,
  getCheckoutPath,
  getOfferDestination,
} from './agent-page'
import { getAgentJsonPath } from './agent-manifest'

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
  }
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

export function searchAgentPages(pages: AgentPage[], query: string, limit = 10) {
  const tokens = tokenize(query)
  const results: AgentSearchResult[] = []

  for (const page of pages) {
    const offers = getCheckoutOffers(page)
    const pageScore = scoreText(
      tokens,
      [page.name, page.slug, page.description, page.audience, page.location, page.contact_email].join(' '),
    )

    if (!offers.length) {
      if (pageScore > 0 || !tokens.length) {
        results.push(buildResult(page, null, pageScore || 1))
      }
      continue
    }

    for (const offer of offers) {
      const offerScore = scoreOffer(tokens, page, offer)

      if (offerScore > 0 || !tokens.length) {
        results.push(buildResult(page, offer, offerScore || pageScore || 1))
      }
    }
  }

  return results
    .sort((a, b) => b.score - a.score || a.page.name.localeCompare(b.page.name))
    .slice(0, Math.max(1, Math.min(limit, 50)))
}

function buildResult(page: AgentPage, offer: CheckoutOffer | null, score: number): AgentSearchResult {
  const baseUrl = getBaseUrl()
  const offerKey = offer ? getCheckoutOfferKey(offer.kind, offer.index) : ''

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
    },
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
