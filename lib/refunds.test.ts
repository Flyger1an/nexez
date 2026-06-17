import { describe, it, expect } from 'vitest'
import { planRefund, refundIdempotencyKey } from './refunds'

describe('planRefund', () => {
  it('full refund when no amount requested (fresh charge)', () => {
    const p = planRefund({ capturedAmount: 5000, alreadyRefunded: 0 })
    expect(p).toEqual({ ok: true, refundAmount: 5000, newTotal: 5000, fully: true })
  })

  it('full refund of the REMAINDER after a prior partial', () => {
    const p = planRefund({ capturedAmount: 5000, alreadyRefunded: 2000 })
    expect(p).toMatchObject({ ok: true, refundAmount: 3000, newTotal: 5000, fully: true })
  })

  it('partial refund keeps it open (not fully refunded)', () => {
    const p = planRefund({ capturedAmount: 5000, alreadyRefunded: 0, requestedAmount: 2000 })
    expect(p).toEqual({ ok: true, refundAmount: 2000, newTotal: 2000, fully: false })
  })

  it('second equal-amount partial advances the running total (distinct key input)', () => {
    const first = planRefund({ capturedAmount: 9000, alreadyRefunded: 0, requestedAmount: 3000 })
    const second = planRefund({ capturedAmount: 9000, alreadyRefunded: 3000, requestedAmount: 3000 })
    expect(first).toMatchObject({ newTotal: 3000, fully: false })
    expect(second).toMatchObject({ newTotal: 6000, fully: false })
    // Distinct cumulative totals → distinct idempotency keys (the collision fix).
    expect(refundIdempotencyKey('refund', 'n1', first.ok ? first.newTotal : 0)).not.toBe(
      refundIdempotencyKey('refund', 'n1', second.ok ? second.newTotal : 0),
    )
  })

  it('a partial that reaches the captured total is marked fully refunded', () => {
    const p = planRefund({ capturedAmount: 5000, alreadyRefunded: 4000, requestedAmount: 1000 })
    expect(p).toMatchObject({ ok: true, fully: true, newTotal: 5000 })
  })

  it('rejects a partial that exceeds the remainder', () => {
    const p = planRefund({ capturedAmount: 5000, alreadyRefunded: 4000, requestedAmount: 2000 })
    expect(p).toEqual({ ok: false, error: expect.stringContaining('exceeds'), status: 409 })
  })

  it('rejects when already fully refunded', () => {
    const p = planRefund({ capturedAmount: 5000, alreadyRefunded: 5000 })
    expect(p).toMatchObject({ ok: false, status: 409 })
  })

  it('rejects a zero / negative requested amount', () => {
    expect(planRefund({ capturedAmount: 5000, alreadyRefunded: 0, requestedAmount: 0 })).toMatchObject({ ok: false, status: 400 })
    expect(planRefund({ capturedAmount: 5000, alreadyRefunded: 0, requestedAmount: -10 })).toMatchObject({ ok: false, status: 400 })
  })

  it('rejects a non-finite requested amount', () => {
    expect(planRefund({ capturedAmount: 5000, alreadyRefunded: 0, requestedAmount: NaN })).toMatchObject({ ok: false, status: 400 })
  })

  it('rejects when there is nothing captured', () => {
    expect(planRefund({ capturedAmount: 0, alreadyRefunded: 0 })).toMatchObject({ ok: false, status: 409 })
  })

  it('floors fractional inputs to whole smallest-units', () => {
    const p = planRefund({ capturedAmount: 5000, alreadyRefunded: 0, requestedAmount: 1999.9 })
    expect(p).toMatchObject({ ok: true, refundAmount: 1999, newTotal: 1999 })
  })
})

describe('refundIdempotencyKey', () => {
  it('namespaces by prefix + id + running total', () => {
    expect(refundIdempotencyKey('refund-order', 'o1', 5000)).toBe('refund-order-o1-5000')
    expect(refundIdempotencyKey('refund', 'n1', 6000)).toBe('refund-n1-6000')
  })
})
