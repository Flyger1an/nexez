export type PricingTier = {
  name: string
  price: string
  description?: string
}

const PUBLIC_PAGE_COLUMNS = [
  'id',
  'name',
  'slug',
  'description',
  'website_url',
  'cta_url',
  'cta_label',
  'audience',
  'location',
  'contact_email',
  'industry',
  'prefer_original_site',
  'products',
  'services',
  'faqs',
  'is_published',
  'custom_domain',
  'custom_domain_verified',
  'domain_path',
  'branding',
  'created_at',
  'updated_at',
  'mcp_enabled',
  'verification_details',
  'agent_memory',
  'next_available',
  'last_booking',
  'llm_opt_in',
  'currency',
  'preferred_contact',
  // Schema contract: this column exists on BOTH pages and pages_public
  // (migration 20260805225300). On the base pages table it is an inert
  // default-true placeholder so owner selects don't 42703; the authoritative
  // value lives on pages_public, derived from marketplace_curations by
  // trg_derive_marketplace_discoverable / trg_sync_marketplace_discoverable.
  // Never read it from pages for visibility decisions.
  'marketplace_discoverable',
]

// Public/agent-facing columns only. Owner-private routing, billing, and
// integration identifiers should be fetched from the base pages table with the
// service-role client when needed.
export const PUBLIC_PAGE_SELECT = PUBLIC_PAGE_COLUMNS.join(', ')

export const SERVER_PAGE_SELECT = [
  'owner_id',
  'storefront_id',
  'google_calendar_id',
  // Owner-facing external-website ownership proof (NOT in pages_public — owner reads
  // come from the base pages table under RLS).
  'website_verified_at',
  'website_verified_method',
  ...PUBLIC_PAGE_COLUMNS,
].join(', ')

export const OWNER_PAGE_SELECT = [
  SERVER_PAGE_SELECT,
  'simulations',
  'team_collaboration',
  'versions',
  'draft',
  'draft_updated_at',
].join(', ')

export const BASIC_OWNER_PAGE_SELECT = [
  'id',
  'owner_id',
  'name',
  'slug',
  'description',
  'website_url',
  'cta_url',
  'cta_label',
  'audience',
  'location',
  'contact_email',
  'products',
  'services',
  'faqs',
  'is_published',
  'created_at',
].join(', ')

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

  // Live availability / inventory signal so agents avoid dead ends.
  availability?: 'available' | 'limited' | 'sold_out'

  // Phase 6: A/B variant serving. Offers sharing an `ab_test` id are variants of
  // one experiment; `ab_label` distinguishes them ('A', 'B', ...). The public page
  // serves a single variant per visitor (sticky) and attributes conversions per label.
  ab_test?: string
  ab_label?: string

  // Smart Rules Phase 1: hybrid booking. Absent offerType means 'fixed'
  // (direct booking - today's behavior). 'negotiable' offers route agents to
  // the Make-an-Offer negotiation flow instead of checkout.
  offerType?: 'fixed' | 'negotiable'
  rules?: OfferRules
}

/**
 * Smart Rules Phase 1: per-offer rules. Pricing rules (minPrice, discount and
 * auto-accept thresholds) are OWNER-PRIVATE - they drive server-side proposal
 * evaluation and must never be serialized into agent.json/mcp/public HTML.
 * Booking constraints (notice/blackout/max bookings) are public-safe.
 */
export type OfferRules = {
  /** Lowest acceptable proposal, money string (e.g. "$1,200"). PRIVATE. */
  minPrice?: string
  /** Max discount vs listed price an agent proposal may request, in percent. PRIVATE. */
  maxDiscountPercent?: number
  /** When true, proposals that satisfy every pricing rule auto-advance to 'agreement_proposed'. */
  autoAccept?: boolean
  /** Auto-accept band: proposal within this percent below the listed price. PRIVATE. */
  autoAcceptWithinPercent?: number
  /** Minimum notice before a booking, in hours. Public-safe. */
  minNoticeHours?: number
  /** Unavailable dates, plain YYYY-MM-DD strings (timezone-naive on purpose). Public-safe. */
  blackoutDates?: string[]
  /** Calendar protection: cap on bookings per rolling week. Public-safe. */
  maxBookingsPerWeek?: number

  // Smart Rules Phase 2 - advanced auto-decision + scope rules.
  /** Auto-record the suggested counter-offer when a proposal lands in review/flag. */
  autoCounter?: boolean
  /** What the offer includes by default. Public product info. */
  includedScope?: string
  /** What's excluded by default. Public product info. */
  excludedScope?: string
  /** Max revisions included. Public-safe. */
  maxRevisions?: number
  /** Project length cap, in weeks. Public-safe. */
  maxProjectWeeks?: number
  /** Hybrid settlement ceiling, money string (e.g. "$2,000"). Agreements at/below this
   *  amount settle autonomously (buyer self-serve, immediate capture); above it they
   *  require owner approval before the buyer can pay. Falls back to the platform default. */
  autoSettleMax?: string
}

/** Map our availability to a schema.org ItemAvailability URL (for JSON-LD). */
export function schemaAvailability(status: OfferItem['availability']): string {
  if (status === 'sold_out') return 'https://schema.org/SoldOut'
  if (status === 'limited') return 'https://schema.org/LimitedAvailability'
  return 'https://schema.org/InStock'
}

/** Human label for an availability status (null when default available). */
export function availabilityLabel(status: OfferItem['availability']): string | null {
  if (status === 'sold_out') return 'Sold out'
  if (status === 'limited') return 'Limited availability'
  return null
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

// A seller-provided credential. Legacy entries are bare strings; new entries can
// carry an automated review verdict. Neither shape is authority verification or
// score-boosting evidence because the containing JSON is owner-writable.
export type CredentialRecord = {
  id: string
  name: string
  status: 'pending' | 'verified' | 'rejected'
  file_path?: string
  mime?: string
  public?: boolean // owner opted to expose the file on the public page (signed URL)
  verdict?: {
    type?: string
    issuer?: string
    holder?: string
    expiry?: string
    expired?: boolean
    holder_matches_business?: boolean
    legitimate?: boolean
    confidence?: number
    reason?: string
  }
  uploaded_at?: string
  reviewed_at?: string
}

/** Page-level contact channels an agent can use to reach a human, in default preference order. */
export type PreferredContact = 'email' | 'cta' | 'website'
export const PREFERRED_CONTACT_ORDER: PreferredContact[] = ['email', 'cta', 'website']

export type ResolvedContact = {
  preferred: PreferredContact | null
  value: string | null
  channels: PreferredContact[]
}

/**
 * Resolve which contact channel an agent should use first, so it never has to guess
 * email vs the primary CTA vs the website. Honors the owner's stored `preferred_contact`
 * when that channel is actually configured; otherwise derives it from the channels the
 * page has (email -> cta -> website). Returns the resolved channel, its actionable value
 * (email address / URL), and every available channel with the preferred one first.
 */
export function resolvePreferredContact(
  page: Pick<AgentPage, 'contact_email' | 'cta_url' | 'website_url' | 'preferred_contact'>,
): ResolvedContact {
  const available: { channel: PreferredContact; value: string }[] = []
  const email = page.contact_email?.trim()
  const cta = page.cta_url?.trim()
  const website = page.website_url?.trim()
  // Built in PREFERRED_CONTACT_ORDER so the derived fallback is email-first.
  if (email) available.push({ channel: 'email', value: email })
  if (cta) available.push({ channel: 'cta', value: cta })
  if (website) available.push({ channel: 'website', value: website })
  if (available.length === 0) return { preferred: null, value: null, channels: [] }
  const chosen = available.find((c) => c.channel === page.preferred_contact) || available[0]
  const channels = [chosen.channel, ...available.filter((c) => c.channel !== chosen.channel).map((c) => c.channel)]
  return { preferred: chosen.channel, value: chosen.value, channels }
}

export type AgentPage = {
  id: string
  owner_id?: string | null
  name: string
  slug: string
  description: string | null
  website_url: string | null
  cta_url: string | null
  cta_label: string | null
  audience: string | null
  location: string | null
  contact_email: string | null
  preferred_contact?: PreferredContact | null   // Which channel agents should use first to reach a human; null = auto (derive)
  marketplace_discoverable?: boolean // Public discovery gate; false does not disable the direct storefront.
  industry?: string | null          // NEW: Helps with templates & AI copy for consumer vs professional services
  prefer_original_site?: boolean    // NEW: When true, booking CTAs link to the original website instead of Nexez checkout
  products: OfferItem[] | null
  services: OfferItem[] | null
  faqs: FaqItem[] | null
  is_published: boolean
  currency?: string | null  // Multi-currency: page settlement currency (ISO 4217, lowercase); default 'usd'
  custom_domain?: string | null
  custom_domain_verified?: boolean | string | null  // Phase 5: timestamp or true when DNS verified
  website_verified_at?: string | null  // Plugin pivot: proof the owner controls website_url's host
  website_verified_method?: 'dns' | 'meta' | 'file' | null
  domain_path?: string | null  // C9: path this page serves at on its custom_domain ("/" or "/pricing")
  branding?: Record<string, unknown> | null  // C10: white-label branding (accent_color, logo_url, brand_name, hide_nexez_badge)
  draft?: Record<string, unknown> | null  // D12: staged content (owner-only); promoted to live on publish
  draft_updated_at?: string | null
  domain_verification_token?: string | null
  calendly_webhook_secret?: string | null
  outbound_webhooks?: Array<string | { url: string; secret?: string | null }> | null
  google_calendar_id?: string | null
  next_available?: string | null
  llm_opt_in?: boolean
  created_at?: string
  updated_at?: string
  // Simulation history for global /simulator (reuses existing simulator engine, supports LLM-enhanced responses)
  simulations?: Array<{
    id: string
    timestamp: string
    agent: string // e.g. 'ChatGPT', 'Claude', 'Grok'
    query: string
    result: any // snapshot of parsed schema + recommendations + readiness
    readiness: number
    llmEnhanced?: boolean
  }>
  mcp_enabled?: boolean // MCP structured data toggle for agents
  // Seller-supplied verification claims and credential metadata. Nothing in this
  // JSON object is authoritative trust evidence; server-backed proofs live in the
  // dedicated custom_domain_verified / website_verified_at columns.
  trust_score?: number
  verification_details?: {
    email_verified?: boolean | string
    domain_verified?: boolean | string
    // A credential is either a legacy/self-reported name (string) or an automated
    // review record. Both remain seller claims and never contribute Trust Score.
    docs_provided?: Array<string | CredentialRecord>
    completion_rate?: number // legacy owner-writable snapshot; not trusted for scoring
    last_updated?: string
  }
  // Advanced Phase 7 features (fully implemented with LLM where applicable)
  agent_memory?: { notes?: string; updated?: string } // persistent context for agents, editable in settings, exposed in manifests
  team_collaboration?: { approvals?: Array<{ id: string; approver: string; status: 'pending' | 'approved' | 'rejected'; note?: string; ts: string }> } // real approval workflows, persisted in DB
  last_booking?: any   // Lightweight last booking from webhooks (Calendly etc.)
  versions?: Array<{
    timestamp: string
    name: string
    description?: string | null
    services: OfferItem[] | null
    products: OfferItem[] | null
    faqs: FaqItem[] | null
    industry?: string | null
    prefer_original_site?: boolean
  }>  // Versioning for drafts and publishes
}

export function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

/**
 * Slugs a listing may NOT claim: every top-level route segment on the platform
 * (a listing slugged "learn" would be silently shadowed by the static route and
 * become unreachable — Next's static routes win over the dynamic [slug]) plus
 * config-redirect sources and a small future/safety set. A sync test
 * (lib/__tests__/reserved-slugs.test.ts) fails the build if a new app/ route
 * segment is added without reserving it here.
 */
export const RESERVED_SLUGS = new Set([
  // Current top-level app routes.
  'acp', 'agent-readiness', 'agents', 'api', 'auth', 'checkout', 'compare',
  'create', 'dashboard', 'design', 'developers', 'discovery', 'enterprise',
  'examples', 'growth-control-preview', 'how-it-works', 'integrations',
  'invite', 'leaderboard', 'learn', 'login', 'mcp', 'negotiate', 'nexie',
  'onboard', 'orders', 'pricing', 'privacy', 'scan', 'security', 'shopify',
  'simulator', 'store', 'support', 'team', 'terms', 'tools', 'ucp', 'use-cases',
  // next.config redirect sources (consolidated routes).
  'directory', 'marketplace', 'competitors',
  // Reserved for future routes + generic safety.
  'blog', 'docs', 'admin', 'settings', 'account', 'billing', 'help', 'status',
  'app', 'www', 'assets', 'static', 'well-known', 'nexez',
])

/** True when a (normalized) slug collides with a platform route and must not be minted. */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug)
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

    // A/B variant grouping marker: [[ABTEST]]<testId>~<label> (pipe-safe, ids/labels never contain |)
    let abTest: string | undefined
    let abLabel: string | undefined
    const abPart = parts.find(p => p.includes('ABTEST'))
    if (abPart) {
      const raw = abPart.replace('[[ABTEST]]', '').replace('||ABTEST||', '')
      const [test, label] = raw.split('~')
      if (test) abTest = test
      if (label) abLabel = label
    }

    // Smart Rules markers: [[TYPE]]negotiable + [[RULES]]{json} (pipe-safe; only
    // negotiable is ever emitted - absent means fixed).
    let offerType: OfferItem['offerType']
    const typePart = parts.find(p => p.includes('[[TYPE]]'))
    if (typePart && typePart.replace('[[TYPE]]', '').trim() === 'negotiable') {
      offerType = 'negotiable'
    }

    let rules: OfferRules | undefined
    const rulesPart = parts.find(p => p.includes('[[RULES]]') || p.includes('||RULES||'))
    if (rulesPart) {
      try {
        const parsedRules = JSON.parse(rulesPart.replace('[[RULES]]', '').replace('||RULES||', ''))
        if (parsedRules && typeof parsedRules === 'object' && !Array.isArray(parsedRules)) {
          rules = parsedRules
        }
      } catch (e) {
        // malformed rules JSON degrades gracefully - offer still parses
      }
    }

    // Consumer block stops before any marker (robust to [[ or || forms)
    const tiersIdx = parts.findIndex(p => p.includes('TIERS'))
    const preferIdx = parts.findIndex(p => p.includes('PREFER_ORIGINAL'))
    const abIdx = parts.findIndex(p => p.includes('ABTEST'))
    const typeIdx = parts.findIndex(p => p.includes('[[TYPE]]'))
    const rulesIdx = parts.findIndex(p => p.includes('[[RULES]]') || p.includes('||RULES||'))
    const markerEnd = [tiersIdx, preferIdx, abIdx, typeIdx, rulesIdx].filter(i => i !== -1).reduce((min, i) => (min === -1 ? i : Math.min(min, i)), -1 as number)
    const consumerEnd = markerEnd !== -1 ? markerEnd : parts.length
    const consumerParts = parts.slice(4, consumerEnd).filter(p => !p.includes('TIERS') && !p.includes('PREFER_ORIGINAL') && !p.includes('ABTEST') && !p.includes('[[TYPE]]') && !p.includes('RULES') && !p.startsWith('||'))

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
      ab_test: abTest,
      ab_label: abLabel,
      offerType,
      rules,
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
      // Append A/B variant grouping marker (Phase 6, pipe-safe)
      if (item.ab_test) {
        base.push(`[[ABTEST]]${item.ab_test}~${item.ab_label || ''}`)
      }
      // Smart Rules markers (pipe-safe). Fixed is the default - only negotiable is emitted.
      if (item.offerType === 'negotiable') {
        base.push('[[TYPE]]negotiable')
      }
      if (item.rules && Object.keys(item.rules).length > 0) {
        base.push(`[[RULES]]${JSON.stringify(item.rules)}`)
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
  if (match) {
    const [, kind, indexValue] = match
    const index = Number(indexValue)
    return allOffers.find((offer) => offer.kind === kind && offer.index === index) ?? null
  }

  // Fallback: resolve by offer NAME. Natural-language bookings pass the offer's name, not its
  // structured key ("services-0"), and an LLM formats it inconsistently - "Standard Service Call",
  // "standard service call", "standard-service-call". Collapse case + all separators/punctuation so
  // every variant matches the same offer (structured keys still take priority above). First, an
  // exact normalized match; if none, a unique containment match (handles "the standard service
  // call" / partial names). Returns null when ambiguous or unmatched.
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const target = norm(key)
  if (!target) return null

  const exact = allOffers.find((offer) => norm(offer.name || '') === target)
  if (exact) return exact

  const contained = allOffers.filter((offer) => {
    const name = norm(offer.name || '')
    return name.length > 0 && (name.includes(target) || target.includes(name))
  })
  return contained.length === 1 ? contained[0] : null
}

export function sanitizePublicUrl(value: string | null | undefined, opts: { allowRelative?: boolean } = {}): string {
  const raw = (value || '').trim()
  if (!raw) return ''
  if (opts.allowRelative && raw.startsWith('/') && !raw.startsWith('//')) return raw
  try {
    const url = new URL(raw)
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:' || url.protocol === 'tel:') {
      return url.toString()
    }
  } catch {
    return ''
  }
  return ''
}

export function getOfferDestination(page: Pick<AgentPage, 'cta_url' | 'website_url' | 'contact_email'>, offer?: Pick<OfferItem, 'url'> | null) {
  const offerUrl = sanitizePublicUrl(offer?.url)
  const ctaUrl = sanitizePublicUrl(page.cta_url)
  const websiteUrl = sanitizePublicUrl(page.website_url)
  if (offerUrl) return offerUrl
  if (ctaUrl) return ctaUrl
  if (websiteUrl) return websiteUrl
  if (page.contact_email) return `mailto:${page.contact_email}`
  return ''
}

/**
 * Return the offer-level provider URL only when the seller explicitly prefers
 * the original provider. This deliberately does not fall back to a page CTA:
 * an imported Shopify product must keep its exact product URL and must never be
 * converted into an unrelated page-level checkout.
 */
export function getPreferredOriginalOfferUrl(
  page: Pick<AgentPage, 'prefer_original_site'>,
  offer?: Pick<OfferItem, 'url' | 'prefer_original_for_this'> | null,
) {
  const offerUrl = sanitizePublicUrl(offer?.url)
  if (!offerUrl) return ''
  return offer?.prefer_original_for_this || page.prefer_original_site ? offerUrl : ''
}

/** Shopify catalog items remain products even when a legacy sync stored them
 * in the services JSON column. The structured commerce metadata is the semantic
 * source of truth for agent-facing type labels. */
export function getAgentOfferType(offer: Pick<CheckoutOffer, 'kind' | 'source' | 'metadata'>): 'service' | 'product' {
  const commerceProvider = typeof offer.metadata?.commerce_provider === 'string'
    ? offer.metadata.commerce_provider.toLowerCase()
    : ''
  if (offer.source === 'shopify' || commerceProvider === 'shopify') return 'product'
  return offer.kind === 'services' ? 'service' : 'product'
}

export type ReadinessCriterion = {
  id: string
  label: string
  met: boolean
  /** Shown only when unmet - a short nudge toward filling it in. */
  hint: string
}

export const AGENT_READY_STANDARD = {
  id: 'nexez.agent-ready',
  version: '2026.1',
  label: 'Nexez Certified Agent-Ready',
  threshold: 100,
  url: 'https://nexez.ai/agent-readiness#certification-standard',
} as const

/**
 * Per-criterion readiness breakdown - the single source of truth for both the
 * numeric score and the "what's still missing" checklist on /create. Keep the
 * order stable; `getReadinessScore` is derived from `met`/total so the percentage
 * and the checklist can never drift apart.
 */
export function getReadinessCriteria(page: Partial<AgentPage>): ReadinessCriterion[] {
  const offerCount = getOfferCount({
    products: page.products ?? null,
    services: page.services ?? null,
  })
  return [
    { id: 'name', label: 'Business name', met: Boolean(page.name), hint: 'Name the business or offer agents will see.' },
    { id: 'slug', label: 'Public link', met: Boolean(page.slug), hint: 'Set the page URL (auto-fills from the name).' },
    { id: 'description', label: 'Short description', met: Boolean(page.description), hint: 'Say what you offer in a sentence or two.' },
    { id: 'website_url', label: 'Main website', met: Boolean(page.website_url), hint: 'Link your site so agents can verify you.' },
    { id: 'cta_url', label: 'Booking / checkout link', met: Boolean(page.cta_url), hint: 'Where agents send buyers to convert.' },
    { id: 'audience', label: 'Best-fit buyer', met: Boolean(page.audience), hint: 'Describe who benefits most.' },
    { id: 'industry', label: 'Industry or niche', met: Boolean(page.industry), hint: 'Pick a category for better agent matching.' },
    { id: 'location_or_contact', label: 'Location or contact', met: Boolean(page.location || page.contact_email), hint: 'Add a service area or a contact email.' },
    { id: 'offers', label: 'At least one offer', met: offerCount > 0, hint: 'Add a service or product agents can buy.' },
    { id: 'faqs', label: 'FAQs', met: Boolean(page.faqs?.length), hint: 'Answer 1–3 questions agents will ask.' },
    { id: 'publish', label: 'Published', met: Boolean(page.is_published), hint: 'Publish to make the page crawlable.' },
  ]
}

export function getReadinessScore(page: Partial<AgentPage>) {
  const criteria = getReadinessCriteria(page)
  return Math.round((criteria.filter((c) => c.met).length / criteria.length) * 100)
}

export type Certification = {
  certified: boolean
  level: 'agent-ready' | null
  status: 'certified' | 'incomplete' | 'unpublished'
  readiness: number
  label: string | null
  standard: {
    id: typeof AGENT_READY_STANDARD.id
    version: typeof AGENT_READY_STANDARD.version
    threshold: typeof AGENT_READY_STANDARD.threshold
    url: typeof AGENT_READY_STANDARD.url
  }
  criteria_met: number
  criteria_total: number
  missing: Array<Pick<ReadinessCriterion, 'id' | 'label' | 'hint'>>
}

/**
 * "Nexez Certified Agent-Ready" is a live technical certification. A listing
 * earns it only while every required readiness check passes and the listing is
 * published. Identity verification, Trust Score, and marketplace curation are
 * separate signals and must not be implied by this result.
 */
export function getCertification(page: Partial<AgentPage>): Certification {
  const criteria = getReadinessCriteria(page)
  const met = criteria.filter((criterion) => criterion.met)
  const readiness = Math.round((met.length / criteria.length) * 100)
  const certified = Boolean(page.is_published) && met.length === criteria.length
  const status = certified ? 'certified' : page.is_published ? 'incomplete' : 'unpublished'

  return {
    certified,
    level: certified ? 'agent-ready' : null,
    status,
    readiness,
    label: certified ? AGENT_READY_STANDARD.label : null,
    standard: {
      id: AGENT_READY_STANDARD.id,
      version: AGENT_READY_STANDARD.version,
      threshold: AGENT_READY_STANDARD.threshold,
      url: AGENT_READY_STANDARD.url,
    },
    criteria_met: met.length,
    criteria_total: criteria.length,
    missing: criteria
      .filter((criterion) => !criterion.met)
      .map(({ id, label, hint }) => ({ id, label, hint })),
  }
}

export function getBaseUrl() {
  return process.env.NEXT_PUBLIC_AGENT_RUNTIME_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://nexez.app'
}

type HeaderGetter = Pick<Headers, 'get'>

// A well-formed host: letters/digits/dots/hyphens, optional :port. The base URL
// derived here is embedded in (CDN-cached) agent artifacts, so a malformed or
// injected `x-forwarded-host` must never be reflected - fall back to the canonical
// runtime base instead. (Defense-in-depth alongside `Vary: x-forwarded-host` on the
// cached artifacts; the platform should also strip client-supplied X-Forwarded-Host.)
const VALID_HOST_RE = /^[a-z0-9.-]+(?::\d+)?$/i

export function getRequestBaseUrl(input: Request | HeaderGetter) {
  const maybeHeaders = 'headers' in input ? input.headers : null
  const source =
    maybeHeaders && typeof (maybeHeaders as HeaderGetter).get === 'function'
      ? (maybeHeaders as HeaderGetter)
      : (input as HeaderGetter)

  const forwardedHost = source.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = forwardedHost || source.get('host')?.split(',')[0]?.trim()

  // SECURITY: Never reflect an arbitrary or unverified host into agent-facing URLs
  // (agent.json, mcp.json, llms.txt, status links, checkout, etc.).
  // Only accept hosts that are explicitly first-party platform hosts or a page's
  // verified custom domain (caller must have already validated that).
  if (!host || !VALID_HOST_RE.test(host)) return getBaseUrl()

  // For safety, default to the canonical runtime base for any host we don't
  // explicitly recognize as safe in this context. Callers that have a verified
  // custom domain should pass a pre-resolved base instead of relying on headers.
  // This prevents cache poisoning and phishing via reflected X-Forwarded-Host.
  return getBaseUrl()
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
    // bad json - ignore
  }
  return null
}

/**
 * Verification evidence that is written only by server-side proof flows. Callers
 * must pass a persisted page row, not a client-supplied page-shaped object, when
 * using this result as an authorization or public-trust decision.
 *
 * `verification_details` is deliberately excluded: owners/editors can update that
 * JSON field, so email/domain flags and credential review statuses inside it are
 * claims, not authoritative proof.
 */
export function getServerVerificationEvidence(page: Partial<AgentPage>) {
  const customDomainVerified = Boolean(page.custom_domain_verified)
  const websiteVerified = Boolean(page.website_verified_at)

  return {
    customDomainVerified,
    websiteVerified,
    verified: customDomainVerified || websiteVerified,
  }
}

/**
 * Compute composite Trust Score (0-100).
 * Base: readiness score (up to 60).
 * + Server-backed custom-domain proof (15).
 * + Server-backed existing-website proof (10).
 * + Completion derived from persisted events supplied by the caller (up to 5).
 *
 * Seller-writable `verification_details` never contributes trust points. In
 * particular, self-asserted email/domain flags, credential statuses, and a stored
 * completion rate are not verification evidence.
 */
export function getTrustScore(page: Partial<AgentPage>, events?: any[]): number {
  const readiness = getReadinessScore(page)
  let score = readiness * 0.6 // base 60% weight

  const evidence = getServerVerificationEvidence(page)
  let completion = 0
  if (events && events.length > 0) {
    // Real computation: completion rate from checkout_events (attempts vs conversions/success)
    const attempts = events.filter(e => e.event_type === 'checkout_attempt' || e.event_type === 'checkout_view').length
    const successes = events.filter(e => e.event_type === 'stripe_session_created' || e.event_type === 'provider_redirect').length
    if (attempts > 0) completion = Math.round((successes / attempts) * 100)
  }

  if (evidence.customDomainVerified) score += 15
  if (evidence.websiteVerified) score += 10
  score += Math.min(5, (completion / 100) * 5) // up to +5 from completion

  return Math.max(0, Math.min(100, Math.round(score)))
}
