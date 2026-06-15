import { describe, it, expect } from 'vitest'
import { normalizeCurrency, toStripeAmount, isZeroDecimalCurrency, formatCurrencyAmount } from '../currency'

describe('currency', () => {
  it('normalizes to a supported lowercase code, defaulting to usd', () => {
    expect(normalizeCurrency('GBP')).toBe('gbp')
    expect(normalizeCurrency(' eur ')).toBe('eur')
    expect(normalizeCurrency('xyz')).toBe('usd') // unsupported → default
    expect(normalizeCurrency(null)).toBe('usd')
    expect(normalizeCurrency('')).toBe('usd')
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

  it('formats smallest-unit amounts back to a human string', () => {
    expect(formatCurrencyAmount(5000, 'usd')).toBe('$50')
    expect(formatCurrencyAmount(1999, 'gbp')).toContain('19.99')
    // zero-decimal: the smallest unit is the whole amount
    expect(formatCurrencyAmount(1000, 'jpy')).toContain('1,000')
  })
})
