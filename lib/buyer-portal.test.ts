import { describe, it, expect } from 'vitest'
import {
  buildOrderTimeline,
  canRequestRefund,
  describeOrderStatus,
  hasOpenRequest,
  isRefundableStatus,
  type BuyerOrderView,
} from './buyer-portal'

function view(partial: Partial<BuyerOrderView>): BuyerOrderView {
  return {
    kind: 'checkout',
    token: 't',
    reference: 'cs_1',
    offerName: 'Thing',
    amountCents: 5000,
    currency: 'usd',
    status: 'paid',
    sellerName: 'Acme',
    sellerEmail: 'acme@example.com',
    buyerEmail: 'buyer@example.com',
    slug: 'acme',
    createdAt: '2026-06-16T00:00:00.000Z',
    requests: [],
    review: null,
    canReview: true,
    ...partial,
  }
}

describe('describeOrderStatus', () => {
  it('maps known statuses to buyer copy + tone', () => {
    expect(describeOrderStatus('checkout', 'paid').tone).toBe('positive')
    expect(describeOrderStatus('checkout', 'refunded').label).toBe('Refunded')
    expect(describeOrderStatus('checkout', 'disputed').tone).toBe('warning')
    expect(describeOrderStatus('negotiation', 'held').tone).toBe('pending')
  })

  it('falls back gracefully for unknown statuses', () => {
    const d = describeOrderStatus('checkout', 'weird_state')
    expect(d.label).toBe('weird state')
    expect(d.tone).toBe('neutral')
  })

  it('does not throw on empty status', () => {
    expect(describeOrderStatus('checkout', '').label).toBe('Unknown')
  })
})

describe('isRefundableStatus / canRequestRefund', () => {
  it('treats live-payment statuses as refundable', () => {
    for (const s of ['paid', 'held', 'complete', 'disputed', 'dispute_won']) {
      expect(isRefundableStatus(s)).toBe(true)
    }
  })

  it('rejects terminal / pre-payment statuses', () => {
    for (const s of ['refunded', 'declined', 'expired', 'negotiation', '']) {
      expect(isRefundableStatus(s)).toBe(false)
    }
  })

  it('canRequestRefund reads the view status', () => {
    expect(canRequestRefund(view({ status: 'paid' }))).toBe(true)
    expect(canRequestRefund(view({ status: 'refunded' }))).toBe(false)
  })
})

describe('buildOrderTimeline', () => {
  it('marks paid orders as received + complete', () => {
    const steps = buildOrderTimeline(view({ status: 'paid' }))
    expect(steps.map((s) => s.key)).toEqual(['placed', 'paid', 'complete'])
    expect(steps[1].done).toBe(true)
  })

  it('shows an escrow hold as awaiting delivery (negotiation held)', () => {
    const steps = buildOrderTimeline(view({ kind: 'negotiation', status: 'held' }))
    expect(steps[1].current).toBe(true)
    expect(steps[2].label).toBe('Awaiting delivery')
  })

  it('shows a refunded step when refunded', () => {
    const steps = buildOrderTimeline(view({ status: 'refunded' }))
    expect(steps.some((s) => s.key === 'refunded' && s.done)).toBe(true)
  })

  it('shows a dispute step under review when disputed', () => {
    const steps = buildOrderTimeline(view({ status: 'disputed' }))
    const d = steps.find((s) => s.key === 'disputed')
    expect(d?.current).toBe(true)
    expect(d?.done).toBe(false)
  })
})

describe('hasOpenRequest', () => {
  const withReq = (status: string) =>
    view({ requests: [{ id: 'r1', kind: 'refund_request', status, message: null, createdAt: 'x' }] })

  it('is true for open / acknowledged refund requests', () => {
    expect(hasOpenRequest(withReq('open'), 'refund_request')).toBe(true)
    expect(hasOpenRequest(withReq('acknowledged'), 'refund_request')).toBe(true)
  })

  it('is false once resolved / declined', () => {
    expect(hasOpenRequest(withReq('resolved'), 'refund_request')).toBe(false)
    expect(hasOpenRequest(withReq('declined'), 'refund_request')).toBe(false)
  })

  it('is false for a different request kind', () => {
    expect(hasOpenRequest(withReq('open'), 'problem_report')).toBe(false)
  })
})
