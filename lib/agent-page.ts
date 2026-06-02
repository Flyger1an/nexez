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

  // Optional quality signal (primarily from Site Importer)
  confidence?: number

  // Integration source (Calendly, Stripe, Shopify, etc.)
  source?: string

  // Integration metadata (stable IDs for webhooks/re-sync, consumer hints, etc.)
  metadata?: Record<string, any>
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
  last_booking?: any   // Phase 3: lightweight last booking from webhooks (Calendly etc.)
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

    // Support extended consumer service fields + tiers (Phase 1 A fidelity)
    // Robust extraction: find ||TIERS|| anywhere after base fields
    let tiers: PricingTier[] | undefined
    const tiersPart = parts.find(p => p.startsWith('||TIERS||'))
    if (tiersPart) {
      try {
        tiers = JSON.parse(tiersPart.replace('||TIERS||', ''))
      } catch (e) {
        // ignore bad json
      }
    }

    // Consumer block is the 4 slots immediately after the first 4 base fields,
    // but stop before any tiers suffix if present
    const tiersIdx = parts.findIndex(p => p.startsWith('||TIERS||'))
    const consumerEnd = tiersIdx !== -1 ? tiersIdx : parts.length
    const consumerParts = parts.slice(4, consumerEnd)

    const isMobileRaw = consumerParts[3] || ''
    const isMobile = ['1', 'true', 'mobile', 'yes'].includes(isMobileRaw.toLowerCase())

    return {
      name,
      price,
      description,
      url,
      duration: consumerParts[0] || undefined,
      serviceArea: consumerParts[1] || undefined,
      travelFee: consumerParts[2] || undefined,
      isMobile: isMobile || undefined,
      tiers,
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
      // Append consumer fields if present (Phase 1 A)
      if (item.duration || item.serviceArea || item.travelFee || item.isMobile) {
        base.push(item.duration || '', item.serviceArea || '', item.travelFee || '', item.isMobile ? '1' : '0')
      }
      // Append tiers (JSON suffix) for full roundtrip fidelity
      if (item.tiers && item.tiers.length > 0) {
        base.push(`||TIERS||${JSON.stringify(item.tiers)}`)
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

/**
 * Phase 3: Parse the compact ||WINDOWS|| marker we append during Google Calendar stub import.
 * Allows structured upcoming slots to roundtrip into agent.json and public page
 * without requiring a new DB column (consistent with the ||TIERS|| fidelity pattern).
 */
export function parseAvailabilityWindows(note: string | null | undefined): Array<{ date: string; start: string; end: string; label?: string }> | null {
  if (!note) return null
  const marker = note.split('||WINDOWS||')[1]
  if (!marker) return null
  try {
    const parsed = JSON.parse(marker)
    if (Array.isArray(parsed)) return parsed
  } catch {
    // bad json — ignore
  }
  return null
}
