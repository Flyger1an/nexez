import { AgentPage } from './agent-page'
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
  return events.filter((event) => conversionEventTypes.includes(event.event_type)).length
}

export function getCheckoutAttemptCount(events: CheckoutEvent[]) {
  return events.filter((event) => event.event_type === 'checkout_attempt').length
}

export function getRevenueCents(events: CheckoutEvent[]) {
  return events.reduce((sum, event) => {
    if (event.event_type !== 'stripe_session_created') return sum
    return sum + getAmountCents(event)
  }, 0)
}

// Tier 3: Real agent-driven revenue for share calculations (data flywheel + monetization)
export function getAgentDrivenRevenueCents(events: CheckoutEvent[]) {
  return events.reduce((sum, event) => {
    if (event.event_type !== 'stripe_session_created') return sum
    const isAgentSourced = !!event.agent_user_agent || !!event.query || (event.referrer && /agent|gpt|claude|perplexity|grok/i.test(event.referrer))
    if (!isAgentSourced) return sum
    return sum + getAmountCents(event)
  }, 0)
}

export function getPipelineCents(events: CheckoutEvent[]) {
  return events.reduce((sum, event) => {
    if (!['checkout_attempt', 'provider_redirect', 'stripe_session_created'].includes(event.event_type)) return sum
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
      dateKey: date.toISOString().slice(0, 10),
      total: 0,
      conversions: 0,
    })
  }

  const pointsByDate = new Map(points.map((point) => [point.dateKey, point]))

  for (const event of events) {
    const dateKey = new Date(event.created_at).toISOString().slice(0, 10)
    const point = pointsByDate.get(dateKey)

    if (!point) continue

    point.total += 1
    if (conversionEventTypes.includes(event.event_type)) {
      point.conversions += 1
    }
  }

  return points
}

export function getTopOfferStats(events: CheckoutEvent[]) {
  const stats = new Map<string, OfferStat>()

  for (const event of events) {
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

    if (event.event_type === 'checkout_attempt') {
      current.attempts += 1
    }

    if (conversionEventTypes.includes(event.event_type)) {
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
  if (conversionEventTypes.includes(event.event_type)) return 'Conversion'
  if (event.event_type === 'checkout_attempt') return 'Intent'
  if (event.event_type === 'checkout_view') return 'Visit'
  if (event.event_type === 'stripe_error') return 'Payment issue'
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
