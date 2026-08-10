import { describe, expect, it } from 'vitest'
import { buildOperationalChecks, type LaunchMetrics, type LaunchSourceAvailability } from '../launch-control'

const NOW = '2026-08-10T00:00:00.000Z'
const hoursAgo = (h: number) => new Date(Date.parse(NOW) - h * 3_600_000).toISOString()

const baseMetrics: LaunchMetrics = {
  stripeWebhookEvents: 0,
  latestStripeWebhookAt: null,
  stripeWebhookEndpointsEnabled: null,
  stripePriceWebhookEvents: 0,
  stripePriceSyncEvents: 0,
  checkoutStripeErrors24h: 0,
  checkoutOrders: 0,
  directOrders: 0,
  paidOrders: 0,
  refundedOrders: 0,
  disputedOrders: 0,
  protocolOrders: 0,
  sandboxProtocolOrders: 0,
  acpProtocolOrders: 0,
  ucpProtocolOrders: 0,
  negotiations: 0,
  pendingNegotiationDecisions: 0,
  staleNegotiationDecisions: 0,
  completedNegotiations: 0,
  heldNegotiations: 0,
  paymentBackedNegotiations: 0,
  refundedNegotiations: 0,
  activeSubscriptions: 0,
  subscriptionRecords: 0,
  connectChargeReady: 0,
  connectPayoutReady: 0,
  shopifyInstalls: 0,
  shopifyPending: 0,
  shopifyStale: 0,
  shopifyErrors: 0,
  activeOutboundWebhooks: 0,
  failedOutboundWebhooks: 0,
  urgentSupportTickets: 0,
  expiredCheckoutSessions: 0,
}

const allSources: LaunchSourceAvailability = {
  stripeWebhooks: true,
  checkoutEvents: true,
  orders: true,
  negotiations: true,
  billing: true,
  shopify: true,
  outboundWebhooks: true,
  support: true,
  checkoutSessions: true,
}

function stripeDelivery(overrides: Partial<LaunchMetrics>, sources: LaunchSourceAvailability = allSources) {
  const checks = buildOperationalChecks({ ...baseMetrics, ...overrides }, sources, NOW)
  const check = checks.find((c) => c.id === 'stripe-delivery')
  if (!check) throw new Error('stripe-delivery check missing')
  return check
}

describe('stripe-delivery launch check (idle-aware)', () => {
  it('is unknown when the ledger source is unavailable', () => {
    const check = stripeDelivery({}, { ...allSources, stripeWebhooks: false })
    expect(check.status).toBe('unknown')
  })

  it('BLOCKS when Stripe reports an endpoint disabled, regardless of ledger recency', () => {
    const fresh = stripeDelivery({
      stripeWebhookEndpointsEnabled: false,
      stripeWebhookEvents: 50,
      latestStripeWebhookAt: hoursAgo(1),
    })
    expect(fresh.status).toBe('blocked')
    expect(fresh.evidence).toMatch(/DISABLED/)
  })

  it('is ready on recent events even when endpoint status is unverifiable', () => {
    const check = stripeDelivery({
      stripeWebhookEvents: 12,
      latestStripeWebhookAt: hoursAgo(2),
      stripeWebhookEndpointsEnabled: null,
    })
    expect(check.status).toBe('ready')
  })

  it('stays ready on an IDLE ledger when Stripe verifies the endpoints enabled (the quiet-account fix)', () => {
    const check = stripeDelivery({
      stripeWebhookEvents: 71,
      latestStripeWebhookAt: hoursAgo(10 * 24), // 10 days silent - the real production incident shape
      stripeWebhookEndpointsEnabled: true,
    })
    expect(check.status).toBe('ready')
    expect(check.evidence).toMatch(/idle; endpoints verified enabled/)
  })

  it('degrades to attention when idle AND unverifiable, never to blocked', () => {
    const check = stripeDelivery({
      stripeWebhookEvents: 71,
      latestStripeWebhookAt: hoursAgo(10 * 24),
      stripeWebhookEndpointsEnabled: null,
    })
    expect(check.status).toBe('attention')
  })

  it('treats a zero-event ledger as ready when endpoints verify enabled, attention otherwise', () => {
    expect(stripeDelivery({ stripeWebhookEvents: 0, stripeWebhookEndpointsEnabled: true }).status).toBe('ready')
    expect(stripeDelivery({ stripeWebhookEvents: 0, stripeWebhookEndpointsEnabled: null }).status).toBe('attention')
  })
})
