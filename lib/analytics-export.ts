import type { AgentVisit } from './agent-visits'
import { escapeAnalyticsCsvValue, getAgentName, getSignalLabel } from './analytics'
import { canonicalOrderChannel, getAnalyticsChannelLabel } from './analytics-report'
import type { CheckoutEvent } from './checkout-events'
import type { DirectFinanceRow } from './finance-analytics'

const HEADERS = [
  'record_type',
  'created_at',
  'page_slug',
  'offer_name',
  'action',
  'trust_level',
  'ingestion_source',
  'agent',
  'query_or_referrer',
  'order_channel',
  'currency',
  'amount_minor',
]

export function buildComprehensiveAnalyticsCsv(input: {
  events: CheckoutEvent[]
  visits: AgentVisit[]
  orders: DirectFinanceRow[]
}) {
  const rows: string[][] = [HEADERS]

  for (const event of input.events) {
    rows.push([
      'activity_event',
      event.created_at,
      event.slug,
      event.offer_name,
      getSignalLabel(event),
      event.trust_level ?? 'legacy_unverified',
      event.ingestion_source ?? 'legacy',
      getAgentName(event.agent_user_agent),
      event.query || event.referrer || '',
      '',
      String(event.metadata?.currency || '').toLowerCase(),
      String(event.metadata?.amount_cents || ''),
    ])
  }

  for (const visit of input.visits) {
    rows.push([
      'traffic_visit',
      visit.created_at,
      visit.slug,
      '',
      visit.is_ai_agent ? 'AI agent visit' : 'Human/unknown visit',
      visit.trust_level ?? 'legacy_unverified',
      visit.ingestion_source ?? 'legacy',
      visit.is_ai_agent ? visit.agent_type : 'Human/Unknown',
      visit.query || visit.referrer || '',
      '',
      '',
      '',
    ])
  }

  for (const order of input.orders) {
    const channel = canonicalOrderChannel(order)
    rows.push([
      'paid_order',
      order.created_at,
      order.slug || '',
      order.offer_name || order.offer_key || '',
      order.status,
      'verified_payment',
      'stripe_webhook',
      order.buyer_agent || '',
      order.buyer_reference || '',
      getAnalyticsChannelLabel(channel),
      String(order.currency || 'usd').toLowerCase(),
      String(order.amount_cents),
    ])
  }

  return rows.map((row) => row.map(escapeAnalyticsCsvValue).join(',')).join('\n')
}
