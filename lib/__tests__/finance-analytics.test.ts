import { describe, it, expect } from 'vitest'
import {
  rollupFinanceByCurrency,
  getDailyRevenueSeries,
  getTopOffersByRevenueCents,
  getCurrencyOptions,
} from '../finance-analytics'
import type { CheckoutEvent } from '../checkout-events'

function ev(over: Partial<CheckoutEvent> & { amount_cents?: number; currency?: string; dryRun?: boolean }): CheckoutEvent {
  const { amount_cents, currency, dryRun, ...rest } = over
  return {
    id: 'e', page_id: 'p', owner_id: 'o', slug: 'acme', offer_key: 'services-0', offer_name: 'Consult',
    offer_kind: 'services', event_type: 'stripe_session_created', agent_user_agent: null, referrer: null,
    query: null, checkout_url: null, provider_url: null, stripe_session_id: null,
    metadata: { amount_cents, currency, ...(dryRun ? { dry_run: true } : {}) },
    created_at: new Date().toISOString(),
    ...rest,
  } as CheckoutEvent
}

describe('rollupFinanceByCurrency', () => {
  it('buckets GMV / orders / commission / net / AOV by currency and never sums across them', () => {
    const events = [
      ev({ amount_cents: 5000, currency: 'usd' }),
      ev({ amount_cents: 3000, currency: 'usd' }),
      ev({ amount_cents: 10000, currency: 'gbp' }),
    ]
    const rows = rollupFinanceByCurrency(events, 10) // 10% commission
    expect(rows.map((r) => r.currency)).toEqual(['gbp', 'usd']) // sorted by GMV desc (10000 > 8000)
    const usd = rows.find((r) => r.currency === 'usd')!
    expect(usd.gmvCents).toBe(8000)
    expect(usd.orders).toBe(2)
    expect(usd.nexezFeeCents).toBe(800) // 10% of 8000
    expect(usd.netCents).toBe(7200)
    expect(usd.aovCents).toBe(4000)
    const gbp = rows.find((r) => r.currency === 'gbp')!
    expect(gbp.gmvCents).toBe(10000)
    expect(gbp.nexezFeeCents).toBe(1000)
  })

  it('excludes dry-run (simulator) events and non-revenue event types', () => {
    const events = [
      ev({ amount_cents: 5000, currency: 'usd' }),
      ev({ amount_cents: 9999, currency: 'usd', dryRun: true }),
      ev({ amount_cents: 9999, currency: 'usd', event_type: 'checkout_attempt' }),
    ]
    const rows = rollupFinanceByCurrency(events, 15)
    expect(rows).toHaveLength(1)
    expect(rows[0].gmvCents).toBe(5000)
  })

  it('treats pre-currency events (no currency) as usd, zero-decimal kept as-is', () => {
    const rows = rollupFinanceByCurrency([ev({ amount_cents: 1000, currency: 'jpy' }), ev({ amount_cents: 5000 })], 6)
    expect(rows.find((r) => r.currency === 'jpy')!.gmvCents).toBe(1000)
    expect(rows.find((r) => r.currency === 'usd')!.gmvCents).toBe(5000)
  })
})

describe('getTopOffersByRevenueCents', () => {
  it('ranks offers by GMV, optionally scoped to one currency, skipping the page key', () => {
    const events = [
      ev({ amount_cents: 5000, currency: 'usd', offer_key: 'services-0', offer_name: 'Consult' }),
      ev({ amount_cents: 9000, currency: 'usd', offer_key: 'products-0', offer_name: 'Kit' }),
      ev({ amount_cents: 9999, currency: 'usd', offer_key: 'page' }),
      ev({ amount_cents: 7000, currency: 'gbp', offer_key: 'services-0', offer_name: 'Consult' }),
    ]
    const usd = getTopOffersByRevenueCents(events, 'usd')
    expect(usd.map((o) => o.offerKey)).toEqual(['products-0', 'services-0'])
    expect(usd[0].revenueCents).toBe(9000)
    expect(usd.some((o) => o.offerKey === 'page')).toBe(false)
  })
})

describe('getDailyRevenueSeries + getCurrencyOptions', () => {
  it('produces a dated GMV series with the requested number of points', () => {
    const series = getDailyRevenueSeries([ev({ amount_cents: 5000, currency: 'usd' })], 7)
    expect(series).toHaveLength(7)
    expect(series[series.length - 1].revenueCents).toBe(5000) // today's bucket
  })

  it('lists currencies dominant-first', () => {
    const events = [ev({ amount_cents: 1000, currency: 'usd' }), ev({ amount_cents: 9000, currency: 'gbp' })]
    expect(getCurrencyOptions(events)).toEqual(['gbp', 'usd'])
  })
})
