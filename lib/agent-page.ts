export type PricingTier = {
  name: string
  price: string
  description?: string
}

export type OfferItem = {
  name: string
  description: string
  price: string
  url: string
  tiers?: PricingTier[]   // New: supports the "pricing tiers" part of the vision

  // Consumer / Local Service fields (for bookable services like plumbing, massage, cleaning, fitness, etc.)
  duration?: string
  serviceArea?: string
  isMobile?: boolean
  travelFee?: string
}

export type OfferKind = 'services' | 'products'

export type CheckoutOffer = OfferItem & {
  kind: OfferKind
  index: number
}

export type FaqItem = {
  question: string
  answer: string
}

export type AgentPage = {
  id: string
  owner_id: string | null
  name: string
  slug: string
  description: string | null
  website_url: string | null
  cta_url: string | null
  cta_label: string | null
  audience: string | null
  location: string | null
  contact_email: string | null
  industry?: string | null          // NEW: Helps with templates & AI copy for consumer vs professional services
  prefer_original_site?: boolean    // NEW: When true, booking CTAs link to the original website instead of Nexez checkout
  products: OfferItem[] | null
  services: OfferItem[] | null
  faqs: FaqItem[] | null
  is_published: boolean
  custom_domain?: string | null
  created_at?: string
}

export function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

export function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function parseOfferLines(value: string): OfferItem[] {
  return splitLines(value).map((line) => {
    const parts = line.split('|').map((part) => part.trim())
    const [name = '', price = '', description = '', url = ''] = parts

    // Support extended consumer service fields if provided in text format
    // Format: name | price | description | url | duration | serviceArea | travelFee | isMobile(0/1)
    return {
      name,
      price,
      description,
      url,
      duration: parts[4] || undefined,
      serviceArea: parts[5] || undefined,
      travelFee: parts[6] || undefined,
      isMobile: parts[7] === '1' || parts[7]?.toLowerCase() === 'true' || undefined,
    }
  })
}

export function parseFaqLines(value: string): FaqItem[] {
  return splitLines(value).map((line) => {
    const [question = '', answer = ''] = line.split('|').map((part) => part.trim())
    return { question, answer }
  })
}

export function formatOfferLines(items: OfferItem[] | null | undefined) {
  return (items ?? [])
    .map((item) => {
      const base = [item.name, item.price, item.description, item.url]
      // Append consumer fields if present
      if (item.duration || item.serviceArea || item.travelFee || item.isMobile) {
        base.push(item.duration || '', item.serviceArea || '', item.travelFee || '', item.isMobile ? '1' : '0')
      }
      return base.join(' | ')
    })
    .join('\n')
}

export function formatFaqLines(items: FaqItem[] | null | undefined) {
  return (items ?? [])
    .map((item) => [item.question, item.answer].join(' | '))
    .join('\n')
}

export function getOfferCount(page: Pick<AgentPage, 'products' | 'services'>) {
  return (page.products?.length ?? 0) + (page.services?.length ?? 0)
}

export function getCheckoutOffers(page: Pick<AgentPage, 'products' | 'services'>): CheckoutOffer[] {
  return [
    ...(page.services ?? []).map((offer, index) => ({ ...offer, kind: 'services' as const, index })),
    ...(page.products ?? []).map((offer, index) => ({ ...offer, kind: 'products' as const, index })),
  ]
}

export function getCheckoutOfferKey(kind: OfferKind, index: number) {
  return `${kind}-${index}`
}

export function getCheckoutPath(slug: string, kind: OfferKind, index: number) {
  return `/checkout/${slug}?offer=${getCheckoutOfferKey(kind, index)}`
}

export function getCheckoutOffer(page: Pick<AgentPage, 'products' | 'services'>, offerKey?: string | string[]) {
  const key = Array.isArray(offerKey) ? offerKey[0] : offerKey
  const allOffers = getCheckoutOffers(page)

  if (!key) {
    return allOffers[0] ?? null
  }

  const match = key.match(/^(services|products)-(\d+)$/)
  if (!match) {
    return allOffers[0] ?? null
  }

  const [, kind, indexValue] = match
  const index = Number(indexValue)

  return allOffers.find((offer) => offer.kind === kind && offer.index === index) ?? allOffers[0] ?? null
}

export function getOfferDestination(page: Pick<AgentPage, 'cta_url' | 'website_url' | 'contact_email'>, offer?: Pick<OfferItem, 'url'> | null) {
  if (offer?.url) return offer.url
  if (page.cta_url) return page.cta_url
  if (page.website_url) return page.website_url
  if (page.contact_email) return `mailto:${page.contact_email}`
  return ''
}

export function getReadinessScore(page: Partial<AgentPage>) {
  const checks = [
    Boolean(page.name),
    Boolean(page.slug),
    Boolean(page.description),
    Boolean(page.website_url),
    Boolean(page.cta_url),
    Boolean(page.audience),
    Boolean(page.industry),
    Boolean(page.location || page.contact_email),
    getOfferCount({
      products: page.products ?? null,
      services: page.services ?? null,
    }) > 0,
    Boolean(page.faqs?.length),
    Boolean(page.is_published),
  ]

  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

export function getBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://nexez.vercel.app'
}
