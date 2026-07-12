import { describe, expect, it } from 'vitest'
import { buildUcpFeedItems, type UcpFeedPage } from '../ucp/feed'
import { buildNexezCapabilities } from '../agent-capabilities'
import type { OfferItem } from '../agent-page'

function offer(partial: Partial<OfferItem> & { name: string; price: string }): OfferItem {
  return { description: '', url: '', ...partial }
}
function makePage(overrides: Partial<UcpFeedPage> = {}): UcpFeedPage {
  return {
    slug: 'acme',
    name: 'Acme Studio',
    currency: 'usd',
    website_url: 'https://acme.example',
    services: [offer({ name: 'Strategy Session', price: '$1,200' })],
    products: [
      offer({ name: 'Brand Kit', price: '$450' }),
      offer({ name: 'Negotiable Logo', price: '$2,000', offerType: 'negotiable' }),
      offer({ name: 'Sold Out Poster', price: '$40', availability: 'sold_out' }),
    ],
    ...overrides,
  }
}
const BASE = 'https://nexez.app'

describe('buildUcpFeedItems', () => {
  it('projects offers into Merchant-Center items (MAJOR.dd CUR price, brand, link)', () => {
    const item = buildUcpFeedItems([makePage()], BASE).find((i) => i.title === 'Strategy Session')!
    expect(item.id).toBe('acme:services-0')
    expect(item.price).toBe('1200.00 USD')
    expect(item.availability).toBe('in_stock')
    expect(item.brand).toBe('Acme Studio')
    expect(item.link).toBe('https://nexez.app/acme')
    expect(item.seller_url).toBe('https://acme.example/')
    expect(item.is_eligible_search).toBe(true)
    expect(item.is_eligible_checkout).toBe(false)
  })

  it('inherits SF4 filtering (negotiable excluded, sold-out → out_of_stock)', () => {
    const titles = buildUcpFeedItems([makePage()], BASE).map((i) => i.title)
    expect(titles).toContain('Brand Kit')
    expect(titles).not.toContain('Negotiable Logo')
    expect(buildUcpFeedItems([makePage()], BASE).find((i) => i.title === 'Sold Out Poster')!.availability).toBe('out_of_stock')
  })

  it('checkout-eligible only when enabled AND in stock', () => {
    const enabled = buildUcpFeedItems([makePage()], BASE, { checkoutEnabled: true })
    expect(enabled.find((i) => i.title === 'Strategy Session')!.is_eligible_checkout).toBe(true)
    expect(enabled.find((i) => i.title === 'Sold Out Poster')!.is_eligible_checkout).toBe(false)
  })

  it('per-seller gate: only slugs in checkoutEligibleSlugs are checkout-eligible', () => {
    const a = makePage({ slug: 'acme', products: [] })
    const b = makePage({ slug: 'beta', name: 'Beta Co', services: [offer({ name: 'Consult', price: '$300' })], products: [] })
    const items = buildUcpFeedItems([a, b], BASE, { checkoutEnabled: true, checkoutEligibleSlugs: new Set(['acme']) })
    expect(items.find((i) => i.id.startsWith('acme'))!.is_eligible_checkout).toBe(true)
    expect(items.find((i) => i.id.startsWith('beta'))!.is_eligible_checkout).toBe(false)
  })

  it('per-seller gate: an EMPTY eligible set blocks checkout for everyone (fail closed)', () => {
    const items = buildUcpFeedItems([makePage()], BASE, { checkoutEnabled: true, checkoutEligibleSlugs: new Set() })
    expect(items.every((i) => i.is_eligible_checkout === false)).toBe(true)
  })

  it('carries per-page currency into the Merchant price string (gbp)', () => {
    const page = makePage({ currency: 'gbp', services: [offer({ name: 'Audit', price: '$500' })], products: [] })
    expect(buildUcpFeedItems([page], BASE)[0].price).toBe('500.00 GBP')
  })
})

describe('capabilities manifest advertises both agentic-commerce protocols', () => {
  it('exposes ACP + UCP feed + checkout URLs, search_only until enrollment', () => {
    const caps = buildNexezCapabilities() as any
    expect(caps.agentic_commerce.acp.product_feed_url).toMatch(/\/acp\/feed\.json$/)
    expect(caps.agentic_commerce.acp.checkout_sessions_url).toMatch(/\/api\/acp\/checkout_sessions$/)
    expect(caps.agentic_commerce.acp.checkout_status).toBe('search_only')
    expect(caps.agentic_commerce.ucp.product_feed_url).toMatch(/\/ucp\/feed\.json$/)
    expect(caps.agentic_commerce.ucp.checkout_sessions_url).toMatch(/\/api\/ucp\/checkout-sessions$/)
    expect(caps.agentic_commerce.ucp.checkout_status).toBe('search_only')
  })
})
