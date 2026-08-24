import { describe, expect, it } from 'vitest'
import {
  buildCommercialCommandCenter,
  commercialSnapshotCsv,
} from '../commercial-command-center'
import type { FinanceRollup } from '../finance-report'
import type { NegotiationRollup } from '../negotiation-report'
import type { OwnerAnalyticsRollup } from '../server/analytics-rollup'
import type { CommercialCommerceInput } from '../commercial-command-center'

function analytics(overrides: Partial<OwnerAnalyticsRollup['counts']> = {}): OwnerAnalyticsRollup {
  return {
    schemaVersion: 1,
    counts: {
      events: 20,
      visits: 15,
      aiVisits: 10,
      humanVisits: 5,
      discoveryClicks: 6,
      checkoutAttempts: 5,
      checkoutHandoffs: 4,
      checkoutStarts: 4,
      paidOrders: 3,
      paidDirectOrders: 2,
      retainedDirectOrders: 2,
      negotiations: 1,
      openNegotiations: 1,
      completedNegotiations: 0,
      ...overrides,
    },
    trust: {
      events: { total: 20, verified: 20, legacy: 0, unverified: 0, verifiedPercent: 100 },
      visits: { total: 15, verified: 15, legacy: 0, unverified: 0, verifiedPercent: 100 },
    },
    daily: [],
    channels: [],
    currencies: [],
    agentTypes: [],
    topPages: [],
    topOffers: [],
    topQueries: [],
    topReferrers: [],
    activePageIds: [],
  }
}

function negotiations(overrides: Partial<NegotiationRollup['counts']> = {}): NegotiationRollup {
  return {
    schemaVersion: 1,
    counts: {
      total: 12,
      negotiation: 3,
      agreement_proposed: 2,
      paused: 0,
      open: 5,
      proposed: 2,
      held: 1,
      complete: 3,
      declined: 1,
      expired: 1,
      refunded: 0,
      disputed: 1,
      decisionPending: 0,
      needsAction: 4,
      waiting: 2,
      staleOpen: 1,
      ...overrides,
    },
    backlog: { pending: 0, oldestPendingAt: null },
    latency: { samples: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 },
    currencies: [],
    decisions: [],
    daily: [],
    topOffers: [],
  }
}

function finance(): FinanceRollup {
  return {
    schemaVersion: 1,
    currencies: [
      { currency: 'usd', transactions: 3, grossCents: 10_000, retainedGrossCents: 9_000, refundedCents: 1_000, disputeCents: 0, outflowCents: 1_000, feeCents: 900, netCents: 8_100, aovCents: 3_333, partialRefunds: 1, snapshotTransactions: 3, estimatedTransactions: 0 },
      { currency: 'eur', transactions: 2, grossCents: 9_000, retainedGrossCents: 9_000, refundedCents: 0, disputeCents: 0, outflowCents: 0, feeCents: 900, netCents: 8_100, aovCents: 4_500, partialRefunds: 0, snapshotTransactions: 2, estimatedTransactions: 0 },
    ],
    channels: [],
    daily: [],
    topOffers: [],
    escrow: [],
    negotiatedWindow: [
      { currency: 'eur', deals: 1, fundedCents: 5_000, heldCents: 0, capturedCents: 5_000, outflowCents: 0, netCents: 4_500 },
    ],
    operations: { openRequests: 2, disputedOrders: 1, disputedNegotiations: 1, heldNegotiations: 1, staleHeldNegotiations: 1, estimatedEconomics: 3 },
  }
}

function commerce(overrides: Partial<CommercialCommerceInput> = {}): CommercialCommerceInput {
  return {
    records: [
      {
        id: 'checkout:order-1',
        href: '/dashboard/orders/order-1',
        railLabel: 'Checkout order',
        offerName: 'Launch package',
        actionLabel: 'Manage order',
        actions: [
          { key: 'payment_dispute', priority: 100, urgent: true },
          { key: 'problem_report', priority: 92, urgent: false },
        ],
      },
      {
        id: 'negotiated:deal-1',
        href: '/dashboard/negotiations#negotiation-deal-1',
        railLabel: 'Negotiated commerce',
        offerName: 'Custom engagement',
        actionLabel: 'Open negotiation',
        actions: [
          { key: 'negotiation', priority: 80, urgent: false },
          { key: 'problem_report', priority: 90, urgent: false },
        ],
      },
    ],
    urgentCount: 1,
    isTruncated: false,
    complete: true,
    ...overrides,
  }
}

describe('commercial command center', () => {
  it('combines direct and negotiated settlement only within each currency', () => {
    const result = buildCommercialCommandCenter({ analytics: analytics(), negotiations: negotiations(), finance: finance() })

    expect(result.primaryMoney).toEqual({
      currency: 'eur',
      grossCents: 14_000,
      netCents: 12_600,
      directTransactions: 2,
      negotiatedDeals: 1,
    })
    expect(result.money.find((row) => row.currency === 'usd')?.grossCents).toBe(10_000)
    expect(result.money).toHaveLength(2)
  })

  it('prioritizes urgent money exceptions while keeping overlapping categories separate', () => {
    const result = buildCommercialCommandCenter({
      analytics: analytics(),
      negotiations: negotiations(),
      finance: finance(),
      readinessAlerts: 2,
    })

    expect(result.status).toBe('critical')
    expect(result.actions.map((action) => action.id)).toEqual([
      'disputes',
      'buyer_requests',
      'stale_holds',
      'negotiations',
      'estimated_economics',
      'readiness',
    ])
    expect(result.actions.find((action) => action.id === 'negotiations')?.count).toBe(4)
    expect(result.actions.find((action) => action.id === 'disputes')?.count).toBe(2)
  })

  it('uses the canonical commerce queue instead of duplicating legacy operational counts', () => {
    const result = buildCommercialCommandCenter({
      analytics: analytics(),
      negotiations: negotiations(),
      finance: finance(),
      commerce: commerce(),
    })

    expect(result.status).toBe('critical')
    expect(result.commerce).toEqual({
      visibleActions: 2,
      urgentActions: 1,
      isTruncated: false,
      complete: true,
    })
    expect(result.actions.map((action) => action.id)).toEqual([
      'commerce_payment_dispute',
      'commerce_problem_report',
      'commerce_negotiation',
      'estimated_economics',
    ])
    expect(result.actions.find((action) => action.id === 'commerce_problem_report')?.count).toBe(2)
    expect(result.actions.find((action) => action.id === 'commerce_payment_dispute')?.href).toBe('/dashboard/orders/order-1')
    expect(result.actions.some((action) => action.id === 'disputes')).toBe(false)
    expect(result.actions.some((action) => action.id === 'buyer_requests')).toBe(false)
  })

  it('marks a partial commerce source incomplete while preserving surfaced evidence', () => {
    const result = buildCommercialCommandCenter({
      analytics: analytics(),
      negotiations: negotiations({ needsAction: 0, disputed: 0 }),
      finance: { ...finance(), operations: { openRequests: 0, disputedOrders: 0, disputedNegotiations: 0, heldNegotiations: 0, staleHeldNegotiations: 0, estimatedEconomics: 0 } },
      commerce: commerce({ records: [], urgentCount: 0, isTruncated: true, complete: false }),
    })

    expect(result.availability.commerce).toBe(true)
    expect(result.commerce.visibleActions).toBe(0)
    expect(result.commerce.isTruncated).toBe(true)
    expect(result.status).toBe('incomplete')
  })

  it('does not claim an all-clear when a bounded queue may hide more records', () => {
    const result = buildCommercialCommandCenter({
      analytics: analytics(),
      negotiations: negotiations({ needsAction: 0, disputed: 0 }),
      finance: { ...finance(), operations: { openRequests: 0, disputedOrders: 0, disputedNegotiations: 0, heldNegotiations: 0, staleHeldNegotiations: 0, estimatedEconomics: 0 } },
      commerce: commerce({ records: [], urgentCount: 0, isTruncated: true, complete: true }),
    })

    expect(result.status).toBe('incomplete')
    expect(result.commerce.isTruncated).toBe(true)
  })

  it('does not claim a checkout conversion rate when attribution is inconsistent', () => {
    const result = buildCommercialCommandCenter({
      analytics: analytics({ checkoutStarts: 2, paidDirectOrders: 3 }),
    })

    expect(result.demand.checkoutToPaidRate).toBeNull()
    expect(result.availability).toEqual({ analytics: true, negotiations: false, finance: false, commerce: false })
    expect(result.status).toBe('incomplete')
  })

  it('exports an auditable, currency-separated CSV snapshot', () => {
    const result = buildCommercialCommandCenter({ analytics: analytics(), negotiations: negotiations(), finance: finance() })
    const csv = commercialSnapshotCsv(result)

    expect(csv).toContain('money_30d,gross,14000,eur_minor_units')
    expect(csv).toContain('availability,finance,1,boolean')
    expect(csv).toContain('availability,commerce,0,boolean')
    expect(csv).toContain('commerce_current,visible_actions,0,records')
    expect(csv).toContain('money_30d,gross,10000,usd_minor_units')
    expect(csv).toContain('action_queue,disputes,2,critical')
    expect(csv).not.toContain('24000')
  })

  it('returns a truthful all-clear state when reports contain no exceptions', () => {
    const emptyFinance = finance()
    emptyFinance.operations = { openRequests: 0, disputedOrders: 0, disputedNegotiations: 0, heldNegotiations: 0, staleHeldNegotiations: 0, estimatedEconomics: 0 }
    const result = buildCommercialCommandCenter({
      analytics: analytics(),
      negotiations: negotiations({ needsAction: 0, waiting: 0, staleOpen: 0, disputed: 0 }),
      finance: emptyFinance,
    })

    expect(result.status).toBe('ready')
    expect(result.actions).toEqual([])
  })
})
