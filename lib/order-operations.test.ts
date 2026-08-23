import { describe, expect, it } from 'vitest'
import {
  describeOrderActivity,
  fulfillmentCapability,
  fulfillmentDescription,
  refundCapability,
  refundConsequence,
} from './order-operations'

describe('order operations', () => {
  it('keeps unknown historical fulfillment explicit', () => {
    expect(fulfillmentDescription(null)).toMatch(/predates fulfillment tracking/i)
  })

  it('blocks fulfillment for reversed payments and commitment stages', () => {
    expect(fulfillmentCapability({ paymentStatus: 'refunded' }).enabled).toBe(false)
    expect(fulfillmentCapability({ paymentStatus: 'disputed' }).enabled).toBe(false)
    expect(fulfillmentCapability({ paymentStatus: 'paid', stagedObligationKind: 'commitment' })).toMatchObject({ enabled: false })
    expect(fulfillmentCapability({ paymentStatus: 'paid', stagedObligationKind: 'milestone' })).toEqual({ enabled: true, reason: null })
  })

  it('calculates the exact refundable remainder', () => {
    expect(refundCapability({ paymentStatus: 'paid', paymentIntentId: 'pi_1', amountCents: 10_000, refundedCents: 2_500 })).toEqual({
      enabled: true,
      remainingCents: 7_500,
      reason: null,
    })
    expect(refundCapability({ paymentStatus: 'refunded', paymentIntentId: 'pi_1', amountCents: 10_000, refundedCents: 10_000 })).toMatchObject({ enabled: false, remainingCents: 0 })
  })

  it('describes channel-specific refund consequences without implying cancellation', () => {
    expect(refundConsequence('recurring_service')).toMatch(/does not cancel future subscription periods/i)
    expect(refundConsequence('reservable_resource')).toMatch(/does not release or restock/i)
    expect(refundConsequence('staged_settlement')).toMatch(/only this paid stage/i)
  })

  it('presents only durable event metadata', () => {
    expect(describeOrderActivity({
      event_type: 'refund_recorded',
      source: 'stripe',
      metadata: { refundedCents: 2_500 },
      created_at: '2026-08-23T12:00:00.000Z',
    }, 'usd')).toMatchObject({ title: 'Refund recorded', detail: '$25 refunded in total.', tone: 'attention' })
  })
})
