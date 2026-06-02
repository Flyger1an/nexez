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

  // Phase 4: Per-offer "Book on original site" preference (for granular linking/embedding)
  prefer_original_for_this?: boolean
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
  custom_domain_verified?: boolean | string | null  // Phase 5: timestamp or true when DNS verified
  created_at?: string
  // Phase 7 (de-duped 2026 spec): Simulation history for global /simulator (reuses existing simulator engine)
  simulations?: Array<{
    id: string
    timestamp: string
    agent: string // e.g. 'ChatGPT', 'Claude', 'Grok'
    query: string
    result: any // snapshot of parsed schema + recommendations + readiness
    readiness: number
  }>
  mcp_enabled?: boolean // Phase 7: MCP structured data toggle
  // Phase 7 Tier 2: Trust score + verification (composite from readiness, verified flags, event completion rates)
  trust_score?: number
  verification_details?: {
    email_verified?: boolean | string
    domain_verified?: boolean | string
    docs_provided?: string[]
    completion_rate?: number // from events
    last_updated?: string
  }
  // Phase 7 Tier 3 stubs
  agent_memory?: any // context for agents (future)
  team_collaboration?: { approvals?: any[] } // workflows stub
  last_booking?: any   // Phase 3: lightweight last booking from webhooks (Calendly etc.)
  versions?: Array<{
    timestamp: string
    name: string
    description?: string | null
    services: OfferItem[] | null
    products: OfferItem[] | null
    faqs: FaqItem[] | null
    industry?: string | null
    prefer_original_site?: boolean
  }>  // Phase 4 MVP: simple versioning stub
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

    // Support extended consumer service fields + tiers + per-offer original preference (Phase 1 A + Phase 4 fidelity)
    // Markers use [[ ]] (safe, no collision with | field delimiter) or legacy ||TIERS||
    let tiers: PricingTier[] | undefined
    const tiersPart = parts.find(p => p.includes('TIERS'))
    if (tiersPart) {
      try {
        tiers = JSON.parse(tiersPart.replace('||TIERS||', '').replace('[[TIERS]]', ''))
      } catch (e) {
        // ignore bad json
      }
    }

    let preferOriginalForThis: boolean | undefined
    const preferPart = parts.find(p => p.includes('PREFER_ORIGINAL'))
    if (preferPart) {
      preferOriginalForThis = true
    }

    // Consumer block stops before any marker (robust to [[ or || forms)
    const tiersIdx = parts.findIndex(p => p.includes('TIERS'))
    const preferIdx = parts.findIndex(p => p.includes('PREFER_ORIGINAL'))
    const markerEnd = [tiersIdx, preferIdx].filter(i => i !== -1).reduce((min, i) => (min === -1 ? i : Math.min(min, i)), -1 as number)
    const consumerEnd = markerEnd !== -1 ? markerEnd : parts.length
    const consumerParts = parts.slice(4, consumerEnd).filter(p => !p.includes('TIERS') && !p.includes('PREFER_ORIGINAL') && !p.startsWith('||'))

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
      prefer_original_for_this: preferOriginalForThis,
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
      // Append per-offer original site preference marker (Phase 4 fidelity, zero new column)
      // Use [[ ]] wrapper (pipe-safe, no delimiter collision unlike || form)
      if (item.prefer_original_for_this) {
        base.push('[[PREFER_ORIGINAL]]')
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

/**
 * Phase 7 Tier 2: Compute composite Trust Score (0-100).
 * Base: readiness score.
 * + Verified signals (custom_domain_verified, verification_details.email/domain).
 * + Stub for completion_rate (from verification_details or future events aggregation).
 * Simple weighted formula for now; can be refined with analytics events.
 * Used in public pages, directory, editor, settings.
 */
export function getTrustScore(page: Partial<AgentPage>, events?: any[]): number {
  const readiness = getReadinessScore(page)
  let score = readiness * 0.6 // base 60% weight

  const v = (page as any).verification_details || {}
  const hasDomain = !!(page.custom_domain_verified || v.domain_verified)
  const hasEmail = !!v.email_verified
  const hasDocs = Array.isArray(v.docs_provided) && v.docs_provided.length > 0

  let completion = v.completion_rate || 0
  if (events && events.length > 0) {
    // Real computation: completion rate from checkout_events (attempts vs conversions/success)
    const attempts = events.filter(e => e.event_type === 'checkout_attempt' || e.event_type === 'view').length
    const successes = events.filter(e => e.event_type === 'stripe_session_created' || e.event_type === 'provider_redirect').length
    if (attempts > 0) completion = Math.round((successes / attempts) * 100)
  }

  if (hasDomain) score += 15
  if (hasEmail) score += 10
  if (hasDocs) score += 10
  score += Math.min(5, (completion / 100) * 5) // up to +5 from completion

  return Math.max(0, Math.min(100, Math.round(score)))
}

