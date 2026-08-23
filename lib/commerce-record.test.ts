import { describe, expect, it } from 'vitest'
import {
  mergeCommerceRecords,
  normalizeCheckoutCommerceRecord,
  normalizeNegotiatedCommerceRecord,
  type CheckoutCommerceSource,
  type NegotiatedCommerceSource,
} from './commerce-record'

const checkout: CheckoutCommerceSource = {
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

const negotiated: NegotiatedCommerceSource = {
  id: 'deal-1',
  offer_name: 'Strategy engagement',
  amount_cents: 12_500,
  currency: 'usd',
  status: 'agreement_proposed',
  escrow_mode: 'manual_capture_ready',
  refunded_cents: 0,
  buyer_email: 'agent@example.com',
  contact: null,
  buyer_agent: 'buyer-agent',
  stripe_payment_intent_id: null,
  stripe_livemode: null,
  created_at: '2026-08-23T10:00:00.000Z',
  updated_at: '2026-08-23T12:00:00.000Z',
}

describe('normalized commerce records', () => {
  it('keeps checkout payment and fulfillment evidence separate', () => {
    const record = normalizeCheckoutCommerceRecord(checkout, { order_id: checkout.id, status: 'in_progress' })
    expect(record).toMatchObject({
      key: 'checkout:order-1',
      rail: 'checkout',
      paymentState: { key: 'paid', label: 'Paid' },
      fulfillmentState: { key: 'in_progress', label: 'In progress' },
      amountRole: 'recorded_payment',
      amountLabel: 'Recorded payment',
      href: '/dashboard/orders/order-1',
    })
  })

  it('never promotes unfunded negotiated terms into a payment', () => {
    const record = normalizeNegotiatedCommerceRecord(negotiated)
    expect(record).toMatchObject({
      key: 'negotiated:deal-1',
      rail: 'negotiated',
      sourceStatus: { key: 'agreement_proposed', label: 'Agreement proposed' },
      paymentState: { key: 'not_recorded', label: 'No Nexez payment' },
      amountRole: 'commercial_terms',
      amountLabel: 'Agreed value',
      fulfillmentState: null,
      href: '/dashboard/negotiations#negotiation-deal-1',
    })
  })

  it('requires Stripe evidence before calling completed negotiations captured', () => {
    expect(normalizeNegotiatedCommerceRecord({ ...negotiated, status: 'complete' }).paymentState.key).toBe('not_recorded')
    expect(normalizeNegotiatedCommerceRecord({
      ...negotiated,
      status: 'complete',
      stripe_payment_intent_id: 'pi_live_1',
      stripe_livemode: true,
    }).paymentState.key).toBe('captured')
  })

  it('normalizes negotiated zero-decimal display amounts without changing checkout units', () => {
    expect(normalizeNegotiatedCommerceRecord({ ...negotiated, currency: 'jpy', amount_cents: 100_000 }).amountCents).toBe(1000)
    expect(normalizeCheckoutCommerceRecord({ ...checkout, currency: 'jpy', amount_cents: 1000 }).amountCents).toBe(1000)
  })

  it('merges rails by authoritative update time and applies a bounded limit', () => {
    const order = normalizeCheckoutCommerceRecord(checkout)
    const deal = normalizeNegotiatedCommerceRecord(negotiated)
    expect(mergeCommerceRecords([order], [deal], 1).map((record) => record.key)).toEqual(['negotiated:deal-1'])
  })
})
