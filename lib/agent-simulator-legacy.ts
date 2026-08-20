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
  name: 'Nexez Agency',
  slug: 'demo',
  description: 'Premium strategy and execution support for ambitious founders and teams.',
  website_url: 'https://nexezagency.com',
  cta_url: 'https://nexezagency.com/book',
  cta_label: 'Book a Strategy Session',
  audience: 'Founders and leadership teams scaling from $2M to $20M+',
  location: 'Global (remote plus select in person)',
  contact_email: 'hello@nexezagency.com',
  industry: 'Consulting & Strategy',
  prefer_original_site: false,
  is_published: true,
  products: [
    {
      name: 'Founder OS Template Pack',
      price: '$99',
      description: 'Notion and Google Sheets system with offer builder, pipeline tracker, and onboarding flows.',
      url: 'https://nexezagency.com/products/founder-os',
    },
    {
      name: 'Agent Ready Service Blueprint',
      price: '$149',
      description: 'Complete framework to turn any service into a structured offer built for AI agents.',
      url: 'https://nexezagency.com/products/blueprint',
    },
  ],
  services: [
    {
      name: 'Strategy Session',
      price: '$450',
      description: '60 minute focused session. Clear deliverables, recommendations, and a next step plan.',
      url: 'https://nexezagency.com/book/strategy',
      duration: '60 min',
    },
    {
      name: 'Implementation Retainer',
      price: 'From $1,800/mo',
      description: 'Ongoing execution support with priority access and monthly reviews.',
      url: 'https://nexezagency.com/book/retainer',
    },
    {
      name: 'Leadership Coaching Package',
      price: '$2,400',
      description: '3 month engagement with biweekly sessions and async support.',
      url: 'https://nexezagency.com/book/coaching',
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
    verdict: agentVerdict(page, query, agent),
    recommendations: getRecommendations(page),
    readiness: getReadinessScore(page),
  }))
  return { query, results, success: gradeAgentSuccess(page, query) }
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

// ---------------------------------------------------------------------------
// Differentiated agent verdicts.
// The same page, judged through five distinct lenses. This is the core of an
// honest simulation: ChatGPT optimizes for *acting*, Claude for *diligence*,
// Grok for *price*, Perplexity for *citable sources*, the Generic Agent for
// *schema validity*. Given identical input they reach different stances, which
// is exactly what an owner needs to see - "who would act on my page, and who
// would bounce, and why."
// ---------------------------------------------------------------------------

export type AgentStance = 'recommend' | 'needs_info' | 'skip'

export type AgentVerdict = {
  agent: string
  lens: string
  stance: AgentStance
  headline: string
  noticed: string[]
  gaps: string[]
}

function safeHost(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

type VerdictSignals = {
  offerCount: number
  hasOffers: boolean
  pricedCount: number
  allPriced: boolean
  somePriced: boolean
  describedRatio: number
  hasCta: boolean
  hasSource: boolean
  hasAudience: boolean
  hasFaqs: boolean
  faqCount: number
  hasContact: boolean
  isPublished: boolean
  cheapest: RankedSimOffer | null
  best: RankedSimOffer | null
  bestPriced: boolean
  intent: SimIntent
  host: string | null
}

function buildVerdictSignals(page: AgentPage, query: string): VerdictSignals {
  const interp = interpretPublicQuery(page, query)
  const offers = getCheckoutOffers(page)
  const priced = offers.filter((o) => (o.price || '').trim())
  const described = offers.filter((o) => (o.description || '').trim())
  const best = interp.offers.find((o) => o.bestMatch) ?? interp.offers[0] ?? null
  const withCents = interp.offers.filter((o) => o.cents != null)
  const cheapest = withCents.slice().sort((a, b) => a.cents! - b.cents!)[0] ?? null

  return {
    offerCount: offers.length,
    hasOffers: offers.length > 0,
    pricedCount: priced.length,
    allPriced: offers.length > 0 && priced.length === offers.length,
    somePriced: priced.length > 0,
    describedRatio: offers.length ? described.length / offers.length : 0,
    hasCta: Boolean(page.cta_url || page.website_url),
    hasSource: Boolean(page.website_url),
    hasAudience: Boolean(page.audience),
    hasFaqs: Boolean(page.faqs?.length),
    faqCount: page.faqs?.length ?? 0,
    hasContact: Boolean(page.contact_email),
    isPublished: Boolean(page.is_published),
    cheapest,
    best,
    bestPriced: Boolean(best && best.price),
    intent: interp.intent,
    host: safeHost(page.website_url),
  }
}

type PersonaVerdict = Omit<AgentVerdict, 'agent'>

const VERDICT_PERSONAS: Record<string, (page: AgentPage, s: VerdictSignals) => PersonaVerdict> = {
  ChatGPT(page, s) {
    const lens = 'Can I complete the task right now?'
    if (!s.hasOffers) {
      return {
        lens,
        stance: 'skip',
        headline: `Nothing structured to act on - I'd tell the buyer ${page.name} isn't bookable here yet.`,
        noticed: [],
        gaps: ['Add at least one offer with a price and a checkout action so I have something to do.'],
      }
    }
    const noticed = [`${s.offerCount} offer${s.offerCount === 1 ? '' : 's'} I can act on via POST /api/checkout`]
    if (s.hasCta) noticed.push(`A "${page.cta_label || 'primary'}" CTA for a clean human handoff`)
    if (s.best && s.bestPriced) noticed.push(`Top match "${s.best.name}"${s.best.price ? ` (${s.best.price})` : ''} is ready to book`)
    const gaps: string[] = []
    if (!s.bestPriced) gaps.push(`Price "${s.best?.name || 'the top offer'}" so I can confirm cost before I act.`)
    if (!s.hasCta) gaps.push('Add a CTA/booking URL as a human-readable fallback path.')
    const stance: AgentStance = s.bestPriced ? 'recommend' : 'needs_info'
    return {
      lens,
      stance,
      noticed,
      gaps,
      headline:
        stance === 'recommend'
          ? `I can book "${s.best?.name}" immediately and confirm the next step with the buyer.`
          : `I can reach checkout, but with no listed price I'd pause to confirm cost first.`,
    }
  },

  Claude(page, s) {
    const lens = 'Is this complete enough to recommend with confidence?'
    const trust = [s.hasFaqs, s.hasAudience, s.describedRatio === 1 && s.hasOffers, s.hasContact, Boolean(page.description)].filter(Boolean).length
    const noticed: string[] = []
    if (page.description) noticed.push('A natural-language summary I can ground a recommendation in')
    if (s.hasAudience) noticed.push(`A stated best-fit buyer to honestly check the request against`)
    if (s.describedRatio === 1 && s.hasOffers) noticed.push('Every offer carries its own description')
    if (s.hasFaqs) noticed.push(`${s.faqCount} FAQ${s.faqCount === 1 ? '' : 's'} pre-empting buyer objections`)
    const gaps: string[] = []
    if (!page.description) gaps.push('Add a summary - without it I can only describe you generically.')
    if (s.hasOffers && s.describedRatio < 1) gaps.push('Describe every offer so I can compare them accurately.')
    if (!s.hasAudience) gaps.push('State the ideal buyer so I can judge fit instead of guessing.')
    if (!s.hasFaqs) gaps.push('Add FAQs so I can answer objections rather than defer to a human.')
    if (!s.hasContact) gaps.push("Add a contact path for questions I can't resolve from the page.")
    const stance: AgentStance = !s.hasOffers ? 'skip' : trust >= 3 ? 'recommend' : 'needs_info'
    return {
      lens,
      stance,
      noticed,
      gaps,
      headline:
        stance === 'recommend'
          ? 'Thorough enough that I can recommend it and pre-answer the obvious objections.'
          : stance === 'skip'
            ? "There's nothing to recommend yet - no offers for me to stand behind."
            : "I'd surface it with caveats; a few gaps would stop me short of a confident recommendation.",
    }
  },

  Grok(page, s) {
    const lens = 'What does it cost, and is it worth surfacing?'
    if (!s.hasOffers) {
      return { lens, stance: 'skip', headline: 'Nothing priced to compare - not worth surfacing.', noticed: [], gaps: ['Add priced offers; I skip pages I can’t rank by value.'] }
    }
    const noticed: string[] = []
    if (s.allPriced) noticed.push(`All ${s.offerCount} offers priced - instant value comparison`)
    else if (s.somePriced) noticed.push(`${s.pricedCount}/${s.offerCount} offers priced`)
    if (s.cheapest?.price) noticed.push(`Entry point at ${s.cheapest.price}`)
    if (s.best && s.bestPriced) noticed.push(`Best fit "${s.best.name}" at ${s.best.price}`)
    const gaps: string[] = []
    if (!s.somePriced) gaps.push('No prices at all - add them or I rank you below competitors who have them.')
    else if (!s.allPriced) gaps.push(`Price the other ${s.offerCount - s.pricedCount} offer${s.offerCount - s.pricedCount === 1 ? '' : 's'} - I skip what I can’t price.`)
    const stance: AgentStance = s.allPriced ? 'recommend' : s.somePriced ? 'needs_info' : 'skip'
    return {
      lens,
      stance,
      noticed,
      gaps,
      headline:
        stance === 'recommend'
          ? `Clear pricing top to bottom${s.cheapest?.price ? ` (from ${s.cheapest.price})` : ''} - easy to rank and recommend.`
          : 'Some prices missing, so my value comparison has blind spots.',
    }
  },

  Perplexity(page, s) {
    const lens = 'Can I cite a trustworthy, current source?'
    const noticed: string[] = [`A machine-readable /${page.slug}/agent.json to cite as the structured source`]
    if (s.hasSource && s.host) noticed.push(`A canonical site (${s.host}) I can attribute to`)
    if (s.hasContact) noticed.push('A verifiable contact for attribution')
    if (s.hasFaqs) noticed.push(`${s.faqCount} quotable Q&A pair${s.faqCount === 1 ? '' : 's'}`)
    const gaps: string[] = []
    if (!s.hasSource) gaps.push('Add a website URL so I have a primary source to cite, not just the Nexez page.')
    if (!s.isPublished) gaps.push('Publish the page so its structured data is citable.')
    if (!s.hasFaqs) gaps.push('Add FAQs - quotable Q&A strengthens a citation.')
    const stance: AgentStance = s.hasSource && s.isPublished ? 'recommend' : s.isPublished ? 'needs_info' : 'skip'
    return {
      lens,
      stance,
      noticed,
      gaps,
      headline:
        stance === 'recommend'
          ? `I can cite ${s.host || 'the source'} plus structured data, so I'd include it with a source link.`
          : stance === 'skip'
            ? 'Not published, so there is no stable source for me to cite.'
            : 'Citable via agent.json, but a primary website source would make me far more confident.',
    }
  },

  'Generic Agent'(page, s) {
    const lens = 'Does the machine-readable contract validate?'
    const noticed: string[] = ['schemaVersion "nexez.agent-page.v1" present', 'Checkout endpoint resolves at /api/checkout']
    if (s.hasOffers) noticed.push(`${s.offerCount} offer${s.offerCount === 1 ? '' : 's'} with stable keys + POST actions`)
    const gaps: string[] = []
    if (!s.hasOffers) gaps.push('offers[] is empty - the schema validates but there is no action to take.')
    if (!page.description) gaps.push('summary is null - populate the description field.')
    if (!s.hasContact && !page.location) gaps.push('contactEmail and location are both null.')
    const stance: AgentStance = s.hasOffers ? 'recommend' : 'needs_info'
    return {
      lens,
      stance,
      noticed,
      gaps,
      headline: s.hasOffers
        ? 'Contract is valid and actionable - offers carry keys and endpoints I can call.'
        : 'Contract validates but is empty - no offers means no callable action.',
    }
  },
}

/**
 * How a specific agent persona would judge this page for this query. Pure +
 * deterministic so it can run client-side, in tests, and as the deterministic
 * fallback when the LLM path is off.
 */
export function agentVerdict(page: AgentPage, query: string, agent: string): AgentVerdict {
  const signals = buildVerdictSignals(page, query)
  const persona = VERDICT_PERSONAS[agent] ?? VERDICT_PERSONAS['Generic Agent']
  return { agent, ...persona(page, signals) }
}

// ---------------------------------------------------------------------------
// Agent Success Score.
// Models the buyer journey an agent must complete on this page - understand the
// offer, see the price, find a next action, know the audience, clear objections,
// reach a human - and grades each step. The per-check `fix` + `field` drive the
// one-click "fix in editor" deep-links in the simulator UI. Weights sum to 100;
// `relevant` flags the checks the *current query* leans on most.
// ---------------------------------------------------------------------------

export type SuccessCheck = {
  key: string
  label: string
  pass: boolean
  detail: string
  fix: string | null
  field: string
  weight: number
  relevant: boolean
}

export type AgentSuccessReport = {
  score: number
  query: string
  intent: SimIntent
  verdict: 'ready' | 'partial' | 'blocked'
  summary: string
  checks: SuccessCheck[]
}

const INTENT_RELEVANT_CHECKS: Record<SimIntent, string[]> = {
  booking: ['action', 'price'],
  pricing: ['price', 'offer'],
  product: ['offer', 'action'],
  fit: ['audience', 'explain'],
  contact: ['reachable'],
  overview: ['offer', 'explain'],
}

export function gradeAgentSuccess(page: AgentPage, query: string): AgentSuccessReport {
  const intent = detectIntent(query)
  const offers = getCheckoutOffers(page)
  const priced = offers.filter((o) => (o.price || '').trim())
  const hasOffers = offers.length > 0
  const allPriced = hasOffers && priced.length === offers.length
  const hasCta = Boolean(page.cta_url || page.website_url)
  const relevant = new Set(INTENT_RELEVANT_CHECKS[intent] ?? [])

  const raw: Array<Omit<SuccessCheck, 'relevant'>> = [
    {
      key: 'offer',
      label: 'Understands what you offer',
      pass: hasOffers,
      detail: hasOffers ? `${offers.length} structured offer${offers.length === 1 ? '' : 's'} parsed.` : 'No products or services to act on.',
      fix: hasOffers ? null : 'Add at least one product or service.',
      field: 'offers',
      weight: 22,
    },
    {
      key: 'price',
      label: 'Sees the price',
      pass: allPriced,
      detail: !hasOffers
        ? 'No offers to price yet.'
        : allPriced
          ? `Every offer lists a price.`
          : `${offers.length - priced.length} of ${offers.length} offers have no price.`,
      fix: allPriced ? null : 'Add a price to every offer so agents can compare and confirm cost.',
      field: 'offers',
      weight: 18,
    },
    {
      key: 'action',
      label: 'Has a clear next action',
      pass: hasOffers || hasCta,
      detail: hasOffers
        ? 'Agents can POST to checkout for any offer.'
        : hasCta
          ? 'A CTA/website link gives agents a path to act.'
          : 'No checkout offer and no CTA - nowhere to send the buyer.',
      fix: hasOffers || hasCta ? null : 'Add a booking/purchase URL or a CTA so agents have a path to act.',
      field: 'cta',
      weight: 18,
    },
    {
      key: 'explain',
      label: 'Can explain it in words',
      pass: Boolean(page.description),
      detail: page.description ? 'A natural-language summary is present.' : 'No summary for agents to quote.',
      fix: page.description ? null : 'Add a natural-language summary agents can quote to buyers.',
      field: 'basics',
      weight: 12,
    },
    {
      key: 'audience',
      label: 'Knows the best-fit buyer',
      pass: Boolean(page.audience),
      detail: page.audience ? 'Target audience is stated.' : 'No audience, so agents guess at fit.',
      fix: page.audience ? null : 'Describe your ideal buyer so agents can judge fit.',
      field: 'audience',
      weight: 12,
    },
    {
      key: 'objections',
      label: 'Answers objections',
      pass: Boolean(page.faqs?.length),
      detail: page.faqs?.length ? `${page.faqs.length} FAQ${page.faqs.length === 1 ? '' : 's'} covering common questions.` : 'No FAQs, so agents defer doubts to a human.',
      fix: page.faqs?.length ? null : 'Add FAQs so agents resolve doubts instead of deferring.',
      field: 'faqs',
      weight: 9,
    },
    {
      key: 'reachable',
      label: 'Is reachable',
      pass: Boolean(page.contact_email || page.location),
      detail: page.contact_email || page.location ? 'A contact email or service area is listed.' : 'No contact email or location.',
      fix: page.contact_email || page.location ? null : 'Add a contact email or service area.',
      field: 'contact',
      weight: 9,
    },
  ]

  const checks: SuccessCheck[] = raw.map((c) => ({ ...c, relevant: relevant.has(c.key) }))
  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0)
  const earned = checks.reduce((sum, c) => sum + (c.pass ? c.weight : 0), 0)
  const score = Math.round((earned / totalWeight) * 100)
  const verdict: AgentSuccessReport['verdict'] = !hasOffers ? 'blocked' : score >= 80 ? 'ready' : score >= 50 ? 'partial' : 'blocked'

  const failingRelevant = checks.find((c) => !c.pass && c.relevant)
  const topFail = failingRelevant ?? checks.find((c) => !c.pass) ?? null
  const summary =
    verdict === 'ready'
      ? `An agent can complete a buyer's request end to end${failingRelevant ? `, though "${failingRelevant.label.toLowerCase()}" would sharpen it` : ''}.`
      : verdict === 'partial'
        ? `An agent gets part of the way; "${topFail?.label.toLowerCase() ?? 'a missing field'}" is the next thing to fix for this query.`
        : !hasOffers
          ? 'An agent has nothing to act on yet - add a priced offer to unblock it.'
          : `An agent would stall early; start with "${topFail?.label.toLowerCase() ?? 'the basics'}".`

  return { score, query, intent, verdict, summary, checks }
}
