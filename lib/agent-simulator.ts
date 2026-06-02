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
  name: 'Aether Strategy',
  slug: 'demo',
  description: 'Premium strategy and execution support for ambitious founders and teams.',
  website_url: 'https://example.com',
  cta_url: 'https://example.com/book',
  cta_label: 'Book a Strategy Session',
  audience: 'Founders and leadership teams scaling from $2M to $20M+',
  location: 'Global (remote + select in-person)',
  contact_email: 'hello@aetherstrategy.com',
  industry: 'Consulting & Strategy',
  prefer_original_site: false,
  is_published: true,
  products: [
    {
      name: 'Founder OS Template Pack',
      price: '$99',
      description: 'Notion + Google Sheets system with offer builder, pipeline tracker, and onboarding flows.',
      url: 'https://example.com/products/founder-os',
    },
    {
      name: 'Agent-Ready Service Blueprint',
      price: '$149',
      description: 'Complete framework to turn any service into a structured, AI-optimized offer.',
      url: 'https://example.com/products/blueprint',
    },
  ],
  services: [
    {
      name: 'Strategy Session',
      price: '$450',
      description: '60-minute focused session. Clear deliverables, recommendations, and next-step plan.',
      url: 'https://example.com/book/strategy',
      duration: '60 min',
    },
    {
      name: 'Implementation Retainer',
      price: 'From $1,800/mo',
      description: 'Ongoing execution support with priority access and monthly reviews.',
      url: 'https://example.com/book/retainer',
    },
    {
      name: 'Leadership Coaching Package',
      price: '$2,400',
      description: '3-month engagement with bi-weekly sessions and async support.',
      url: 'https://example.com/book/coaching',
    },
  ],
  faqs: [
    { question: 'Can an AI agent book directly?', answer: 'Yes. Every offer includes a direct checkout path agents can follow.' },
    { question: 'Do you work with early-stage startups?', answer: 'We specialize in companies between $2M–$20M ARR.' },
  ],
  created_at: new Date().toISOString(),
}

export function getDemoPage(): AgentPage {
  return DEMO_PAGE
}

export function buildPublicDemoSchema(page: AgentPage, query: string) {
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
        endpoint: `${getBaseUrl()}/api/checkout`,
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
      url: `${getBaseUrl()}/${page.slug}`,
      agentJsonUrl: `${getBaseUrl()}/${page.slug}/agent.json`,
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

export function buildParsedSchema(page: AgentPage, query: string, agent: string) {
  const pagePrefer = !!page.prefer_original_site

  const offers = getCheckoutOffers(page).map((offer) => {
    const perOfferPrefer = !!offer.prefer_original_for_this
    const useOriginal = perOfferPrefer || (pagePrefer && !!offer.url)
    const effectiveCheckout = useOriginal && offer.url 
      ? offer.url 
      : `${getBaseUrl()}/checkout/${page.slug}?offer=${getCheckoutOfferKey((offer as any).kind, (offer as any).index)}`

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
        endpoint: `${getBaseUrl()}/api/checkout`,
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
      url: `${getBaseUrl()}/${page.slug}`,
      agentJsonUrl: `${getBaseUrl()}/${page.slug}/agent.json`,
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
// Modularity: history depth, advanced exports, cross-page comparisons can be tier-gated (Free vs Pro vs Business) via future billing flags without code changes.
export function runMultiAgentSimulation(page: AgentPage, query: string = 'Book a strategy session next week') {
  const agents = ['ChatGPT', 'Claude', 'Grok', 'Perplexity', 'Generic Agent']
  const results = agents.map(agent => ({
    agent,
    schema: buildParsedSchema(page, query, agent),
    recommendations: getRecommendations(page),
    readiness: getReadinessScore(page),
  }))
  return { query, results }
}
