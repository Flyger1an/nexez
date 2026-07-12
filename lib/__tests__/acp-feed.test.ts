import { describe, expect, it } from 'vitest'
import { buildAcpFeedItems, type AcpFeedPage } from '../acp/feed'
import type { OfferItem } from '../agent-page'

function offer(partial: Partial<OfferItem> & { name: string; price: string }): OfferItem {
  return { description: '', url: '', ...partial }
}

function makePage(overrides: Partial<AcpFeedPage> = {}): AcpFeedPage {
  return {
    slug: 'acme',
    name: 'Acme Studio',
    currency: 'usd',
    website_url: 'https://acme.example',
    services: [offer({ name: 'Strategy Session', price: '$1,200', description: 'A deep-dive.' })],
    products: [
      offer({ name: 'Brand Kit', price: '$450' }),
      offer({ name: 'Negotiable Logo', price: '$2,000', offerType: 'negotiable' }), // excluded by SF4
      offer({ name: 'Sold Out Poster', price: '$40', availability: 'sold_out' }),
    ],
    ...overrides,
  }
}

const BASE = 'https://nexez.app'

describe('buildAcpFeedItems', () => {
  it('projects each purchasable offer into an ACP item (minor units + ISO currency)', () => {
    const items = buildAcpFeedItems([makePage()], BASE)
    const strategy = items.find((i) => i.title === 'Strategy Session')!
    expect(strategy.item_id).toBe('acme:services-0')
    expect(strategy.url).toBe('https://nexez.app/acme')
    expect(strategy.price).toEqual({ amount: 120000, currency: 'USD' })
    expect(strategy.availability).toBe('in_stock')
    expect(strategy.seller_name).toBe('Acme Studio')
    expect(strategy.seller_url).toBe('https://acme.example/') // sanitizePublicUrl normalizes the bare host
    expect(strategy.store_country).toBe('US')
    expect(strategy.target_countries).toEqual(['US'])
  })

  it('inherits SF4 filtering: negotiable + unpriced excluded, sold-out included as out_of_stock', () => {
    const items = buildAcpFeedItems([makePage()], BASE)
    const titles = items.map((i) => i.title)
    expect(titles).toContain('Strategy Session')
    expect(titles).toContain('Brand Kit')
    expect(titles).toContain('Sold Out Poster')
    expect(titles).not.toContain('Negotiable Logo')
    expect(items.find((i) => i.title === 'Sold Out Poster')!.availability).toBe('out_of_stock')
  })

  it('is search-eligible always; checkout-eligible only when enabled AND in stock', () => {
    const disabled = buildAcpFeedItems([makePage()], BASE)
    expect(disabled.every((i) => i.is_eligible_search)).toBe(true)
    expect(disabled.every((i) => i.is_eligible_checkout === false)).toBe(true)

    const enabled = buildAcpFeedItems([makePage()], BASE, { checkoutEnabled: true })
    const inStock = enabled.find((i) => i.title === 'Strategy Session')!
    const soldOut = enabled.find((i) => i.title === 'Sold Out Poster')!
    expect(inStock.is_eligible_checkout).toBe(true)
    expect(soldOut.is_eligible_checkout).toBe(false) // out of stock → never checkout-eligible
  })

  it('per-seller gate: only slugs in checkoutEligibleSlugs are checkout-eligible', () => {
    const a = makePage({ slug: 'acme', products: [] }) // in-stock Strategy Session
    const b = makePage({ slug: 'beta', name: 'Beta Co', services: [offer({ name: 'Consult', price: '$300' })], products: [] })
    const items = buildAcpFeedItems([a, b], BASE, { checkoutEnabled: true, checkoutEligibleSlugs: new Set(['acme']) })
    expect(items.find((i) => i.item_id.startsWith('acme'))!.is_eligible_checkout).toBe(true)
    expect(items.find((i) => i.item_id.startsWith('beta'))!.is_eligible_checkout).toBe(false)
    // Search eligibility is unaffected by the checkout gate.
    expect(items.every((i) => i.is_eligible_search)).toBe(true)
  })

  it('per-seller gate: an EMPTY eligible set blocks checkout for everyone (fail closed)', () => {
    const items = buildAcpFeedItems([makePage()], BASE, { checkoutEnabled: true, checkoutEligibleSlugs: new Set() })
    expect(items.every((i) => i.is_eligible_checkout === false)).toBe(true)
  })

  it('falls back to the Nexez listing URL when the seller has no website', () => {
    const items = buildAcpFeedItems([makePage({ website_url: null })], BASE)
    expect(items[0].seller_url).toBe('https://nexez.app/acme')
  })

  it('rejects an unsafe website_url (falls back to the listing url)', () => {
    const items = buildAcpFeedItems([makePage({ website_url: 'javascript:alert(1)' })], BASE)
    expect(items[0].seller_url).toBe('https://nexez.app/acme')
  })

  it('honors custom store/target countries (uppercased)', () => {
    const items = buildAcpFeedItems([makePage()], BASE, { storeCountry: 'gb', targetCountries: ['gb', 'ie'] })
    expect(items[0].store_country).toBe('GB')
    expect(items[0].target_countries).toEqual(['GB', 'IE'])
  })

  it('carries per-page currency (gbp) into the ACP price', () => {
    const page = makePage({ currency: 'gbp', services: [offer({ name: 'Audit', price: '$500' })], products: [] })
    const items = buildAcpFeedItems([page], BASE)
    expect(items[0].price).toEqual({ amount: 50000, currency: 'GBP' })
  })

  it('spans multiple merchants with globally-unique item ids', () => {
    const a = makePage({ slug: 'acme', products: [] })
    const b = makePage({ slug: 'beta', name: 'Beta Co', services: [offer({ name: 'Consult', price: '$300' })], products: [] })
    const items = buildAcpFeedItems([a, b], BASE)
    const ids = items.map((i) => i.item_id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('acme:services-0')
    expect(ids).toContain('beta:services-0')
  })

  it('returns an empty feed for pages with no purchasable offers', () => {
    const page = makePage({ services: [offer({ name: 'Quote only', price: 'Contact us' })], products: [] })
    expect(buildAcpFeedItems([page], BASE)).toEqual([])
  })
})
