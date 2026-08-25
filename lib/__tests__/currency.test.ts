import { describe, it, expect } from 'vitest'
import { normalizeCurrency, normalizeReportingCurrency, toStripeAmount, isZeroDecimalCurrency, formatCurrencyAmount, minorToStripeAmount, toMajorAmount } from '../currency'

describe('currency', () => {
  it('normalizes to a supported lowercase code, defaulting to usd', () => {
    expect(normalizeCurrency('GBP')).toBe('gbp')
    expect(normalizeCurrency(' eur ')).toBe('eur')
    expect(normalizeCurrency('xyz')).toBe('usd') // unsupported → default
    expect(normalizeCurrency(null)).toBe('usd')
    expect(normalizeCurrency('')).toBe('usd')
  })

  it('preserves authoritative reporting currencies outside the offer picker', () => {
    expect(normalizeReportingCurrency('KRW')).toBe('krw')
    expect(normalizeReportingCurrency(' xyz ')).toBe('xyz')
    expect(normalizeReportingCurrency('US')).toBe('usd')
    expect(toMajorAmount(5000, 'krw')).toBe(5000)
    expect(formatCurrencyAmount(5000, 'krw', 'ko-KR')).toContain('5,000')
  })

  it('uses Stripe backward-compatible two-decimal representation for UGX', () => {
    expect(toStripeAmount(5, 'ugx')).toBe(500)
    expect(toMajorAmount(500, 'ugx')).toBe(5)
    expect(formatCurrencyAmount(500, 'ugx')).toContain('5')
  })

  it('multiplies normal currencies by 100 for the Stripe smallest unit', () => {
    expect(toStripeAmount(50, 'usd')).toBe(5000)
    expect(toStripeAmount(19.99, 'gbp')).toBe(1999)
    expect(toStripeAmount(100, 'eur')).toBe(10000)
  })

  it('does NOT multiply zero-decimal currencies (the 100x over-charge bug)', () => {
    expect(isZeroDecimalCurrency('jpy')).toBe(true)
    expect(toStripeAmount(1000, 'jpy')).toBe(1000) // ¥1000, not 100000
    expect(toStripeAmount(5000, 'krw')).toBe(5000)
    expect(isZeroDecimalCurrency('usd')).toBe(false)
  })

  it('guards against non-positive / non-finite amounts', () => {
    expect(toStripeAmount(0, 'usd')).toBe(0)
    expect(toStripeAmount(-5, 'usd')).toBe(0)
    expect(toStripeAmount(NaN, 'usd')).toBe(0)
  })

  it('converts stored 2-decimal minor units to the Stripe charge amount per currency', () => {
    // 2-decimal currencies: minor units already match Stripe's smallest unit (no-op).
    expect(minorToStripeAmount(90000, 'usd')).toBe(90000) // $900.00
    expect(minorToStripeAmount(1999, 'gbp')).toBe(1999) // £19.99
    // zero-decimal: a value stored as major×100 must be divided by 100 so ¥1,000
    // (stored 100000) charges ¥1,000, not ¥100,000 (the negotiation over-charge bug).
    expect(minorToStripeAmount(100000, 'jpy')).toBe(1000)
    expect(minorToStripeAmount(500000, 'krw')).toBe(5000)
    // defaults + guards
    expect(minorToStripeAmount(5000, null)).toBe(5000) // null → usd
    expect(minorToStripeAmount(0, 'jpy')).toBe(0)
    expect(minorToStripeAmount(-100, 'usd')).toBe(0)
  })

  it('formats smallest-unit amounts back to a human string', () => {
    expect(formatCurrencyAmount(5000, 'usd')).toBe('$50')
    expect(formatCurrencyAmount(1999, 'gbp')).toContain('19.99')
    // zero-decimal: the smallest unit is the whole amount
    expect(formatCurrencyAmount(1000, 'jpy')).toContain('1,000')
  })
})
