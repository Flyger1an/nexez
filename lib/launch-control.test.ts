import { describe, expect, it } from 'vitest'
import {
  buildCertificationChecks,
  buildConfigurationChecks,
  buildMarketplaceCurationCheck,
  buildOperationalChecks,
  deriveAdvancedCommerceEvidence,
  isSettledProtocolOrder,
  isStripeCatalogSyncEvent,
  summarizeLaunchChecks,
  type LaunchConfigurationInput,
  type LaunchMetrics,
  type LaunchSourceAvailability,
  type AdvancedCommerceOrderEvidence,
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
    stripeWebhookEndpointsEnabled: null,
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
    resourcePoolsConfigured: 1,
    resourceHoldsOpen: 0,
    resourceHoldsExpired: 1,
    resourceHoldsFailed: 0,
    resourceHoldsCancelled: 0,
    resourceSettlements: 1,
    stagedSettlementAgreements: 1,
    stagedSettlementAgreementsOpen: 0,
    stagedSettlementObligationsPaid: 2,
    stagedSettlementSettlements: 1,
    stagedSettlementFailures: 0,
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
    resourcePools: value,
    resourceHolds: value,
    resourceReservations: value,
    stagedSettlementAgreements: value,
    stagedSettlementObligations: value,
  }
}

function evidenceOrder(overrides: Partial<AdvancedCommerceOrderEvidence> = {}): AdvancedCommerceOrderEvidence {
  return {
    id: 'order-1',
    status: 'paid',
    channel: 'agent_checkout',
    stripe_livemode: true,
    resource_hold_id: null,
    staged_settlement_agreement_id: null,
    staged_settlement_obligation_id: null,
    ...overrides,
  }
}

describe('advanced commerce evidence', () => {
  it('proves a resource settlement only through an exact live order, committed hold, and reservation chain', () => {
    const result = deriveAdvancedCommerceEvidence({
      orders: [evidenceOrder({
        id: 'resource-order',
        channel: 'reservable_resource',
        resource_hold_id: 'hold-1',
      })],
      resourcePools: [{ id: 'pool-1', status: 'active' }, { id: 'pool-2', status: 'paused' }],
      resourceHolds: [
        { id: 'hold-1', status: 'committed' },
        { id: 'hold-2', status: 'active' },
        { id: 'hold-3', status: 'payment_pending' },
        { id: 'hold-4', status: 'expired' },
        { id: 'hold-5', status: 'failed' },
        { id: 'hold-6', status: 'cancelled' },
      ],
      resourceReservations: [{
        id: 'reservation-1',
        hold_id: 'hold-1',
        status: 'committed',
        checkout_order_id: 'resource-order',
      }],
      stagedSettlementAgreements: [],
      stagedSettlementObligations: [],
    })

    expect(result).toMatchObject({
      resourcePoolsConfigured: 1,
      resourceHoldsOpen: 2,
      resourceHoldsExpired: 1,
      resourceHoldsFailed: 1,
      resourceHoldsCancelled: 1,
      resourceSettlements: 1,
    })
  })

  it('rejects resource proof when any authority link or Stripe mode disagrees', () => {
    const base = {
      resourcePools: [{ id: 'pool-1', status: 'active' }],
      resourceHolds: [{ id: 'hold-1', status: 'committed' }],
      resourceReservations: [{
        id: 'reservation-1',
        hold_id: 'hold-1',
        status: 'committed',
        checkout_order_id: 'resource-order',
      }],
      stagedSettlementAgreements: [],
      stagedSettlementObligations: [],
    }
    const sandbox = deriveAdvancedCommerceEvidence({
      ...base,
      orders: [evidenceOrder({
        id: 'resource-order',
        channel: 'reservable_resource',
        stripe_livemode: false,
        resource_hold_id: 'hold-1',
      })],
    })
    const mismatched = deriveAdvancedCommerceEvidence({
      ...base,
      orders: [evidenceOrder({
        id: 'different-order',
        channel: 'reservable_resource',
        resource_hold_id: 'hold-1',
      })],
    })

    expect(sandbox.resourceSettlements).toBe(0)
    expect(mismatched.resourceSettlements).toBe(0)
  })

  it('proves a staged settlement only when every obligation is live-paid and linked', () => {
    const result = deriveAdvancedCommerceEvidence({
      orders: [
        evidenceOrder({
          id: 'stage-order-1',
          channel: 'staged_settlement',
          staged_settlement_agreement_id: 'agreement-1',
          staged_settlement_obligation_id: 'obligation-1',
        }),
        evidenceOrder({
          id: 'stage-order-2',
          channel: 'staged_settlement',
          staged_settlement_agreement_id: 'agreement-1',
          staged_settlement_obligation_id: 'obligation-2',
        }),
      ],
      resourcePools: [],
      resourceHolds: [],
      resourceReservations: [],
      stagedSettlementAgreements: [
        { id: 'agreement-1', status: 'complete' },
        { id: 'agreement-2', status: 'active' },
        { id: 'agreement-3', status: 'disputed' },
      ],
      stagedSettlementObligations: [
        { id: 'obligation-1', agreement_id: 'agreement-1', status: 'paid', stripe_livemode: true },
        { id: 'obligation-2', agreement_id: 'agreement-1', status: 'paid', stripe_livemode: true },
        { id: 'obligation-3', agreement_id: 'agreement-2', status: 'ready_for_buyer_approval', stripe_livemode: null },
      ],
    })

    expect(result).toMatchObject({
      stagedSettlementAgreements: 3,
      stagedSettlementAgreementsOpen: 1,
      stagedSettlementObligationsPaid: 2,
      stagedSettlementSettlements: 1,
      stagedSettlementFailures: 1,
    })
  })

  it('does not promote a partial, sandbox, or incompletely linked staged agreement', () => {
    const result = deriveAdvancedCommerceEvidence({
      orders: [evidenceOrder({
        id: 'stage-order-1',
        channel: 'staged_settlement',
        staged_settlement_agreement_id: 'agreement-1',
        staged_settlement_obligation_id: 'obligation-1',
      })],
      resourcePools: [],
      resourceHolds: [],
      resourceReservations: [],
      stagedSettlementAgreements: [{ id: 'agreement-1', status: 'complete' }],
      stagedSettlementObligations: [
        { id: 'obligation-1', agreement_id: 'agreement-1', status: 'paid', stripe_livemode: true },
        { id: 'obligation-2', agreement_id: 'agreement-1', status: 'paid', stripe_livemode: false },
      ],
    })

    expect(result.stagedSettlementObligationsPaid).toBe(1)
    expect(result.stagedSettlementSettlements).toBe(0)
  })
})

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

  it('makes Shopify stale and failed queue counts explicit in operator evidence', () => {
    const checks = buildOperationalChecks(metrics({
      shopifyPending: 4,
      shopifyStale: 2,
      shopifyErrors: 1,
    }), sources(), NOW)
    expect(checks.find((check) => check.id === 'shopify-worker')?.evidence)
      .toBe('1 active installs; 4 queued; 2 stale; 1 failed.')
  })

  it('uses unknown instead of inventing health when a data source is unavailable', () => {
    const checks = buildOperationalChecks(metrics(), sources(false), NOW)
    expect(checks.every((check) => check.status === 'unknown')).toBe(true)
  })

  it('tracks curated launch supply without turning the inventory target into a release blocker', () => {
    const attention = buildMarketplaceCurationCheck({
      available: true,
      summary: { total: 10, unreviewed: 5, candidate: 2, certified: 0, excluded: 3 },
    })
    const ready = buildMarketplaceCurationCheck({
      available: true,
      summary: { total: 24, unreviewed: 0, candidate: 1, certified: 20, excluded: 3 },
    })
    expect(attention).toMatchObject({ status: 'attention', required: false })
    expect(ready.status).toBe('ready')
    expect(buildMarketplaceCurationCheck({
      available: false,
      summary: { total: 0, unreviewed: 0, candidate: 0, certified: 0, excluded: 0 },
    }).status).toBe('unknown')
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

  it('keeps advanced commerce configured, open, and failed state separate from settlement proof', () => {
    const configChecks = buildConfigurationChecks(configuration())
    const checks = buildCertificationChecks(metrics({
      resourcePoolsConfigured: 2,
      resourceHoldsOpen: 1,
      resourceHoldsExpired: 3,
      resourceHoldsFailed: 1,
      resourceSettlements: 0,
      stagedSettlementAgreements: 2,
      stagedSettlementAgreementsOpen: 1,
      stagedSettlementObligationsPaid: 1,
      stagedSettlementSettlements: 0,
      stagedSettlementFailures: 1,
    }), sources(), configChecks)

    expect(checks.find((check) => check.id === 'cert-reservable-resource')).toMatchObject({
      status: 'attention',
      required: false,
    })
    expect(checks.find((check) => check.id === 'cert-reservable-resource')?.evidence)
      .toContain('0 proven settlements')
    expect(checks.find((check) => check.id === 'cert-staged-settlement')).toMatchObject({
      status: 'attention',
      required: false,
    })
    expect(checks.find((check) => check.id === 'cert-staged-settlement')?.evidence)
      .toContain('0 fully proven')
  })

  it('reports advanced commerce proof as unknown when any required evidence source is unavailable', () => {
    const configChecks = buildConfigurationChecks(configuration())
    const unavailable = sources()
    unavailable.resourceReservations = false
    unavailable.stagedSettlementObligations = false
    const checks = buildCertificationChecks(metrics(), unavailable, configChecks)

    expect(checks.find((check) => check.id === 'cert-reservable-resource')?.status).toBe('unknown')
    expect(checks.find((check) => check.id === 'cert-staged-settlement')?.status).toBe('unknown')
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
