import { describe, expect, it } from 'vitest'
import {
  buildInternationalOperationsSummary,
  displayCurrencyCode,
  formatDisplayDate,
  formatDisplayDateTime,
  resolveDisplayLocale,
} from '../international-operations'

describe('international operations', () => {
  it('resolves the highest-priority valid display locale without changing business state', () => {
    expect(resolveDisplayLocale('fr-CA,fr;q=0.9,en;q=0.8')).toBe('fr-CA')
    expect(resolveDisplayLocale('garbage_locale, de-DE;q=0.8')).toBe('de-DE')
    expect(resolveDisplayLocale('*')).toBe('en-US')
  })

  it('formats reporting dates deterministically in UTC using the display locale', () => {
    const value = '2026-08-25T23:30:00.000-05:00'
    expect(formatDisplayDate(value, 'en-US')).toBe('Aug 26, 2026')
    expect(formatDisplayDate(value, 'en-GB')).toBe('26 Aug 2026')
    expect(formatDisplayDateTime(value, 'en-US')).toContain('UTC')
  })

  it('keeps settlement currencies separate and flags only potential Stripe payout conversion', () => {
    const summary = buildInternationalOperationsSummary({
      settlementCurrencies: ['USD', 'gbp', 'usd'],
      accountCountry: 'GB',
      defaultPayoutCurrency: 'gbp',
      locale: 'en-GB',
    })
    expect(summary).toMatchObject({
      settlementCurrencies: ['usd', 'gbp'],
      multiCurrency: true,
      accountCountryCode: 'GB',
      accountCountryLabel: 'United Kingdom',
      defaultPayoutCurrency: 'gbp',
      hasPotentialPayoutConversion: true,
      conversionMode: 'not_performed',
      taxMode: 'not_calculated',
    })
  })

  it('preserves a valid recorded currency even when the offer editor does not list it', () => {
    const summary = buildInternationalOperationsSummary({
      settlementCurrencies: ['krw'],
      defaultPayoutCurrency: 'krw',
    })
    expect(summary.settlementCurrencies).toEqual(['krw'])
    expect(summary.hasPotentialPayoutConversion).toBe(false)
    expect(displayCurrencyCode('krw')).toBe('KRW')
  })
})
