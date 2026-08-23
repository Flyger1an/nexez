import { describe, expect, it } from 'vitest'
import {
  getOrderChannelLabel,
  getOrderDisplayStatus,
  getOrderEconomics,
  shortOrderReference,
} from './order-dashboard'
import type { DashboardOrder } from './server/dashboard-orders'

function order(overrides: Partial<DashboardOrder> = {}): DashboardOrder {
  return {
    id: '00000000-0000-4000-8000-123456789abc',
    owner_id: 'owner-1',
    page_id: 'page-1',
    slug: 'studio',
    offer_name: 'Portrait session',
    offer_key: 'services-1',
    amount_cents: 10_000,
    currency: 'usd',
    status: 'paid',
    channel: 'agent_checkout',
    refunded_cents: 0,
    buyer_email: 'buyer@example.com',
    buyer_name: 'Buyer',
    buyer_reference: null,
    buyer_agent: null,
    commission_bps: 900,
    commission_percent: 9,
    application_fee_cents: 900,
    plan_id_at_purchase: 'free',
    commission_source: 'plan_default',
    stripe_livemode: true,
    stripe_session_id: 'cs_live_1',
    stripe_payment_intent_id: 'pi_1',
    stripe_invoice_id: null,
    service_agreement_id: null,
    service_period_start: null,
    service_period_end: null,
    staged_settlement_agreement_id: null,
    staged_settlement_obligation_id: null,
    resource_hold_id: null,
    metadata: {},
    created_at: '2026-08-23T12:00:00.000Z',
    updated_at: '2026-08-23T12:00:00.000Z',
    ...overrides,
  }
}

describe('order dashboard presentation', () => {
  it('uses immutable fee snapshots for order economics', () => {
    expect(getOrderEconomics(order())).toEqual({
      grossCents: 10_000,
      refundedCents: 0,
      retainedFeeCents: 900,
      netCents: 9_100,
    })
  })

  it('returns fees proportionally after a partial refund', () => {
    const partial = order({ refunded_cents: 2_500 })
    expect(getOrderDisplayStatus(partial)).toBe('Partial refund')
    expect(getOrderEconomics(partial)).toEqual({
      grossCents: 10_000,
      refundedCents: 2_500,
      retainedFeeCents: 675,
      netCents: 6_825,
    })
  })

  it('treats an open dispute as a complete reversal', () => {
    expect(getOrderEconomics(order({ status: 'disputed' }))).toEqual({
      grossCents: 10_000,
      refundedCents: 10_000,
      retainedFeeCents: 0,
      netCents: 0,
    })
  })

  it('labels commerce channels and short references consistently', () => {
    expect(getOrderChannelLabel('staged_settlement')).toBe('Staged settlement')
    expect(getOrderChannelLabel('reservable_resource')).toBe('Reserved resource')
    expect(shortOrderReference(order().id)).toBe('56789ABC')
  })
})
