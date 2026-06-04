import { describe, expect, it } from 'vitest'
import { parseMoney, parseMoneyCents, formatUsdCents } from '../checkout'

describe('parseMoney / parseMoneyCents', () => {
  it('parses common price strings', () => {
    expect(parseMoney('$150')).toBe(150)
    expect(parseMoney('$1,200.50')).toBe(1200.5)
    expect(parseMoney('Starting at $75/hr')).toBe(75)
    expect(parseMoney('90')).toBe(90)
  })
  it('returns null for non-numeric / empty', () => {
    expect(parseMoney('Custom quote')).toBeNull()
    expect(parseMoney('')).toBeNull()
    expect(parseMoney(null)).toBeNull()
  })
  it('converts to integer cents', () => {
    expect(parseMoneyCents('$10')).toBe(1000)
    expect(parseMoneyCents('$19.99')).toBe(1999)
    expect(parseMoneyCents('free')).toBeNull()
  })
  it('formats cents back to USD', () => {
    expect(formatUsdCents(1999)).toBe('$19.99')
    expect(formatUsdCents(1000)).toBe('$10')
  })
})
