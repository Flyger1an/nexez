import { describe, expect, it } from 'vitest'
import { buildOfferFeedRows, type FeedPage } from '../commerce/offer-feed'
import type { OfferItem } from '../agent-page'

function offer(partial: Partial<OfferItem> & { name: string; price: string }): OfferItem {
  return { description: '', url: '', ...partial }
}

function makePage(overrides: Partial<FeedPage> = {}): FeedPage {
  return {
    slug: 'acme',
    name: 'Acme Studio',
    currency: 'usd',
    services: [
      offer({ name: 'Strategy Session', price: '$1,200', description: 'A deep-dive.' }),
      offer({ name: 'Retainer', price: 'Custom quote' }), // unpriced → excluded
    ],
    products: [
      offer({ name: 'Brand Kit', price: '$450' }),
      offer({ name: 'Negotiable Logo', price: '$2,000', offerType: 'negotiable' }), // excluded
      offer({ name: 'Sold Out Poster', price: '$40', availability: 'sold_out' }), // included, out_of_stock
      offer({ name: 'Limited Print', price: '$80', availability: 'limited' }), // included, in_stock
    ],
    ...overrides,
  }
}

const BASE = 'https://nexez.app'

describe('buildOfferFeedRows', () => {
  it('includes only fixed, priced offers; excludes negotiable + unpriced', () => {
    const rows = buildOfferFeedRows(makePage(), BASE)
    const titles = rows.map((r) => r.title)
    expect(titles).toContain('Strategy Session')
    expect(titles).toContain('Brand Kit')
    expect(titles).toContain('Sold Out Poster')
    expect(titles).toContain('Limited Print')
    expect(titles).not.toContain('Retainer') // unpriced
    expect(titles).not.toContain('Negotiable Logo') // negotiable
    expect(rows).toHaveLength(4)
  })

  it('projects a fixed offer with parity pricing + absolute links', () => {
    const row = buildOfferFeedRows(makePage(), BASE).find((r) => r.title === 'Strategy Session')!
    expect(row.id).toBe('acme:services-0')
    expect(row.slug).toBe('acme')
    expect(row.offerKey).toBe('services-0')
    expect(row.kind).toBe('services')
    expect(row.sellerName).toBe('Acme Studio')
    expect(row.link).toBe('https://nexez.app/acme')
    expect(row.checkoutUrl).toBe('https://nexez.app/checkout/acme?offer=services-0')
    expect(row.availability).toBe('in_stock')
    expect(row.priceAmountMinor).toBe(120000)
    expect(row.priceCurrency).toBe('usd')
    expect(row.priceFeed).toBe('1200.00 USD')
    expect(row.priceDisplay).toContain('1,200')
  })

  it('flags a sold-out priced offer as out_of_stock (still listed)', () => {
    const row = buildOfferFeedRows(makePage(), BASE).find((r) => r.title === 'Sold Out Poster')!
    expect(row.availability).toBe('out_of_stock')
    expect(row.priceAmountMinor).toBe(4000)
  })

  it('treats limited availability as in_stock', () => {
    const row = buildOfferFeedRows(makePage(), BASE).find((r) => r.title === 'Limited Print')!
    expect(row.availability).toBe('in_stock')
  })

  it('honors the page currency and zero-decimal formatting (JPY)', () => {
    const page = makePage({ currency: 'jpy', services: [offer({ name: 'Ticket', price: '3000' })], products: [] })
    const row = buildOfferFeedRows(page, BASE)[0]
    expect(row.priceCurrency).toBe('jpy')
    expect(row.priceAmountMinor).toBe(3000) // no ×100 for zero-decimal
    expect(row.priceFeed).toBe('3000 JPY') // no decimals
  })

  it('uses the page currency, not the price string symbol (gbp page)', () => {
    const page = makePage({ currency: 'gbp', services: [offer({ name: 'Audit', price: '$500' })], products: [] })
    const row = buildOfferFeedRows(page, BASE)[0]
    expect(row.priceCurrency).toBe('gbp')
    expect(row.priceAmountMinor).toBe(50000)
    expect(row.priceFeed).toBe('500.00 GBP')
  })

  it('normalizes a trailing slash on the base url', () => {
    const row = buildOfferFeedRows(makePage(), 'https://acme.com/')[0]
    expect(row.link).toBe('https://acme.com/acme')
    expect(row.checkoutUrl.startsWith('https://acme.com/checkout/')).toBe(true)
  })

  it('returns an empty feed for a page with no purchasable offers', () => {
    const page = makePage({ services: [offer({ name: 'Quote only', price: 'Contact us' })], products: [] })
    expect(buildOfferFeedRows(page, BASE)).toEqual([])
  })

  it('produces globally-unique ids across products and services', () => {
    const rows = buildOfferFeedRows(makePage(), BASE)
    const ids = rows.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('acme:products-0')
    expect(ids).toContain('acme:services-0')
  })
})
