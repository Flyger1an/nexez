import { describe, it, expect } from 'vitest'
import { emailish, negotiationDisplayCents, deriveOrderStatus, resolveSellerDisplayName } from './load-order'

describe('resolveSellerDisplayName', () => {
  it('uses the storefront name as the seller identity instead of the listing title', () => {
    expect(resolveSellerDisplayName('Acme Merchant', 'Weekend Plumbing Special')).toBe('Acme Merchant')
  })

  it('falls back to the listing title only when the storefront has no display name', () => {
    expect(resolveSellerDisplayName(null, 'Weekend Plumbing Special')).toBe('Weekend Plumbing Special')
    expect(resolveSellerDisplayName('  ', ' Weekend Plumbing Special ')).toBe('Weekend Plumbing Special')
  })

  it('does not fabricate a seller name when neither source is available', () => {
    expect(resolveSellerDisplayName(null, null)).toBeNull()
  })
})

describe('emailish', () => {
  it('passes through email-shaped contacts', () => {
    expect(emailish('buyer@example.com')).toBe('buyer@example.com')
    expect(emailish('  buyer@example.com  ')).toBe('buyer@example.com')
  })
  it('rejects non-email agent text (never email an arbitrary string)', () => {
    expect(emailish('Acme Buying Agent')).toBeNull()
    expect(emailish('call me on slack')).toBeNull()
    expect(emailish('not an email')).toBeNull()
    expect(emailish('')).toBeNull()
    expect(emailish(null)).toBeNull()
  })
})

describe('negotiationDisplayCents', () => {
  it('keeps 2-decimal currencies unchanged (50.00 USD stays 5000 minor)', () => {
    expect(negotiationDisplayCents(5000, 'usd')).toBe(5000)
  })
  it('collapses the ×100 for zero-decimal currencies (¥5,000 stored 500000 → 5000)', () => {
    expect(negotiationDisplayCents(500000, 'jpy')).toBe(5000)
    expect(negotiationDisplayCents(500000, 'krw')).toBe(5000)
  })
  it('passes through null (pre-payment negotiations)', () => {
    expect(negotiationDisplayCents(null, 'usd')).toBeNull()
  })
})

describe('deriveOrderStatus', () => {
  it('surfaces an out-of-band partial refund as partial_refund (checkout paid + negotiation complete)', () => {
    expect(deriveOrderStatus('paid', { partial_refund: { amount_cents: 100 } })).toBe('partial_refund')
    expect(deriveOrderStatus('complete', { partial_refund: { amount_cents: 100 } })).toBe('partial_refund')
  })
  it('leaves a clean order unchanged', () => {
    expect(deriveOrderStatus('paid', null)).toBe('paid')
    expect(deriveOrderStatus('paid', {})).toBe('paid')
    expect(deriveOrderStatus('complete', null)).toBe('complete')
  })
  it('never overrides a terminal / non-collected status', () => {
    expect(deriveOrderStatus('refunded', { partial_refund: { amount_cents: 1 } })).toBe('refunded')
    expect(deriveOrderStatus('disputed', { partial_refund: {} })).toBe('disputed')
    expect(deriveOrderStatus('held', { partial_refund: {} })).toBe('held')
  })
})
