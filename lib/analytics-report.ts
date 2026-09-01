import type { AgentVisit } from './agent-visits'
import type { CheckoutEvent } from './checkout-events'
import type { AnalyticsTrustLevel } from './contracts/analytics'
import type { DirectFinanceRow } from './finance-analytics'

export type AnalyticsTrustSummary = {
  total: number
  verified: number
  legacy: number
  unverified: number
  verifiedPercent: number
}

export type AnalyticsFunnel = {
  listingVisits: number
  checkoutAttempts: number
  checkoutStarts: number
  paidDirectOrders: number
  retainedDirectOrders: number
  startRate: number | null
  paidRate: number | null
  retentionRate: number | null
  attributionComplete: boolean
}

export type AnalyticsChannelRow = {
  channel: string
  label: string
  orders: number
}

const DIRECT_CHANNELS = new Set(['legacy_direct', 'agent_checkout'])

function rowTrustLevel(row: { trust_level?: AnalyticsTrustLevel }): AnalyticsTrustLevel {
  return row.trust_level ?? 'legacy_unverified'
}

export function summarizeAnalyticsTrust(
  rows: Array<{ trust_level?: AnalyticsTrustLevel }>,
): AnalyticsTrustSummary {
  let verified = 0
  let legacy = 0
  let unverified = 0

  for (const row of rows) {
    const level = rowTrustLevel(row)
    if (level === 'verified_server') verified += 1
    else if (level === 'unverified_client') unverified += 1
    else legacy += 1
  }

  const total = rows.length
  return {
    total,
    verified,
    legacy,
    unverified,
    verifiedPercent: total ? Math.round((verified / total) * 100) : 100,
  }
}

export function isVerifiedAnalyticsRow(row: { trust_level?: AnalyticsTrustLevel }) {
  return rowTrustLevel(row) === 'verified_server'
}

function distinctCheckoutStarts(events: CheckoutEvent[]) {
  const starts = new Set<string>()

  for (const event of events) {
    if (event.metadata?.dry_run === true || event.event_type !== 'stripe_session_created') continue
    // Modern events carry the Stripe session id. The event id is a safe legacy
    // fallback: it never collapses two real rows just because old telemetry did
    // not yet include a session identifier.
    starts.add(event.stripe_session_id || `event:${event.id}`)
  }

  return starts.size
}

function isLiveOrder(order: DirectFinanceRow) {
  return order.stripe_livemode === true
}

export function canonicalOrderChannel(order: Pick<DirectFinanceRow, 'channel'>) {
  return order.channel || 'legacy_direct'
}

export function buildAnalyticsFunnel(
  events: CheckoutEvent[],
  visits: AgentVisit[],
  orders: DirectFinanceRow[],
): AnalyticsFunnel {
  const listingVisits = visits.length
  const checkoutAttempts = events.filter(
    (event) => event.event_type === 'checkout_attempt' && event.metadata?.dry_run !== true,
  ).length
  const checkoutStarts = distinctCheckoutStarts(events)
  const directOrders = orders.filter(
    (order) => isLiveOrder(order) && DIRECT_CHANNELS.has(canonicalOrderChannel(order)),
  )
  const paidDirectOrders = directOrders.length
  const retainedDirectOrders = directOrders.filter(
    (order) => order.status === 'paid' || order.status === 'dispute_won',
  ).length

  return {
    listingVisits,
    checkoutAttempts,
    checkoutStarts,
    paidDirectOrders,
    retainedDirectOrders,
    startRate: checkoutAttempts ? checkoutStarts / checkoutAttempts : null,
    paidRate: checkoutStarts ? paidDirectOrders / checkoutStarts : null,
    retentionRate: paidDirectOrders ? retainedDirectOrders / paidDirectOrders : null,
    // A payment can legitimately arrive just outside the selected window. Flag
    // that denominator mismatch instead of clamping a >100% result and hiding it.
    attributionComplete: paidDirectOrders <= checkoutStarts,
  }
}

const CHANNEL_LABELS: Record<string, string> = {
  legacy_direct: 'Direct checkout',
  agent_checkout: 'Hosted checkout',
  acp: 'ACP',
  ucp: 'UCP',
  negotiation: 'Negotiated deal',
  nexxi: 'Nexxi',
  recurring_service: 'Recurring service',
  staged_settlement: 'Staged settlement',
  reservable_resource: 'Reserved resource',
}

export function getAnalyticsChannelLabel(channel: string) {
  return CHANNEL_LABELS[channel] ?? channel.replace(/_/g, ' ')
}

export function getOrderChannelBreakdown(orders: DirectFinanceRow[]): AnalyticsChannelRow[] {
  const totals = new Map<string, number>()

  for (const order of orders) {
    if (!isLiveOrder(order)) continue
    const channel = canonicalOrderChannel(order)
    totals.set(channel, (totals.get(channel) ?? 0) + 1)
  }

  return [...totals.entries()]
    .map(([channel, count]) => ({
      channel,
      label: getAnalyticsChannelLabel(channel),
      orders: count,
    }))
    .sort((a, b) => b.orders - a.orders || a.label.localeCompare(b.label))
}

export function formatAnalyticsRate(rate: number | null) {
  return rate == null ? '—' : `${(rate * 100).toFixed(1)}%`
}
