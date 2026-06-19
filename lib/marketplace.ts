import {
  AgentPage,
  CheckoutOffer,
  getCertification,
  getCheckoutOffers,
  getOfferCount,
  getReadinessScore,
  getTrustScore,
} from './agent-page'

export type MarketplaceCategory = 'professional' | 'consumer'
export type MarketplacePriceBand = 'free' | 'under_100' | '100_500' | '500_2000' | '2000_plus' | 'custom'
export type MarketplaceTrustSegment = 'certified' | 'high_trust' | 'agent_ready' | 'needs_context'

export type MarketplaceSummary = {
  readiness: number
  trust_score: number
  offer_count: number
  category: MarketplaceCategory
  industry: string | null
  verified: boolean
  certified: boolean
  has_credentials: boolean
  has_recent_activity: boolean
  supports_checkout: boolean
  supports_negotiation: boolean
  price_band: MarketplacePriceBand
  badges: string[]
}

export type MarketplaceIntentPreset = {
  id: string
  label: string
  query: string
  description: string
  href: string
}

export type MarketplaceInsights = {
  totals: {
    pages: number
    offers: number
    certified: number
    highTrust: number
    negotiable: number
    checkoutReady: number
  }
  categories: Array<{ id: MarketplaceCategory | 'all'; label: string; count: number; href: string }>
  priceBands: Array<{ id: MarketplacePriceBand; label: string; count: number }>
  trustSegments: Array<{ id: MarketplaceTrustSegment; label: string; count: number; description: string }>
  topIndustries: Array<{ label: string; count: number; href: string }>
  intentPresets: MarketplaceIntentPreset[]
}

const CONSUMER_KEYWORDS = [
  'home',
  'plumbing',
  'cleaning',
  'massage',
  'fitness',
  'wellness',
  'pet',
  'grooming',
  'auto',
  'detailing',
  'beauty',
  'medical',
  'health',
  'events',
  'repair',
  'landscaping',
  'real estate',
  'photography',
]

const PRICE_BAND_LABELS: Record<MarketplacePriceBand, string> = {
  free: 'Free / discovery',
  under_100: 'Under $100',
  '100_500': '$100-$500',
  '500_2000': '$500-$2K',
  '2000_plus': '$2K+',
  custom: 'Custom / quote',
}

export function classifyMarketplaceCategory(page: Pick<AgentPage, 'industry' | 'services' | 'products' | 'name' | 'description'>): MarketplaceCategory {
  const haystack = [
    page.industry,
    page.name,
    page.description,
    ...(page.services ?? []).flatMap((offer) => [offer.name, offer.description]),
    ...(page.products ?? []).flatMap((offer) => [offer.name, offer.description]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return CONSUMER_KEYWORDS.some((keyword) => haystack.includes(keyword)) ? 'consumer' : 'professional'
}

export function getMarketplacePriceBand(page: Pick<AgentPage, 'services' | 'products'>): MarketplacePriceBand {
  const prices = getCheckoutOffers(page)
    .map((offer) => parsePriceCents(offer.price))
    .filter((value): value is number => typeof value === 'number')

  if (!prices.length) return 'custom'

  const lowest = Math.min(...prices)
  if (lowest === 0) return 'free'
  if (lowest < 10_000) return 'under_100'
  if (lowest < 50_000) return '100_500'
  if (lowest < 200_000) return '500_2000'
  return '2000_plus'
}

export function summarizeMarketplacePage(page: AgentPage): MarketplaceSummary {
  const readiness = getReadinessScore(page)
  const trustScore = getTrustScore(page)
  const certification = getCertification(page)
  const offers = getCheckoutOffers(page)
  const verification = page.verification_details ?? {}
  const hasCredentials =
    Array.isArray(verification.docs_provided) &&
    verification.docs_provided.some((doc: any) => doc && typeof doc === 'object' && doc.status === 'verified')
  const verified = Boolean(page.custom_domain_verified || verification.domain_verified || verification.email_verified)
  const supportsNegotiation = offers.some((offer) => offer.offerType === 'negotiable')
  const supportsCheckout = offers.some((offer) => offer.availability !== 'sold_out')

  const badges = [
    certification.certified ? 'Certified Agent-Ready' : null,
    verified ? 'Verified seller' : null,
    supportsNegotiation ? 'Negotiable' : null,
    page.last_booking ? 'Recent activity' : null,
    supportsCheckout ? 'Checkout ready' : null,
  ].filter(Boolean) as string[]

  return {
    readiness,
    trust_score: trustScore,
    offer_count: getOfferCount(page),
    category: classifyMarketplaceCategory(page),
    industry: page.industry || null,
    verified,
    certified: certification.certified,
    has_credentials: hasCredentials,
    has_recent_activity: Boolean(page.last_booking),
    supports_checkout: supportsCheckout,
    supports_negotiation: supportsNegotiation,
    price_band: getMarketplacePriceBand(page),
    badges,
  }
}

export function buildMarketplaceInsights(pages: AgentPage[], opts: { query?: string; type?: string; category?: string; minReadiness?: number } = {}): MarketplaceInsights {
  const summaries = pages.map((page) => ({ page, summary: summarizeMarketplacePage(page) }))
  const totals = summaries.reduce(
    (acc, item) => {
      acc.pages += 1
      acc.offers += item.summary.offer_count
      if (item.summary.certified) acc.certified += 1
      if (item.summary.trust_score >= 80) acc.highTrust += 1
      if (item.summary.supports_negotiation) acc.negotiable += 1
      if (item.summary.supports_checkout) acc.checkoutReady += 1
      return acc
    },
    { pages: 0, offers: 0, certified: 0, highTrust: 0, negotiable: 0, checkoutReady: 0 },
  )

  const categories = [
    { id: 'all' as const, label: 'All sellers', count: pages.length, href: marketplaceHref({ ...opts, category: 'all' }) },
    {
      id: 'professional' as const,
      label: 'Professional',
      count: summaries.filter((item) => item.summary.category === 'professional').length,
      href: marketplaceHref({ ...opts, category: 'professional' }),
    },
    {
      id: 'consumer' as const,
      label: 'Consumer / local',
      count: summaries.filter((item) => item.summary.category === 'consumer').length,
      href: marketplaceHref({ ...opts, category: 'consumer' }),
    },
  ]

  const priceBands = (Object.keys(PRICE_BAND_LABELS) as MarketplacePriceBand[]).map((id) => ({
    id,
    label: PRICE_BAND_LABELS[id],
    count: summaries.filter((item) => item.summary.price_band === id).length,
  }))

  const trustSegments = [
    {
      id: 'certified' as const,
      label: 'Certified',
      count: summaries.filter((item) => item.summary.certified).length,
      description: 'Published pages with very high readiness.',
    },
    {
      id: 'high_trust' as const,
      label: 'High trust',
      count: summaries.filter((item) => item.summary.trust_score >= 80).length,
      description: 'Strong structure plus verification signals.',
    },
    {
      id: 'agent_ready' as const,
      label: 'Agent-ready',
      count: summaries.filter((item) => item.summary.readiness >= 75).length,
      description: 'Clear enough for AI buyers to parse and act.',
    },
    {
      id: 'needs_context' as const,
      label: 'Needs context',
      count: summaries.filter((item) => item.summary.readiness < 75).length,
      description: 'Useful listings that may need a human review.',
    },
  ]

  const industryCounts = new Map<string, number>()
  for (const page of pages) {
    const industry = (page.industry || 'Uncategorized').trim()
    industryCounts.set(industry, (industryCounts.get(industry) ?? 0) + 1)
  }

  const topIndustries = [...industryCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([label, count]) => ({
      label,
      count,
      href: marketplaceHref({ ...opts, query: label, category: opts.category || 'all' }),
    }))

  return {
    totals,
    categories,
    priceBands,
    trustSegments,
    topIndustries,
    intentPresets: buildMarketplaceIntentPresets(opts),
  }
}

function buildMarketplaceIntentPresets(opts: { type?: string; category?: string; minReadiness?: number }): MarketplaceIntentPreset[] {
  const presets = [
    {
      id: 'book-service',
      label: 'Book a service',
      query: 'strategy session consultation booking',
      description: 'Find sellers with service offers and direct action paths.',
    },
    {
      id: 'compare-retainers',
      label: 'Compare retainers',
      query: 'retainer monthly support package',
      description: 'Surface recurring or scoped support offers.',
    },
    {
      id: 'local-help',
      label: 'Find local help',
      query: 'local mobile service available',
      description: 'Prioritize nearby consumer and field-service listings.',
    },
    {
      id: 'buy-products',
      label: 'Buy products',
      query: 'product package kit',
      description: 'Search product-style offers with checkout handoffs.',
    },
  ]

  return presets.map((preset) => ({
    ...preset,
    href: marketplaceHref({
      query: preset.query,
      type: preset.id === 'buy-products' ? 'product' : opts.type || 'all',
      category: preset.id === 'local-help' ? 'consumer' : opts.category || 'all',
      minReadiness: opts.minReadiness,
    }),
  }))
}

function marketplaceHref(opts: { query?: string; type?: string; category?: string; minReadiness?: number }) {
  const params = new URLSearchParams()
  if (opts.query) params.set('q', opts.query)
  if (opts.type && opts.type !== 'all') params.set('type', opts.type)
  if (opts.category && opts.category !== 'all') params.set('category', opts.category)
  if (opts.minReadiness && opts.minReadiness > 0) params.set('min_readiness', String(opts.minReadiness))
  const qs = params.toString()
  return `/discovery${qs ? `?${qs}` : ''}`
}

function parsePriceCents(value: string | null | undefined): number | null {
  const raw = (value || '').toLowerCase()
  if (!raw || raw.includes('custom') || raw.includes('quote') || raw.includes('varies')) return null
  if (raw.includes('free')) return 0
  const match = raw.match(/[\d,.]+/)
  if (!match) return null
  const amount = Number(match[0].replace(/,/g, ''))
  if (!Number.isFinite(amount)) return null
  return Math.max(0, Math.round(amount * 100))
}
