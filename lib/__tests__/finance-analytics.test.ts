import { describe, it, expect } from 'vitest'
import {
  rollupFinanceByCurrency,
  getDailyRevenueSeries,
  getTopOffersByRevenueCents,
  getCurrencyOptions,
  rollupNegotiationsByCurrency,
  getReversalRate,
  buildMarketplaceLedger,
  type NegotiationFinanceRow,
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

function neg(over: Partial<NegotiationFinanceRow>): NegotiationFinanceRow {
  return { status: 'complete', amount_cents: 1000, currency: 'usd', slug: 'acme', offer_name: 'Consult', buyer_agent: 'Acme', created_at: '2026-06-10T00:00:00Z', ...over }
}

describe('rollupNegotiationsByCurrency', () => {
  it('buckets agreed/held/complete/reversed by currency and never across them', () => {
    const rows = rollupNegotiationsByCurrency([
      neg({ status: 'held', amount_cents: 5000, currency: 'usd' }),
      neg({ status: 'complete', amount_cents: 3000, currency: 'usd' }),
      neg({ status: 'refunded', amount_cents: 1000, currency: 'usd' }),
      neg({ status: 'disputed', amount_cents: 500, currency: 'usd' }),
      neg({ status: 'agreement_proposed', amount_cents: 2000, currency: 'gbp' }),
      neg({ status: 'negotiation', amount_cents: 9999, currency: 'usd' }), // not yet agreed → excluded
      neg({ status: 'complete', amount_cents: null, currency: 'usd' }), // amount-less → skipped
    ])
    const usd = rows.find((r) => r.currency === 'usd')!
    expect(usd.agreedCents).toBe(8000) // held 5000 + complete 3000
    expect(usd.deals).toBe(2)
    expect(usd.heldCents).toBe(5000)
    expect(usd.completeCents).toBe(3000)
    expect(usd.reversedCents).toBe(1500) // refunded 1000 + disputed 500
    const gbp = rows.find((r) => r.currency === 'gbp')!
    expect(gbp.agreedCents).toBe(2000)
    expect(gbp.heldCents).toBe(0)
  })
})

describe('getReversalRate', () => {
  it('is reversed / (complete + reversed), or null when there is no settled volume', () => {
    expect(getReversalRate({ completeCents: 9000, reversedCents: 1000 })).toBeCloseTo(0.1)
    expect(getReversalRate({ completeCents: 0, reversedCents: 0 })).toBeNull()
  })
})

describe('buildMarketplaceLedger', () => {
  it('interleaves direct + negotiated rows time-desc with derived fee/net and flags reversals', () => {
    const events = [
      ev({ amount_cents: 10000, currency: 'usd', offer_name: 'Kit', created_at: '2026-06-12T00:00:00Z', id: 'd1' }),
      ev({ amount_cents: 9999, currency: 'usd', dryRun: true, id: 'd2' }), // dry-run excluded
    ]
    const negs = [
      neg({ id: 'n1', status: 'complete', amount_cents: 4000, currency: 'usd', created_at: '2026-06-13T00:00:00Z', offer_name: 'Deal', buyer_agent: 'Claude' }),
      neg({ id: 'n2', status: 'refunded', amount_cents: 2000, currency: 'usd', created_at: '2026-06-11T00:00:00Z', buyer_agent: null }),
      neg({ id: 'n3', status: 'negotiation', amount_cents: 5000, currency: 'usd' }), // not a money event → excluded
    ]
    const ledger = buildMarketplaceLedger(events, negs, 10) // 10% commission
    expect(ledger.map((e) => e.id)).toEqual(['neg-n1', 'd1', 'neg-n2']) // time desc
    const direct = ledger.find((e) => e.id === 'd1')!
    expect(direct.channel).toBe('direct')
    expect(direct.feeCents).toBe(1000)
    expect(direct.netCents).toBe(9000)
    const reversal = ledger.find((e) => e.id === 'neg-n2')!
    expect(reversal.isReversal).toBe(true)
    expect(reversal.channel).toBe('negotiated')
    expect(reversal.buyerLabel).toBe('Agent') // fallback when buyer_agent unset
    expect(reversal.feeCents).toBe(0) // full refund — no fee reduction
    expect(reversal.netCents).toBe(2000) // whole amount is the outflow
  })

  it('respects the limit (most recent first)', () => {
    const events = Array.from({ length: 30 }, (_, i) =>
      ev({ amount_cents: 100, currency: 'usd', id: `e${i}`, created_at: `2026-06-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z` }),
    )
    expect(buildMarketplaceLedger(events, [], 10, 25)).toHaveLength(25)
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
