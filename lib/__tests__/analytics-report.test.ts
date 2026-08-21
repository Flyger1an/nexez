import { describe, expect, it } from 'vitest'
import type { AgentVisit } from '../agent-visits'
import type { CheckoutEvent } from '../checkout-events'
import type { DirectFinanceRow } from '../finance-analytics'
import {
  buildAnalyticsFunnel,
  formatAnalyticsRate,
  getOrderChannelBreakdown,
  summarizeAnalyticsTrust,
} from '../analytics-report'

function event(over: Partial<CheckoutEvent>): CheckoutEvent {
  return {
    id: 'event-1',
    page_id: 'page-1',
    owner_id: 'owner-1',
    slug: 'acme',
    offer_key: 'services-0',
    offer_name: 'Consulting',
    offer_kind: 'services',
    event_type: 'checkout_attempt',
    agent_user_agent: null,
    referrer: null,
    query: null,
    checkout_url: null,
    provider_url: null,
    stripe_session_id: null,
    metadata: {},
    created_at: '2026-08-21T12:00:00Z',
    ...over,
  }
}

function visit(over: Partial<AgentVisit> = {}): AgentVisit {
  return {
    id: 'visit-1',
    page_id: 'page-1',
    owner_id: 'owner-1',
    slug: 'acme',
    path: '/acme',
    referrer: null,
    query: null,
    user_agent: null,
    ip_hash: null,
    is_ai_agent: false,
    agent_type: 'Human/Unknown',
    confidence_score: 0,
    detection_signals: {},
    created_at: '2026-08-21T12:00:00Z',
    ...over,
  }
}

function order(over: Partial<DirectFinanceRow> = {}): DirectFinanceRow {
  return {
    id: 'order-1',
    status: 'paid',
    channel: 'agent_checkout',
    amount_cents: 10_000,
    refunded_cents: 0,
    currency: 'usd',
    stripe_livemode: true,
    created_at: '2026-08-21T12:05:00Z',
    ...over,
  }
}

describe('analytics trust coverage', () => {
  it('makes legacy and unverified rows visible instead of silently treating them as verified', () => {
    expect(
      summarizeAnalyticsTrust([
        event({ trust_level: 'verified_server' }),
        event({ id: 'event-2', trust_level: 'unverified_client' }),
        event({ id: 'event-3' }),
      ]),
    ).toEqual({ total: 3, verified: 1, legacy: 1, unverified: 1, verifiedPercent: 33 })
  })

  it('treats an empty dataset as fully covered, not a false quality warning', () => {
    expect(summarizeAnalyticsTrust([]).verifiedPercent).toBe(100)
  })
})

describe('canonical analytics funnel', () => {
  it('uses distinct checkout sessions and paid direct orders for a matched conversion rate', () => {
    const events = [
      event({ id: 'a1' }),
      event({ id: 'a2' }),
      event({ id: 's1', event_type: 'stripe_session_created', stripe_session_id: 'cs_1' }),
      event({ id: 's1-replay', event_type: 'stripe_session_created', stripe_session_id: 'cs_1' }),
    ]
    const result = buildAnalyticsFunnel(events, [visit(), visit({ id: 'visit-2' })], [order()])

    expect(result).toEqual({
      listingVisits: 2,
      checkoutAttempts: 2,
      checkoutStarts: 1,
      paidDirectOrders: 1,
      retainedDirectOrders: 1,
      startRate: 0.5,
      paidRate: 1,
      retentionRate: 1,
      attributionComplete: true,
    })
    expect(formatAnalyticsRate(result.paidRate)).toBe('100.0%')
  })

  it('excludes protocol orders from the hosted-checkout rate and flags unmatched paid windows', () => {
    const protocol = order({ id: 'protocol', channel: 'acp' })
    const direct = order({ id: 'direct' })
    const result = buildAnalyticsFunnel([], [], [protocol, direct])

    expect(result.paidDirectOrders).toBe(1)
    expect(result.paidRate).toBeNull()
    expect(result.attributionComplete).toBe(false)
    expect(formatAnalyticsRate(result.paidRate)).toBe('—')
  })

  it('does not count dry runs, test-mode orders, refunds, or disputes as retained payments', () => {
    const result = buildAnalyticsFunnel(
      [
        event({ id: 'dry', metadata: { dry_run: true } }),
        event({ id: 'live' }),
        event({ id: 'start', event_type: 'stripe_session_created', stripe_session_id: 'cs_live' }),
      ],
      [],
      [
        order({ id: 'paid' }),
        order({ id: 'refunded', status: 'refunded' }),
        order({ id: 'disputed', status: 'disputed' }),
        order({ id: 'test', stripe_livemode: false }),
      ],
    )

    expect(result.checkoutAttempts).toBe(1)
    expect(result.paidDirectOrders).toBe(3)
    expect(result.retainedDirectOrders).toBe(1)
    expect(result.retentionRate).toBeCloseTo(1 / 3)
  })
})

describe('order channel breakdown', () => {
  it('keeps direct, protocol, and negotiated orders separate', () => {
    expect(
      getOrderChannelBreakdown([
        order({ id: 'legacy', channel: null }),
        order({ id: 'hosted' }),
        order({ id: 'acp', channel: 'acp' }),
        order({ id: 'neg', channel: 'negotiation' }),
        order({ id: 'test', channel: 'ucp', stripe_livemode: false }),
      ]),
    ).toEqual([
      { channel: 'acp', label: 'ACP', orders: 1 },
      { channel: 'legacy_direct', label: 'Direct checkout', orders: 1 },
      { channel: 'agent_checkout', label: 'Hosted checkout', orders: 1 },
      { channel: 'negotiation', label: 'Negotiated deal', orders: 1 },
    ])
  })
})
