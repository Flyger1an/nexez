import type { AgentPage, FaqItem, OfferItem } from '@/src/types/nexez'

export const OWNER_PAGE_SELECT = [
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
  'industry',
  'products',
  'services',
  'faqs',
  'is_published',
  'custom_domain',
  'custom_domain_verified',
  'branding',
  'draft',
  'draft_updated_at',
  'mcp_enabled',
  'verification_details',
  'next_available',
  'last_booking',
  'llm_opt_in',
  'currency',
  'created_at',
  'updated_at',
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
  'updated_at',
].join(', ')

export type ReadinessCriterion = {
  id: string
  label: string
  met: boolean
  hint: string
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
    const [name = '', price = '', description = '', url = ''] = line.split('|').map((part) => part.trim())
    return { name, price, description, url }
  })
}

export function formatOfferLines(items: OfferItem[] | null | undefined) {
  return (items ?? []).map((item) => [item.name, item.price ?? '', item.description ?? '', item.url ?? ''].join(' | ')).join('\n')
}

export function parseFaqLines(value: string): FaqItem[] {
  return splitLines(value).map((line) => {
    const [question = '', answer = ''] = line.split('|').map((part) => part.trim())
    return { question, answer }
  })
}

export function formatFaqLines(items: FaqItem[] | null | undefined) {
  return (items ?? []).map((item) => [item.question, item.answer].join(' | ')).join('\n')
}

export function getOfferCount(page: Pick<AgentPage, 'products' | 'services'>) {
  return (page.products?.length ?? 0) + (page.services?.length ?? 0)
}

export function getReadinessCriteria(page: Partial<AgentPage>): ReadinessCriterion[] {
  const offerCount = getOfferCount({
    products: page.products ?? null,
    services: page.services ?? null,
  })

  return [
    { id: 'name', label: 'Business name', met: Boolean(page.name), hint: 'Name the business or offer agents will see.' },
    { id: 'slug', label: 'Public link', met: Boolean(page.slug), hint: 'Set the page URL.' },
    { id: 'description', label: 'Short description', met: Boolean(page.description), hint: 'Explain the offer in a sentence or two.' },
    { id: 'website_url', label: 'Main website', met: Boolean(page.website_url), hint: 'Link the site agents can verify.' },
    { id: 'cta_url', label: 'Booking or checkout link', met: Boolean(page.cta_url), hint: 'Add the action URL buyers should use.' },
    { id: 'audience', label: 'Best-fit buyer', met: Boolean(page.audience), hint: 'Describe who should buy.' },
    { id: 'industry', label: 'Industry', met: Boolean(page.industry), hint: 'Set a category for better matching.' },
    { id: 'location_or_contact', label: 'Location or contact', met: Boolean(page.location || page.contact_email), hint: 'Add a service area or email.' },
    { id: 'offers', label: 'At least one offer', met: offerCount > 0, hint: 'Add a product or service.' },
    { id: 'faqs', label: 'FAQs', met: Boolean(page.faqs?.length), hint: 'Answer common buyer questions.' },
    { id: 'publish', label: 'Published', met: Boolean(page.is_published), hint: 'Publish when the page is ready.' },
  ]
}

export function getReadinessScore(page: Partial<AgentPage>) {
  const criteria = getReadinessCriteria(page)
  return Math.round((criteria.filter((item) => item.met).length / criteria.length) * 100)
}

export type StructuredSignal = { id: string; label: string; unlocks: string; points: number; met: boolean }

// The Nexez "structured signals" readiness model (design handoff): each signal
// unlocks an agent capability and carries a point weight. `met` derives from real
// page data so the breakdown is actionable, not just a function of the score.
export function getStructuredSignals(page: Partial<AgentPage>): StructuredSignal[] {
  const offers = getOfferCount({ products: page.products ?? null, services: page.services ?? null })
  return [
    { id: 'offers', label: 'Offers + pricing', unlocks: 'compare price', points: 24, met: offers > 0 },
    { id: 'action', label: 'Action endpoints', unlocks: 'book & buy', points: 22, met: Boolean(page.cta_url) },
    { id: 'schema', label: 'schema.org / JSON-LD', unlocks: 'identify your business', points: 18, met: Boolean(page.name && page.description) },
    { id: 'mcp', label: 'MCP endpoint', unlocks: 'transact live', points: 14, met: Boolean(page.mcp_enabled) },
    { id: 'llms', label: 'llms.txt', unlocks: 'crawl efficiently', points: 12, met: Boolean(page.is_published) },
    { id: 'fresh', label: 'Freshness signals', unlocks: 'trust your data', points: 10, met: Boolean(page.updated_at || page.draft_updated_at) },
  ]
}

export function readinessLabel(score: number) {
  if (score >= 90) return 'Agent-ready · fully transactable'
  if (score >= 70) return 'Partially readable'
  return 'Needs structure to transact'
}

export function pageDraftPayload(page: Partial<AgentPage>) {
  return {
    name: page.name?.trim() || 'Untitled listing',
    slug: normalizeSlug(page.slug || page.name || 'listing'),
    description: page.description?.trim() || null,
    website_url: page.website_url?.trim() || null,
    cta_url: page.cta_url?.trim() || null,
    cta_label: page.cta_label?.trim() || 'Visit website',
    audience: page.audience?.trim() || null,
    location: page.location?.trim() || null,
    contact_email: page.contact_email?.trim() || null,
    industry: page.industry?.trim() || null,
    products: page.products ?? [],
    services: page.services ?? [],
    faqs: page.faqs ?? [],
    is_published: Boolean(page.is_published),
  }
}
