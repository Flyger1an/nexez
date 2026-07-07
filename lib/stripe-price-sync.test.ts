import { describe, it, expect } from 'vitest'
import { applyPriceToOffers, formatStripePriceString } from './stripe-price-sync'
import type { OfferItem } from './agent-page'

// The formatter must stay byte-identical to /api/integrations/stripe/import -
// a webhook sync and a manual re-import producing different strings would make
// every redelivery look like a change.
describe('formatStripePriceString', () => {
  it('formats one-time amounts like the importer ($ + whole dollars)', () => {
    expect(formatStripePriceString({ unit_amount: 4000 })).toBe('$40')
    expect(formatStripePriceString({ unit_amount: 4999 })).toBe('$50') // toFixed(0) rounds
  })

  it('appends the recurring interval', () => {
    expect(formatStripePriceString({ unit_amount: 4000, recurring: { interval: 'month' } })).toBe('$40 / month')
    expect(formatStripePriceString({ unit_amount: 120000, recurring: { interval: 'year' } })).toBe('$1200 / year')
  })

  it('matches importer truthiness: null AND $0 prices read Custom, interval still appended', () => {
    expect(formatStripePriceString({ unit_amount: null })).toBe('Custom')
    expect(formatStripePriceString({ unit_amount: 0 })).toBe('Custom')
    expect(formatStripePriceString({ unit_amount: null, recurring: { interval: 'month' } })).toBe('Custom / month')
  })
})

const offer = (over: Partial<OfferItem> = {}): OfferItem => ({
  name: 'Deep Clean',
  description: 'Imported from Stripe',
  price: '$40',
  url: '',
  source: 'stripe',
  metadata: { stripe_price_id: 'price_1', stripe_product_id: 'prod_1' },
  ...over,
})
const target = (over: Record<string, unknown> = {}) =>
  ({ priceId: 'price_1', productId: 'prod_1', priceStr: '$55', ...over }) as Parameters<typeof applyPriceToOffers>[1]

describe('applyPriceToOffers', () => {
  it('updates only offers carrying the matching stripe_price_id', () => {
    const offers = [
      offer(),
      offer({ name: 'Other', metadata: { stripe_price_id: 'price_2' } }),
      offer({ name: 'Manual', source: undefined, metadata: undefined }),
    ]
    const { offers: next, changed, changes } = applyPriceToOffers(offers, target({ productId: null }))
    expect(changed).toBe(1)
    expect(next[0].price).toBe('$55')
    expect(next[1].price).toBe('$40')
    expect(next[2].price).toBe('$40')
    expect(changes).toEqual([{ name: 'Deep Clean', from: '$40', to: '$55' }])
  })

  it('requires source=stripe - an owner clearing the source detaches the offer from sync', () => {
    const offers = [offer({ source: undefined }), offer({ source: 'calendly' })]
    expect(applyPriceToOffers(offers, target()).changed).toBe(0)
  })

  it('falls back to stripe_product_id ONLY for offers without a price id (product-keyed imports)', () => {
    const productKeyed = offer({ name: 'Product-keyed', metadata: { stripe_product_id: 'prod_1' } })
    const { offers: next, changed } = applyPriceToOffers([productKeyed], target())
    expect(changed).toBe(1)
    expect(next[0].price).toBe('$55')
  })

  it("never clobbers a sibling price's offer via the product fallback (monthly vs yearly)", () => {
    // Both offers share prod_1; the yearly price event must only touch its own.
    const monthly = offer({ name: 'Monthly', price: '$40 / month', metadata: { stripe_price_id: 'price_1', stripe_product_id: 'prod_1' } })
    const yearly = offer({ name: 'Yearly', price: '$400 / year', metadata: { stripe_price_id: 'price_2', stripe_product_id: 'prod_1' } })
    const { offers: next, changed } = applyPriceToOffers(
      [monthly, yearly],
      target({ priceId: 'price_2', priceStr: '$450 / year' }),
    )
    expect(changed).toBe(1)
    expect(next[0].price).toBe('$40 / month')
    expect(next[1].price).toBe('$450 / year')
  })

  it('moves ONLY the price field - names/descriptions stay the owner\'s', () => {
    const offers = [offer({ name: 'Renamed by owner', description: 'Owner copy' })]
    const { offers: next } = applyPriceToOffers(offers, target())
    expect(next[0]).toMatchObject({ name: 'Renamed by owner', description: 'Owner copy', price: '$55' })
  })

  it('stamps last_stripe_sync when syncedAt is provided, preserving other metadata', () => {
    const { offers: next } = applyPriceToOffers([offer()], target({ syncedAt: '2026-07-07T00:00:00.000Z' }))
    expect(next[0].metadata).toEqual({
      stripe_price_id: 'price_1',
      stripe_product_id: 'prod_1',
      last_stripe_sync: '2026-07-07T00:00:00.000Z',
    })
  })

  it('keeps the importer\'s single Standard tier in lockstep', () => {
    const offers = [
      offer({
        price: '$40 / month',
        tiers: [{ name: 'Standard', price: '$40 / month', description: 'Recurring via Stripe' }],
      }),
    ]
    const { offers: next } = applyPriceToOffers(offers, target({ priceStr: '$55 / month' }))
    expect(next[0].price).toBe('$55 / month')
    expect(next[0].tiers).toEqual([{ name: 'Standard', price: '$55 / month', description: 'Recurring via Stripe' }])
  })

  it('leaves owner-customized tiers alone (renamed, diverged price, or multiple)', () => {
    const renamed = offer({ tiers: [{ name: 'Basic', price: '$40', description: '' }] })
    const diverged = offer({ tiers: [{ name: 'Standard', price: '$99', description: '' }] })
    const multi = offer({
      tiers: [
        { name: 'Standard', price: '$40', description: '' },
        { name: 'Plus', price: '$80', description: '' },
      ],
    })
    for (const o of [renamed, diverged, multi]) {
      const { offers: next, changed } = applyPriceToOffers([o], target())
      expect(changed).toBe(1)
      expect(next[0].price).toBe('$55')
      expect(next[0].tiers).toEqual(o.tiers) // untouched
    }
  })

  it('is idempotent: an already-current price counts as unchanged (webhook retries no-op)', () => {
    const offers = [offer({ price: '$55' })]
    const { offers: next, changed } = applyPriceToOffers(offers, target())
    expect(changed).toBe(0)
    expect(next[0]).toBe(offers[0]) // same reference - nothing to write
  })

  it('updates every offer sharing the price id (multi-offer pages)', () => {
    const offers = [offer(), offer({ name: 'Bundle copy' })]
    expect(applyPriceToOffers(offers, target()).changed).toBe(2)
  })

  it('never mutates the input array', () => {
    const offers = [offer()]
    applyPriceToOffers(offers, target())
    expect(offers[0].price).toBe('$40')
    expect(offers[0].metadata).toEqual({ stripe_price_id: 'price_1', stripe_product_id: 'prod_1' })
  })
})
