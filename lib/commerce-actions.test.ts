import { describe, expect, it } from 'vitest'
import {
  checkoutCommerceActionRecord,
  mergeCommerceActionRecords,
  negotiatedCommerceActionRecord,
  type CommerceBuyerRequestSource,
} from './commerce-actions'

const checkout = {
  id: 'order-1',
  offer_name: 'Portrait session',
  amount_cents: 10_000,
  currency: 'usd',
  status: 'paid',
  channel: 'agent_checkout',
  refunded_cents: 0,
  buyer_email: 'buyer@example.com',
  buyer_name: 'Buyer',
  buyer_reference: null,
  buyer_agent: null,
  stripe_livemode: true,
  created_at: '2026-08-23T10:00:00.000Z',
  updated_at: '2026-08-23T11:00:00.000Z',
}

const negotiated = {
  id: 'deal-1',
  offer_name: 'Strategy engagement',
  amount_cents: 12_500,
  currency: 'usd',
  status: 'negotiation' as const,
  escrow_mode: 'manual_capture_ready',
  refunded_cents: 0,
  buyer_email: 'agent@example.com',
  contact: null,
  buyer_agent: 'buyer-agent',
  stripe_payment_intent_id: null,
  stripe_livemode: null,
  settlement_state: null,
  decision_pending: false,
  metadata: {},
  created_at: '2026-08-23T10:00:00.000Z',
  updated_at: '2026-08-23T12:00:00.000Z',
}

function request(overrides: Partial<CommerceBuyerRequestSource> = {}): CommerceBuyerRequestSource {
  return {
    id: 'request-1',
    order_kind: 'checkout',
    order_id: 'order-1',
    kind: 'refund_request',
    status: 'open',
    updated_at: '2026-08-23T13:00:00.000Z',
    ...overrides,
  }
}

describe('commerce action normalization', () => {
  it('combines evidence-backed checkout signals and prioritizes recourse over fulfillment', () => {
    const record = checkoutCommerceActionRecord(
      checkout,
      { order_id: checkout.id, status: 'not_started', updated_at: '2026-08-23T12:00:00.000Z' },
      [request()],
    )

    expect(record?.actions.map((action) => action.key)).toEqual(['refund_request', 'fulfillment'])
    expect(record?.primaryAction.label).toBe('Review refund request')
    expect(record?.record.href).toBe('/dashboard/orders/order-1')
  })

  it('never infers fulfillment work from a missing operational record', () => {
    expect(checkoutCommerceActionRecord(checkout, null, [])).toBeNull()
  })

  it('blocks fulfillment actions for disputed and staged-settlement checkout records', () => {
    const fulfillment = { order_id: checkout.id, status: 'in_progress' as const, updated_at: checkout.updated_at }
    const disputed = checkoutCommerceActionRecord({ ...checkout, status: 'disputed' }, fulfillment, [])
    const staged = checkoutCommerceActionRecord({ ...checkout, channel: 'staged_settlement' }, fulfillment, [])

    expect(disputed?.actions.map((action) => action.key)).toEqual(['payment_dispute'])
    expect(disputed?.urgent).toBe(true)
    expect(staged).toBeNull()
  })

  it('reuses the canonical negotiation queue state and keeps the native workspace link', () => {
    const record = negotiatedCommerceActionRecord(negotiated, [], Date.parse('2026-08-23T13:00:00.000Z'))
    expect(record?.primaryAction).toMatchObject({ key: 'negotiation', label: 'Review proposal', priority: 78 })
    expect(record?.record.href).toBe('/dashboard/negotiations#negotiation-deal-1')
  })

  it('can surface a buyer request even when its negotiation has no canonical owner action', () => {
    const record = negotiatedCommerceActionRecord(
      { ...negotiated, status: 'complete' },
      [request({ order_kind: 'negotiation', order_id: 'deal-1', kind: 'problem_report' })],
    )
    expect(record?.primaryAction.key).toBe('problem_report')
  })

  it('sorts urgent and high-priority records before routine work', () => {
    const fulfillment = checkoutCommerceActionRecord(
      checkout,
      { order_id: checkout.id, status: 'not_started', updated_at: checkout.updated_at },
      [],
    )
    const dispute = checkoutCommerceActionRecord({ ...checkout, id: 'order-2', status: 'disputed' }, null, [])
    expect(mergeCommerceActionRecords([fulfillment, dispute], 25).map((item) => item.key))
      .toEqual(['checkout:order-2', 'checkout:order-1'])
  })
})
