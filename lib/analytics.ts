import { AgentPage, getReadinessScore } from './agent-page'
import { isLikelyAgentUserAgent as detectLikelyAgentUserAgent } from './agent-detection'
import { CheckoutEvent, CheckoutEventType } from './checkout-events'

export const conversionEventTypes: CheckoutEventType[] = ['provider_redirect', 'stripe_session_created']

export type AnalyticsFilters = {
  query?: string
  pageId?: string
  action?: string
}

export type DailyEventPoint = {
  label: string
  dateKey: string
  total: number
  agentVisits: number
  discovery: number
  conversions: number
}

export type OfferStat = {
  name: string
  pageSlug: string
  total: number
  attempts: number
  conversions: number
}

export function filterAnalyticsEvents(events: CheckoutEvent[], filters: AnalyticsFilters) {
  const query = filters.query?.trim().toLowerCase()

  return events.filter((event) => {
    if (filters.pageId && event.page_id !== filters.pageId) return false
    if (filters.action && filters.action !== 'all' && event.event_type !== filters.action) return false

    if (!query) return true

    return [
      event.offer_name,
      event.slug,
      event.query,
      event.referrer,
      event.agent_user_agent,
      event.provider_url,
      event.checkout_url,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query))
  })
}

export function getConversionCount(events: CheckoutEvent[]) {
  return events.filter((event) => !isDryRunEvent(event) && conversionEventTypes.includes(event.event_type)).length
}

export function getCheckoutAttemptCount(events: CheckoutEvent[]) {
  return events.filter((event) => !isDryRunEvent(event) && event.event_type === 'checkout_attempt').length
}

export function getDiscoveryClickCount(events: CheckoutEvent[]) {
  return events.filter((event) => !isDryRunEvent(event) && event.event_type === 'directory_click').length
}

export function getAgentPageVisitCount(events: CheckoutEvent[]) {
  return events.filter((event) => !isDryRunEvent(event) && event.event_type === 'agent_page_view').length
}

export function isLikelyAgentUserAgent(userAgent: string | null | undefined) {
  return detectLikelyAgentUserAgent(userAgent)
}

export function getDiscoveryActionStats(events: CheckoutEvent[]) {
  const stats = new Map<string, number>()

  for (const event of events) {
    if (isDryRunEvent(event) || event.event_type !== 'directory_click') continue
    const action = typeof event.metadata?.action === 'string' ? event.metadata.action : 'unknown'
    const label = action.replace(/_/g, ' ')
    stats.set(label, (stats.get(label) ?? 0) + 1)
  }

  return [...stats.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
}

export function getDiscoverySurfaceStats(events: CheckoutEvent[]) {
  const stats = new Map<string, number>()

  for (const event of events) {
    if (isDryRunEvent(event) || event.event_type !== 'directory_click') continue
    const surface = typeof event.metadata?.surface === 'string' ? event.metadata.surface : 'directory'
    stats.set(surface, (stats.get(surface) ?? 0) + 1)
  }

  return [...stats.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
}

export function getRevenueCents(events: CheckoutEvent[]) {
  return events.reduce((sum, event) => {
    if (isDryRunEvent(event) || event.event_type !== 'stripe_session_created') return sum
    return sum + getAmountCents(event)
  }, 0)
}

// Real agent-driven revenue for share calculations (data flywheel + monetization)
export function getAgentDrivenRevenueCents(events: CheckoutEvent[]) {
  return events.reduce((sum, event) => {
    if (isDryRunEvent(event) || event.event_type !== 'stripe_session_created') return sum
    const isAgentSourced = !!event.agent_user_agent || !!event.query || (event.referrer && /agent|gpt|claude|perplexity|grok/i.test(event.referrer))
    if (!isAgentSourced) return sum
    return sum + getAmountCents(event)
  }, 0)
}

export function getPipelineCents(events: CheckoutEvent[]) {
  return events.reduce((sum, event) => {
    if (isDryRunEvent(event) || !['checkout_attempt', 'provider_redirect', 'stripe_session_created'].includes(event.event_type)) return sum
    return sum + getAmountCents(event)
  }, 0)
}

export function getDailyEventSeries(events: CheckoutEvent[], days = 10): DailyEventPoint[] {
  const now = new Date()
  const points: DailyEventPoint[] = []

  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(now)
    date.setHours(0, 0, 0, 0)
    date.setDate(now.getDate() - index)

    points.push({
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dateKey: formatLocalDateKey(date),
      total: 0,
      agentVisits: 0,
      discovery: 0,
      conversions: 0,
    })
  }

  const pointsByDate = new Map(points.map((point) => [point.dateKey, point]))

  for (const event of events) {
    const dateKey = formatLocalDateKey(new Date(event.created_at))
    const point = pointsByDate.get(dateKey)

    if (!point) continue

    point.total += 1
    if (!isDryRunEvent(event) && event.event_type === 'agent_page_view') {
      point.agentVisits += 1
    }
    if (!isDryRunEvent(event) && event.event_type === 'directory_click') {
      point.discovery += 1
    }
    if (!isDryRunEvent(event) && conversionEventTypes.includes(event.event_type)) {
      point.conversions += 1
    }
  }

  return points
}

function formatLocalDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getTopOfferStats(events: CheckoutEvent[]) {
  const stats = new Map<string, OfferStat>()
  const offerActivityTypes: CheckoutEventType[] = [
    'checkout_view',
    'checkout_attempt',
    'provider_redirect',
    'stripe_session_created',
    'stripe_missing_config',
    'stripe_error',
  ]

  for (const event of events) {
    if (!offerActivityTypes.includes(event.event_type) || event.offer_key === 'page') continue
    const key = `${event.slug}:${event.offer_key}`
    const current =
      stats.get(key) ??
      ({
        name: event.offer_name,
        pageSlug: event.slug,
        total: 0,
        attempts: 0,
        conversions: 0,
      } satisfies OfferStat)

    current.total += 1

    if (!isDryRunEvent(event) && event.event_type === 'checkout_attempt') {
      current.attempts += 1
    }

    if (!isDryRunEvent(event) && conversionEventTypes.includes(event.event_type)) {
      current.conversions += 1
    }

    stats.set(key, current)
  }

  return [...stats.values()].sort((a, b) => b.total - a.total || b.conversions - a.conversions)
}

export function getPageOptions(pages: AgentPage[]) {
  return pages.map((page) => ({
    id: page.id,
    label: page.name,
    slug: page.slug,
  }))
}

export function getAgentName(userAgent: string | null) {
  if (!userAgent) return 'Unknown agent'

  const normalized = userAgent.toLowerCase()

  if (normalized.includes('chatgpt') || normalized.includes('openai')) return 'ChatGPT-Agent'
  if (normalized.includes('claude') || normalized.includes('anthropic')) return 'Claude-Agent'
  if (normalized.includes('perplexity')) return 'PerplexityBot'
  if (normalized.includes('grok') || normalized.includes('xai')) return 'Grok-Agent'
  if (normalized.includes('bot') || normalized.includes('crawler') || normalized.includes('spider')) return 'Generic Agent'

  return userAgent.length > 72 ? `${userAgent.slice(0, 69)}...` : userAgent
}

export function getSignalLabel(event: CheckoutEvent) {
  if (isDryRunEvent(event)) return 'Simulation'
  if (conversionEventTypes.includes(event.event_type)) return 'Conversion'
  if (event.event_type === 'checkout_attempt') return 'Intent'
  if (event.event_type === 'checkout_view') return 'Visit'
  if (event.event_type === 'agent_page_view') return 'Agent visit'
  if (event.event_type === 'stripe_error') return 'Payment issue'
  if (event.event_type === 'stripe_price_sync') return 'Price sync'
  if (event.event_type === 'directory_click') return 'Discovery'
  if (event.event_type === 'ab_impression') return 'A/B impression'
  return 'Config'
}

export function formatEventDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'Recently'

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function getAmountCents(event: CheckoutEvent) {
  const amount = event.metadata?.amount_cents

  if (typeof amount === 'number' && Number.isFinite(amount)) return amount
  if (typeof amount === 'string') {
    const parsed = Number(amount)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

export function isDryRunEvent(event: CheckoutEvent) {
  return event.metadata?.dry_run === true
}

export function buildAnalyticsCsv(events: CheckoutEvent[]) {
  const rows = [
    [
      'created_at',
      'page_slug',
      'offer_name',
      'offer_kind',
      'event_type',
      'signal',
      'agent',
      'query',
      'checkout_url',
      'provider_url',
      'amount_cents',
    ],
    ...events.map((event) => [
      event.created_at,
      event.slug,
      event.offer_name,
      event.offer_kind,
      event.event_type,
      getSignalLabel(event),
      getAgentName(event.agent_user_agent),
      event.query ?? '',
      event.checkout_url ?? '',
      event.provider_url ?? '',
      String(getAmountCents(event)),
    ]),
  ]

  return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')
}

function escapeCsvValue(value: string) {
  if (!/[",\n\r]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

/**
 * Readiness "ROI proof" insight: average readiness across all owned pages vs.
 * the subset that agents are actually engaging with (events or AI visits).
 * A positive lift is a strong signal that better-built pages get more traffic.
 */
export function getReadinessInsight(
  pages: AgentPage[],
  events: Array<{ slug: string }>,
  visits: Array<{ slug: string; is_ai_agent: boolean }>,
): { avgAll: number; avgActive: number; activeCount: number; lift: number } {
  const activeSlugs = new Set([
    ...events.map((e) => e.slug),
    ...visits.filter((v) => v.is_ai_agent).map((v) => v.slug),
  ])
  const activePages = pages.filter((p) => activeSlugs.has(p.slug))

  const score = (p: AgentPage) =>
    getReadinessScore({
      name: p.name,
      slug: p.slug,
      description: p.description,
      website_url: p.website_url,
      cta_url: p.cta_url,
      audience: p.audience,
      location: p.location,
      contact_email: p.contact_email,
      industry: p.industry,
      products: p.products ?? [],
      services: p.services ?? [],
      faqs: p.faqs ?? [],
      is_published: p.is_published,
    })

  const avg = (list: AgentPage[]) =>
    list.length ? Math.round(list.reduce((sum, p) => sum + score(p), 0) / list.length) : 0

  const avgAll = avg(pages)
  const avgActive = avg(activePages)
  return { avgAll, avgActive, activeCount: activePages.length, lift: avgActive - avgAll }
}

/** Parse a YYYY-MM-DD string to a local-midnight Date, or null if invalid. */
export function parseYmd(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export type AnalyticsRangeInput = { range?: string; from?: string; to?: string }
export type AnalyticsRangeBounds = { cutoff: Date; until: Date | null; isCustom: boolean; preset: string }

/**
 * Resolve the analytics time window from the URL params.
 * A custom `from`/`to` range (either bound) takes precedence over the preset
 * `range` (today / 1d / 7d / 30d / all). `until` is the inclusive end-of-day for `to`.
 * Shared by the analytics page, the CSV export, and the dashboard Overview
 * "today" headline so they always agree.
 */
export function analyticsRangeBounds(input: AnalyticsRangeInput, now: Date = new Date()): AnalyticsRangeBounds {
  const fromDate = parseYmd(input.from)
  const toDate = parseYmd(input.to)
  if (fromDate || toDate) {
    let until: Date | null = null
    if (toDate) {
      until = new Date(toDate)
      until.setHours(23, 59, 59, 999)
    }
    return { cutoff: fromDate ?? new Date(0), until, isCustom: true, preset: 'custom' }
  }

  const preset = input.range || '30d'
  const day = 24 * 60 * 60 * 1000
  let cutoff = new Date(0)
  if (preset === 'today') {
    // Calendar day: midnight → now. Shared by the dashboard Overview headline and
    // the Analytics "Today" range so the two always show the same window.
    cutoff = new Date(now)
    cutoff.setHours(0, 0, 0, 0)
  } else if (preset === '1d') cutoff = new Date(now.getTime() - day)
  else if (preset === '7d') cutoff = new Date(now.getTime() - 7 * day)
  else if (preset === '30d') cutoff = new Date(now.getTime() - 30 * day)
  return { cutoff, until: null, isCustom: false, preset }
}

/**
 * analyticsHistory (Pro) gate. All-time and custom date ranges are a Pro+
 * capability; today / 1d / 7d / 30d stay free for everyone. For plans without
 * `analyticsHistory`, clamp an `all` preset or any custom from/to down to the
 * default 30-day window. Applied server-side on BOTH the analytics page and the
 * CSV export, so a hand-crafted URL (`?range=all`, `?from=2020-01-01`) can't
 * read history beyond the free window — the client teaser alone is bypassable.
 */
export function clampHistoryRange(input: AnalyticsRangeInput, fullHistory: boolean): AnalyticsRangeInput {
  if (fullHistory) return { range: input.range, from: input.from, to: input.to }
  const gated = input.range === 'all' || !!input.from || !!input.to
  if (!gated) return { range: input.range, from: input.from, to: input.to }
  return { range: '30d', from: undefined, to: undefined }
}
