import 'server-only'

import type { AnalyticsTrustSummary } from '../analytics-report'

export type AnalyticsRollupCounts = {
  events: number
  visits: number
  aiVisits: number
  humanVisits: number
  discoveryClicks: number
  checkoutAttempts: number
  checkoutHandoffs: number
  checkoutStarts: number
  paidOrders: number
  paidDirectOrders: number
  retainedDirectOrders: number
  negotiations: number
  openNegotiations: number
  completedNegotiations: number
}

export type AnalyticsDailyRollup = {
  date: string
  eventSignals: number
  visits: number
  aiVisits: number
  discoveryClicks: number
  checkoutStarts: number
  paidOrders: number
}

export type AnalyticsCurrencyRollup = {
  currency: string
  orders: number
  gmvCents: number
  refundedCents: number
  feeCents: number
}

export type OwnerAnalyticsRollup = {
  schemaVersion: 1
  counts: AnalyticsRollupCounts
  trust: {
    events: AnalyticsTrustSummary
    visits: AnalyticsTrustSummary
  }
  daily: AnalyticsDailyRollup[]
  channels: Array<{ channel: string; orders: number }>
  currencies: AnalyticsCurrencyRollup[]
  agentTypes: Array<{ agentType: string; visits: number; avgConfidence: number }>
  topPages: Array<{ pageId: string; slug: string; name: string; visits: number }>
  topOffers: Array<{
    pageId: string
    slug: string
    offerKey: string
    offerName: string
    signals: number
    attempts: number
    paidOrders: number
  }>
  topQueries: Array<{ query: string; uses: number }>
  topReferrers: Array<{ referrer: string; visits: number }>
  activePageIds: string[]
}

type SupabaseRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>
}

type RollupInput = {
  from: Date
  to?: Date | null
  pageId?: string | null
  query?: string | null
  eventType?: string | null
  traffic?: string | null
}

function count(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0
}

function trustSummary(value: unknown): AnalyticsTrustSummary {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const total = count(row.total)
  const verified = count(row.verified)
  return {
    total,
    verified,
    legacy: count(row.legacy),
    unverified: count(row.unverified),
    verifiedPercent: total ? Math.round((verified / total) * 100) : 100,
  }
}

function parseRollup(value: unknown): OwnerAnalyticsRollup | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (Number(raw.schemaVersion) !== 1 || !raw.counts || typeof raw.counts !== 'object') return null
  const counts = raw.counts as Record<string, unknown>
  const trust = raw.trust && typeof raw.trust === 'object' ? (raw.trust as Record<string, unknown>) : {}

  return {
    schemaVersion: 1,
    counts: {
      events: count(counts.events),
      visits: count(counts.visits),
      aiVisits: count(counts.aiVisits),
      humanVisits: count(counts.humanVisits),
      discoveryClicks: count(counts.discoveryClicks),
      checkoutAttempts: count(counts.checkoutAttempts),
      checkoutHandoffs: count(counts.checkoutHandoffs),
      checkoutStarts: count(counts.checkoutStarts),
      paidOrders: count(counts.paidOrders),
      paidDirectOrders: count(counts.paidDirectOrders),
      retainedDirectOrders: count(counts.retainedDirectOrders),
      negotiations: count(counts.negotiations),
      openNegotiations: count(counts.openNegotiations),
      completedNegotiations: count(counts.completedNegotiations),
    },
    trust: {
      events: trustSummary(trust.events),
      visits: trustSummary(trust.visits),
    },
    daily: Array.isArray(raw.daily)
      ? raw.daily.flatMap((item) => {
          if (!item || typeof item !== 'object') return []
          const row = item as Record<string, unknown>
          if (typeof row.date !== 'string') return []
          return [{
            date: row.date,
            eventSignals: count(row.eventSignals),
            visits: count(row.visits),
            aiVisits: count(row.aiVisits),
            discoveryClicks: count(row.discoveryClicks),
            checkoutStarts: count(row.checkoutStarts),
            paidOrders: count(row.paidOrders),
          }]
        })
      : [],
    channels: Array.isArray(raw.channels)
      ? raw.channels.flatMap((item) => {
          if (!item || typeof item !== 'object') return []
          const row = item as Record<string, unknown>
          return typeof row.channel === 'string' ? [{ channel: row.channel, orders: count(row.orders) }] : []
        })
      : [],
    currencies: Array.isArray(raw.currencies)
      ? raw.currencies.flatMap((item) => {
          if (!item || typeof item !== 'object') return []
          const row = item as Record<string, unknown>
          return typeof row.currency === 'string'
            ? [{
                currency: row.currency,
                orders: count(row.orders),
                gmvCents: count(row.gmvCents),
                refundedCents: count(row.refundedCents),
                feeCents: count(row.feeCents),
              }]
            : []
        })
      : [],
    agentTypes: parseObjectRows(raw.agentTypes, (row) => typeof row.agentType === 'string'
      ? { agentType: row.agentType, visits: count(row.visits), avgConfidence: count(row.avgConfidence) }
      : null),
    topPages: parseObjectRows(raw.topPages, (row) =>
      typeof row.pageId === 'string' && typeof row.slug === 'string' && typeof row.name === 'string'
        ? { pageId: row.pageId, slug: row.slug, name: row.name, visits: count(row.visits) }
        : null),
    topOffers: parseObjectRows(raw.topOffers, (row) =>
      typeof row.pageId === 'string' && typeof row.slug === 'string'
        && typeof row.offerKey === 'string' && typeof row.offerName === 'string'
        ? {
            pageId: row.pageId,
            slug: row.slug,
            offerKey: row.offerKey,
            offerName: row.offerName,
            signals: count(row.signals),
            attempts: count(row.attempts),
            paidOrders: count(row.paidOrders),
          }
        : null),
    topQueries: parseObjectRows(raw.topQueries, (row) =>
      typeof row.query === 'string' ? { query: row.query, uses: count(row.uses) } : null),
    topReferrers: parseObjectRows(raw.topReferrers, (row) =>
      typeof row.referrer === 'string' ? { referrer: row.referrer, visits: count(row.visits) } : null),
    activePageIds: Array.isArray(raw.activePageIds)
      ? raw.activePageIds.filter((value): value is string => typeof value === 'string')
      : [],
  }
}

function parseObjectRows<T>(value: unknown, parse: (row: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const parsed = parse(item as Record<string, unknown>)
    return parsed ? [parsed] : []
  })
}

export async function loadOwnerAnalyticsRollup(client: SupabaseRpcClient, input: RollupInput) {
  const { data, error } = await client.rpc('nz_owner_analytics_rollup', {
    p_from: input.from.toISOString(),
    p_to: input.to?.toISOString() ?? null,
    p_page_id: input.pageId || null,
    p_query: input.query?.trim() || null,
    p_event_type: input.eventType && input.eventType !== 'all' ? input.eventType : null,
    p_traffic: input.traffic || 'all',
  })

  if (error) return { data: null, error }
  const parsed = parseRollup(data)
  return parsed
    ? { data: parsed, error: null }
    : { data: null, error: new Error('Analytics rollup returned an unsupported shape.') }
}
