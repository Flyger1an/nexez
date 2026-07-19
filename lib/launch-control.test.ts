import { describe, expect, it } from 'vitest'
import {
  buildCertificationChecks,
  buildConfigurationChecks,
  buildOperationalChecks,
  isSettledProtocolOrder,
  isStripeCatalogSyncEvent,
  summarizeLaunchChecks,
  type LaunchConfigurationInput,
  type LaunchMetrics,
  type LaunchSourceAvailability,
} from './launch-control'

const NOW = '2026-07-15T12:00:00.000Z'

describe('Stripe catalog evidence', () => {
  it('counts default-price replacement events as catalog synchronization evidence', () => {
    expect(isStripeCatalogSyncEvent('product.updated')).toBe(true)
    expect(isStripeCatalogSyncEvent('price.created')).toBe(true)
    expect(isStripeCatalogSyncEvent('price.updated')).toBe(true)
    expect(isStripeCatalogSyncEvent('checkout.session.completed')).toBe(false)
    expect(isStripeCatalogSyncEvent(null)).toBe(false)
  })
})

describe('protocol settlement evidence', () => {
  it('requires a proven Stripe mode, protocol channel, and settled order status', () => {
    expect(isSettledProtocolOrder({ channel: 'acp', status: 'paid', stripe_livemode: false })).toBe(true)
    expect(isSettledProtocolOrder({ channel: 'ucp', status: 'refunded', stripe_livemode: true })).toBe(true)
    expect(isSettledProtocolOrder({ channel: 'ucp', status: 'pending', stripe_livemode: false })).toBe(false)
    expect(isSettledProtocolOrder({ channel: 'acp', status: 'paid', stripe_livemode: null })).toBe(false)
    expect(isSettledProtocolOrder({ channel: 'agent_checkout', status: 'paid', stripe_livemode: true })).toBe(false)
  })
})

function configuration(overrides: Partial<LaunchConfigurationInput> = {}): LaunchConfigurationInput {
  return {
    supabasePublic: true,
    supabaseAdmin: true,
    stripeMode: 'live',
    stripeWebhooks: true,
    stripeConnectWebhook: true,
    priceIdsConfigured: 3,
    priceIdsExpected: 3,
    priceIdsInvalid: 0,
    stripeCatalogVerified: true,
    stripeCatalogDetail: '3 active recurring Prices match the live Stripe key.',
    actionApprovalSecret: true,
    actionApprovalRequired: true,
    releaseCertificationSecret: true,
    cronSecret: true,
    email: true,
    observability: true,
    integrationEncryption: true,
    llm: true,
    hostsAligned: true,
    ...overrides,
  }
}

function metrics(overrides: Partial<LaunchMetrics> = {}): LaunchMetrics {
  return {
    stripeWebhookEvents: 12,
    latestStripeWebhookAt: '2026-07-15T11:30:00.000Z',
    stripePriceWebhookEvents: 1,
    stripePriceSyncEvents: 1,
    checkoutStripeErrors24h: 0,
    checkoutOrders: 2,
    directOrders: 1,
    paidOrders: 1,
    refundedOrders: 1,
    disputedOrders: 0,
    protocolOrders: 1,
    sandboxProtocolOrders: 0,
    acpProtocolOrders: 1,
    ucpProtocolOrders: 1,
    negotiations: 4,
    pendingNegotiationDecisions: 0,
    staleNegotiationDecisions: 0,
    completedNegotiations: 2,
    heldNegotiations: 0,
    paymentBackedNegotiations: 1,
    refundedNegotiations: 1,
    activeSubscriptions: 1,
    subscriptionRecords: 1,
    connectChargeReady: 1,
    connectPayoutReady: 1,
    shopifyInstalls: 1,
    shopifyPending: 0,
    shopifyStale: 0,
    shopifyErrors: 0,
    activeOutboundWebhooks: 1,
    failedOutboundWebhooks: 0,
    urgentSupportTickets: 0,
    expiredCheckoutSessions: 0,
    ...overrides,
  }
}

function sources(value = true): LaunchSourceAvailability {
  return {
    stripeWebhooks: value,
    checkoutEvents: value,
    orders: value,
    negotiations: value,
    billing: value,
    shopify: value,
    outboundWebhooks: value,
    support: value,
    checkoutSessions: value,
  }
}

describe('Launch Control configuration', () => {
  it('marks the required production configuration ready without returning secret values', () => {
    const checks = buildConfigurationChecks(configuration())
    expect(checks.filter((check) => check.required).every((check) => check.status === 'ready')).toBe(true)
    expect(JSON.stringify(checks)).not.toContain('sk_live_')
    expect(JSON.stringify(checks)).not.toContain('whsec_')
  })

  it('blocks launch when approval enforcement is optional or unsigned', () => {
    const optional = buildConfigurationChecks(configuration({ actionApprovalRequired: false }))
    const unsigned = buildConfigurationChecks(configuration({ actionApprovalSecret: false }))
    expect(optional.find((check) => check.id === 'approval-safety')?.status).toBe('blocked')
    expect(unsigned.find((check) => check.id === 'approval-safety')?.status).toBe('blocked')
  })

  it('does not claim Stripe catalog proof when only Price formats are known', () => {
    const checks = buildConfigurationChecks(configuration({
      stripeCatalogVerified: null,
      stripeCatalogDetail: 'Stripe could not be reached.',
    }))
    expect(checks.find((check) => check.id === 'stripe-catalog')?.status).toBe('attention')
  })

  it('blocks a mixed or invalid Stripe catalog', () => {
    const checks = buildConfigurationChecks(configuration({
      stripeCatalogVerified: false,
      priceIdsInvalid: 1,
      stripeCatalogDetail: 'One Price belongs to test mode.',
    }))
    expect(checks.find((check) => check.id === 'stripe-catalog')?.status).toBe('blocked')
  })
})

describe('Launch Control operations', () => {
  it('reports healthy workers and recent Stripe delivery', () => {
    const checks = buildOperationalChecks(metrics(), sources(), NOW)
    expect(checks.find((check) => check.id === 'stripe-delivery')?.status).toBe('ready')
    expect(checks.find((check) => check.id === 'negotiation-worker')?.status).toBe('ready')
    expect(checks.find((check) => check.id === 'shopify-worker')?.status).toBe('ready')
  })

  it('blocks stale worker queues and repeated checkout errors', () => {
    const checks = buildOperationalChecks(metrics({
      staleNegotiationDecisions: 1,
      shopifyErrors: 1,
      checkoutStripeErrors24h: 3,
    }), sources(), NOW)
    expect(checks.find((check) => check.id === 'negotiation-worker')?.status).toBe('blocked')
    expect(checks.find((check) => check.id === 'shopify-worker')?.status).toBe('blocked')
    expect(checks.find((check) => check.id === 'checkout-errors')?.status).toBe('blocked')
  })

  it('uses unknown instead of inventing health when a data source is unavailable', () => {
    const checks = buildOperationalChecks(metrics(), sources(false), NOW)
    expect(checks.every((check) => check.status === 'unknown')).toBe(true)
  })
})

describe('Commerce certification and summary', () => {
  it('accepts durable lifecycle evidence and configured request approval enforcement', () => {
    const configChecks = buildConfigurationChecks(configuration())
    const checks = buildCertificationChecks(metrics(), sources(), configChecks)
    expect(checks.find((check) => check.id === 'cert-direct-checkout')?.status).toBe('ready')
    expect(checks.find((check) => check.id === 'cert-refund')?.status).toBe('ready')
    expect(checks.find((check) => check.id === 'cert-approval')?.status).toBe('ready')
  })

  it('keeps missing refund and subscription evidence visible instead of declaring success', () => {
    const configChecks = buildConfigurationChecks(configuration())
    const checks = buildCertificationChecks(metrics({
      refundedOrders: 0,
      refundedNegotiations: 0,
      activeSubscriptions: 0,
      subscriptionRecords: 0,
    }), sources(), configChecks)
    expect(checks.find((check) => check.id === 'cert-refund')?.status).toBe('attention')
    expect(checks.find((check) => check.id === 'cert-subscription')?.status).toBe('attention')
  })

  it('requires both webhook delivery and a linked-offer audit for price-sync proof', () => {
    const configChecks = buildConfigurationChecks(configuration())
    const missingAudit = buildCertificationChecks(metrics({ stripePriceSyncEvents: 0 }), sources(), configChecks)
    const missingWebhook = buildCertificationChecks(metrics({ stripePriceWebhookEvents: 0 }), sources(), configChecks)
    expect(missingAudit.find((check) => check.id === 'cert-price-sync')?.status).toBe('attention')
    expect(missingWebhook.find((check) => check.id === 'cert-price-sync')?.status).toBe('attention')
  })

  it('does not treat protocol orders or unfunded negotiations as direct-commerce proof', () => {
    const configChecks = buildConfigurationChecks(configuration())
    const checks = buildCertificationChecks(metrics({
      directOrders: 0,
      protocolOrders: 1,
      completedNegotiations: 2,
      paymentBackedNegotiations: 0,
    }), sources(), configChecks)
    expect(checks.find((check) => check.id === 'cert-direct-checkout')?.status).toBe('attention')
    expect(checks.find((check) => check.id === 'cert-escrow')?.status).toBe('attention')
  })

  it('accepts a Stripe-proven sandbox order for the optional protocol lifecycle gate only', () => {
    const configChecks = buildConfigurationChecks(configuration())
    const checks = buildCertificationChecks(metrics({
      directOrders: 0,
      protocolOrders: 0,
      sandboxProtocolOrders: 1,
      acpProtocolOrders: 1,
      ucpProtocolOrders: 1,
    }), sources(), configChecks)
    expect(checks.find((check) => check.id === 'cert-protocol')?.status).toBe('ready')
    expect(checks.find((check) => check.id === 'cert-direct-checkout')?.status).toBe('attention')
  })

  it('requires proof from both protocol channels', () => {
    const configChecks = buildConfigurationChecks(configuration())
    const checks = buildCertificationChecks(metrics({
      protocolOrders: 0,
      sandboxProtocolOrders: 1,
      acpProtocolOrders: 1,
      ucpProtocolOrders: 0,
    }), sources(), configChecks)
    expect(checks.find((check) => check.id === 'cert-protocol')?.status).toBe('attention')
  })

  it('makes any required blocked check a launch blocker', () => {
    const summary = summarizeLaunchChecks([
      { id: 'one', label: 'One', detail: '', evidence: '', status: 'ready', required: true },
      { id: 'two', label: 'Two', detail: '', evidence: '', status: 'blocked', required: true },
      { id: 'three', label: 'Three', detail: '', evidence: '', status: 'unknown', required: false },
    ])
    expect(summary.status).toBe('blocked')
    expect(summary.score).toBe(50)
    expect(summary).toMatchObject({ ready: 1, blocked: 1, unknown: 1 })
  })
})
