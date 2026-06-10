import { 
  AgentPage, 
  getCheckoutOffers, 
  getCheckoutOfferKey, 
  getBaseUrl,
  getReadinessScore,
} from './agent-page'

/**
 * Public demo simulation utilities.
 * Used by the homepage simulator teaser to give visitors a realistic
 * preview of what agents see when they land on a Nexez page.
 */

export type PublicSimulationResult = {
  query: string
  schema: ReturnType<typeof buildPublicDemoSchema>
  recommendations: string[]
}

const DEMO_PAGE: AgentPage = {
  id: 'demo',
  owner_id: null,
  name: 'Axle Strategy',
  slug: 'demo',
  description: 'Premium strategy and execution support for ambitious founders and teams.',
  website_url: 'https://axlestrategy.com',
  cta_url: 'https://axlestrategy.com/book',
  cta_label: 'Book a Strategy Session',
  audience: 'Founders and leadership teams scaling from $2M to $20M+',
  location: 'Global (remote plus select in person)',
  contact_email: 'hello@axlestrategy.com',
  industry: 'Consulting & Strategy',
  prefer_original_site: false,
  is_published: true,
  products: [
    {
      name: 'Founder OS Template Pack',
      price: '$99',
      description: 'Notion and Google Sheets system with offer builder, pipeline tracker, and onboarding flows.',
      url: 'https://axlestrategy.com/products/founder-os',
    },
    {
      name: 'Agent Ready Service Blueprint',
      price: '$149',
      description: 'Complete framework to turn any service into a structured offer built for AI agents.',
      url: 'https://axlestrategy.com/products/blueprint',
    },
  ],
  services: [
    {
      name: 'Strategy Session',
      price: '$450',
      description: '60 minute focused session. Clear deliverables, recommendations, and a next step plan.',
      url: 'https://axlestrategy.com/book/strategy',
      duration: '60 min',
    },
    {
      name: 'Implementation Retainer',
      price: 'From $1,800/mo',
      description: 'Ongoing execution support with priority access and monthly reviews.',
      url: 'https://axlestrategy.com/book/retainer',
    },
    {
      name: 'Leadership Coaching Package',
      price: '$2,400',
      description: '3 month engagement with biweekly sessions and async support.',
      url: 'https://axlestrategy.com/book/coaching',
    },
  ],
  faqs: [
    { question: 'Can an AI agent book directly?', answer: 'Yes. Every offer includes a direct checkout path agents can follow.' },
    { question: 'Do you work with early stage startups?', answer: 'We specialize in companies between $2M and $20M ARR.' },
  ],
  created_at: new Date().toISOString(),
}

export const DEFAULT_AGENT_QUERY = 'Find the best-fit offer and explain the next step'

export function getDemoPage(): AgentPage {
  return DEMO_PAGE
}

export function buildDefaultAgentQuery(page: AgentPage) {
  const offer = getCheckoutOffers(page)[0]
  const location = page.location ? ` in ${page.location}` : ''

  if (offer) {
    const verb = offer.kind === 'services' ? 'Book' : 'Buy'
    return `${verb} ${offer.name}${location} and confirm price, fit, and next steps`
  }

  return `Evaluate ${page.name}${location} and recommend the best next action`
}

export function buildPublicDemoSchema(page: AgentPage, query: string, baseUrl = getBaseUrl()) {
  const offers = getCheckoutOffers(page).map((offer) => {
    const effectiveUrl = offer.url || page.cta_url || page.website_url

    return {
      key: getCheckoutOfferKey(offer.kind, offer.index),
      type: offer.kind === 'services' ? 'service' : 'product',
      name: offer.name,
      price: offer.price || null,
      description: offer.description || null,
      url: effectiveUrl,
      checkoutUrl: effectiveUrl,
      action: {
        method: 'POST',
        endpoint: `${baseUrl}/api/checkout`,
        body: {
          slug: page.slug,
          offer: getCheckoutOfferKey(offer.kind, offer.index),
        },
      },
    }
  })

  return {
    agent: 'Generic Agent',
    query,
    schemaVersion: 'nexez.agent-page.v1',
    page: {
      name: page.name,
      slug: page.slug,
      url: `${baseUrl}/${page.slug}`,
      agentJsonUrl: `${baseUrl}/${page.slug}/agent.json`,
      summary: page.description,
      audience: page.audience,
      location: page.location,
      contactEmail: page.contact_email,
      offers,
      faqs: page.faqs ?? [],
    },
    suggestedActions: [
      page.cta_url || page.website_url ? `Open ${page.cta_label || 'primary action'}` : 'Ask for booking URL',
      page.contact_email ? 'Send buyer context to contact email' : 'Ask for contact email',
      'Summarize offer for buyer',
    ],
  }
}

export function getRecommendations(page: AgentPage): string[] {
  const recommendations: string[] = []

  if (!page.description) recommendations.push('Add a natural-language summary for agents.')
  if (!page.cta_url && !page.website_url) recommendations.push('Add a direct booking, purchase, or website URL.')
  if (getCheckoutOffers(page).length === 0) recommendations.push('Add at least one product or service.')
  if (!page.audience) recommendations.push('Describe the best-fit buyer.')
  if (!page.faqs?.length) recommendations.push('Add FAQs so agents can answer buyer objections.')
  if (!page.location && !page.contact_email) recommendations.push('Add service area or contact email.')

  return recommendations
}

export type SimulationResult = {
  ok?: boolean
  provider?: string
  checkoutUrl?: string
  actionUrl?: string | null
  stripeConfigured?: boolean
  events?: Record<string, boolean>
  error?: string
}

export function buildParsedSchema(page: AgentPage, query: string, agent: string, baseUrl = getBaseUrl()) {
  const pagePrefer = !!page.prefer_original_site

  const offers = getCheckoutOffers(page).map((offer) => {
    const perOfferPrefer = !!offer.prefer_original_for_this
    const useOriginal = perOfferPrefer || (pagePrefer && !!offer.url)
    const effectiveCheckout = useOriginal && offer.url 
      ? offer.url 
      : `${baseUrl}/checkout/${page.slug}?offer=${getCheckoutOfferKey((offer as any).kind, (offer as any).index)}`

    return {
      key: getCheckoutOfferKey((offer as any).kind, (offer as any).index),
      type: (offer as any).kind === 'services' ? 'service' : 'product',
      name: offer.name,
      price: offer.price || null,
      description: offer.description || null,
      url: offer.url || page.cta_url || page.website_url,
      checkoutUrl: effectiveCheckout,
      prefersOriginal: useOriginal,
      action: {
        method: 'POST',
        endpoint: `${baseUrl}/api/checkout`,
        body: {
          slug: page.slug,
          offer: getCheckoutOfferKey((offer as any).kind, (offer as any).index),
        },
      },
    }
  })

  return {
    agent,
    query,
    schemaVersion: 'nexez.agent-page.v1',
    page: {
      name: page.name,
      slug: page.slug,
      url: `${baseUrl}/${page.slug}`,
      agentJsonUrl: `${baseUrl}/${page.slug}/agent.json`,
      summary: page.description,
      audience: page.audience,
      location: page.location,
      contactEmail: page.contact_email,
      preferOriginalSite: pagePrefer,
      offers,
      faqs: page.faqs ?? [],
    },
    suggestedActions: [
      page.cta_url || page.website_url ? `Open ${page.cta_label || 'primary action'}` : 'Ask business for booking URL',
      page.contact_email ? 'Send buyer context to contact email' : 'Ask for contact email',
      'Summarize offer for buyer',
    ],
  }
}

// Helper to run a full multi-agent simulation for a page (used by /simulator and enhanced public-simulate)
// Data flywheel: results + history snapshots (persisted in page.simulations JSONB) feed scoring/recs improvements over time.
// Modularity: history depth, advanced exports, cross-page comparisons supported; can be extended with billing for tiered access.
export function runMultiAgentSimulation(page: AgentPage, query: string = buildDefaultAgentQuery(page), baseUrl = getBaseUrl()) {
  const agents = ['ChatGPT', 'Claude', 'Grok', 'Perplexity', 'Generic Agent']
  const results = agents.map(agent => ({
    agent,
    schema: buildParsedSchema(page, query, agent, baseUrl),
    recommendations: getRecommendations(page),
    readiness: getReadinessScore(page),
  }))
  return { query, results }
}

// ---------------------------------------------------------------------------
// Query-aware public simulation (homepage teaser).
// Makes the simulation respond to the visitor's question: detecting intent,
// ranking the most relevant offers, and producing a tailored agent answer plus
// concrete next actions. Advanced LLM can enhance the natural language when configured.
// ---------------------------------------------------------------------------

export type SimIntent = 'booking' | 'pricing' | 'fit' | 'product' | 'contact' | 'overview'

const INTENT_LABELS: Record<SimIntent, string> = {
  booking: 'Booking intent',
  pricing: 'Pricing intent',
  fit: 'Fit / qualification',
  product: 'Product intent',
  contact: 'Contact intent',
  overview: 'General intent',
}

const SIM_STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'do', 'does', 'can', 'could', 'would', 'will', 'you', 'this', 'that',
  'for', 'to', 'of', 'and', 'or', 'with', 'how', 'what', 'much', 'it', 'my', 'me', 'your', 'they',
  'them', 'on', 'in', 'at', 'be', 'have', 'has', 'about', 'any', 'some', 'near', 'here', 'there',
  'get', 'need', 'want', 'their', 'we', 'us', 'i',
])

export function detectIntent(query: string): SimIntent {
  const q = ` ${query.toLowerCase()} `
  if (/(book|schedul|appointment|availab|slot|reserve|when can|next week|today|tomorrow|this week)/.test(q)) return 'booking'
  if (/(price|pricing|cost|how much|rate|fee|budget|afford|cheap|expensive|\$)/.test(q)) return 'pricing'
  if (/(product|template|pack|download|kit|toolkit|blueprint)/.test(q)) return 'product'
  if (/(contact|email|reach|call|talk|speak|get in touch|support)/.test(q)) return 'contact'
  if (/(fit|good for|right for|suitable|work with|help|startup|founder|team|scal|enterprise|small business)/.test(q)) return 'fit'
  return 'overview'
}

function simTokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2 && !SIM_STOPWORDS.has(w))
}

function priceToNumber(price: string | null | undefined): number | null {
  if (!price) return null
  const m = price.replace(/,/g, '').match(/\d+(\.\d+)?/)
  return m ? Math.round(parseFloat(m[0]) * 100) : null
}

export type RankedSimOffer = {
  key: string
  type: 'service' | 'product'
  name: string
  price: string | null
  cents: number | null
  description: string | null
  checkoutUrl: string
  score: number
  bestMatch: boolean
}

export type PublicQueryResult = {
  query: string
  intent: SimIntent
  intentLabel: string
  answer: string
  readiness: number
  confidence: number
  offers: RankedSimOffer[]
  agentActions: string[]
}

export function interpretPublicQuery(page: AgentPage, query: string): PublicQueryResult {
  const intent = detectIntent(query)
  const qTokens = new Set(simTokens(query))
  const q = query.trim()

  const ranked: RankedSimOffer[] = getCheckoutOffers(page).map((offer) => {
    const key = getCheckoutOfferKey(offer.kind, offer.index)
    const checkoutUrl = offer.url || page.cta_url || page.website_url || `${getBaseUrl()}/checkout/${page.slug}?offer=${key}`
    const tokens = simTokens(`${offer.name} ${offer.description || ''}`)
    let score = tokens.reduce((s, w) => s + (qTokens.has(w) ? 2 : 0), 0)
    if (intent === 'product' && offer.kind === 'products') score += 3
    if ((intent === 'booking' || intent === 'fit') && offer.kind === 'services') score += 2
    return {
      key,
      type: (offer.kind === 'services' ? 'service' : 'product') as 'service' | 'product',
      name: offer.name,
      price: offer.price || null,
      cents: priceToNumber(offer.price),
      description: offer.description || null,
      checkoutUrl,
      score,
      bestMatch: false,
    }
  })

  const readiness = getReadinessScore(page)
  if (ranked.length === 0) {
    return {
      query: q,
      intent,
      intentLabel: INTENT_LABELS[intent],
      answer: `${page.name} has no structured offers yet, so an agent can't act. Add at least one offer with a price and an action.`,
      readiness,
      confidence: 0.4,
      offers: [],
      agentActions: ['Add a product or service with a clear price', 'Add a booking, purchase, or contact action'],
    }
  }

  const hadTokenMatch = ranked.some((o) => o.score > 0)
  const withPrice = ranked.filter((o) => o.cents != null)
  const cheapest = withPrice.slice().sort((a, b) => a.cents! - b.cents!)[0]
  const topScored = ranked.slice().sort((a, b) => b.score - a.score)[0]

  let best: RankedSimOffer
  if (topScored && topScored.score > 0) best = topScored
  else if (intent === 'pricing' && cheapest) best = cheapest
  else if (intent === 'product') best = ranked.find((o) => o.type === 'product') || ranked[0]
  else best = ranked.find((o) => o.type === 'service') || ranked[0]

  const offers = ranked
    .map((o) => ({ ...o, bestMatch: o.key === best.key }))
    .sort((a, b) => Number(b.bestMatch) - Number(a.bestMatch) || b.score - a.score)

  const audience = page.audience || 'ambitious teams'
  const offerCount = ranked.length
  const productCount = ranked.filter((o) => o.type === 'product').length
  const priceCents = withPrice.map((o) => o.cents!).sort((a, b) => a - b)
  const fmt = (c: number) => `$${Math.round(c / 100).toLocaleString()}`
  const priceRange = priceCents.length
    ? `${fmt(priceCents[0])} to ${fmt(priceCents[priceCents.length - 1])}`
    : 'clear, listed pricing'
  const bm = best.name
  const bmPrice = best.price ? ` (${best.price})` : ''

  let answer: string
  const agentActions: string[] = []

  switch (intent) {
    case 'booking':
      answer = `${page.name} exposes structured offers, so an agent sees “${bm}”${bmPrice} is bookable directly. To act on “${q}”, it calls the checkout action with offer="${best.key}" and returns a confirmed booking link, with no human back and forth.`
      agentActions.push(`POST /api/checkout { slug: "${page.slug}", offer: "${best.key}" } → returns a booking link`)
      agentActions.push(`Read /${page.slug}/agent.json for the machine readable offer and availability schema`)
      agentActions.push('Confirm the requested time with the buyer, then complete checkout')
      break
    case 'pricing':
      answer = `Pricing is explicit, so an agent compares instantly. The entry point is “${cheapest?.name || bm}”${cheapest?.price ? ` at ${cheapest.price}` : ''}; the full range spans ${priceRange} across ${offerCount} offers, so it surfaces the right tier for the buyer's budget without guessing.`
      agentActions.push(`Compare ${offerCount} structured offers by price (${priceRange})`)
      agentActions.push(`Recommend “${cheapest?.name || bm}”${cheapest?.price ? ` (${cheapest.price})` : ''} as the simplest entry point`)
      agentActions.push(`POST /api/checkout { offer: "${best.key}" } once the buyer picks a tier`)
      break
    case 'product':
      answer = `An agent finds ${productCount || 'several'} purchasable product(s). The closest to “${q}” is “${bm}”${bmPrice}, with a direct checkout path it can complete autonomously.`
      agentActions.push(`POST /api/checkout { slug: "${page.slug}", offer: "${best.key}" } → completes the purchase`)
      agentActions.push(`Read /${page.slug}/agent.json for product schema + pricing`)
      agentActions.push('Summarize the product and confirm quantity with the buyer')
      break
    case 'contact':
      answer = page.contact_email
        ? `An agent can route the buyer straight to ${page.contact_email}, or act on any of ${offerCount} structured offers, for example “${bm}”${bmPrice}, without waiting for a human.`
        : `An agent acts on ${offerCount} structured offers directly. “${bm}”${bmPrice} is the strongest match for “${q}”.`
      agentActions.push(page.contact_email ? `Send buyer context to ${page.contact_email}` : 'Request a contact email from the business')
      agentActions.push(`Offer “${bm}”${bmPrice} as the recommended next step`)
      agentActions.push(`POST /api/checkout { offer: "${best.key}" } to act immediately`)
      break
    case 'fit':
      answer = `${page.name} targets ${audience}. Matching that to “${q}”, an agent recommends “${bm}”${bmPrice}, explains why it fits, and offers to book or buy on the spot.`
      agentActions.push(`Match the buyer profile against the stated audience: ${audience}`)
      agentActions.push(`Recommend “${bm}”${bmPrice} with a short rationale`)
      agentActions.push(`POST /api/checkout { offer: "${best.key}" } when the buyer is ready`)
      break
    default:
      answer = `${page.name} helps ${audience.toLowerCase()}. An agent parses ${offerCount} clearly priced offers (${priceRange}) with direct actions, so it can answer “${q}” and route intent immediately, starting with “${bm}”${bmPrice}.`
      agentActions.push(`Summarize ${offerCount} offers (${priceRange}) for the buyer`)
      agentActions.push(`Recommend “${bm}”${bmPrice} as the best starting point`)
      agentActions.push(`POST /api/checkout { offer: "${best.key}" } to act`)
  }

  return {
    query: q,
    intent,
    intentLabel: INTENT_LABELS[intent],
    answer,
    readiness,
    confidence: hadTokenMatch ? 0.97 : 0.86,
    offers,
    agentActions,
  }
}
