import { describe, expect, it } from 'vitest'
import { buildJsonLd } from '../page-jsonld'
import type { AgentPage } from '../agent-page'

const page = {
  slug: 'acme',
  name: 'Acme Studio',
  description: 'A studio.',
  currency: 'usd',
  is_published: true,
  services: [
    { name: 'Strategy Session', description: '', url: '', price: '$1,200' },
    { name: 'Custom Quote', description: '', url: '', price: 'Contact us' },
  ],
  products: [],
} as unknown as AgentPage

describe('buildJsonLd offer pricing', () => {
  const jsonLd = buildJsonLd(page, 'https://nexez.app') as unknown as {
    url: string
    mainEntity: { makesOffer: Record<string, unknown>[] }
  }
  const offers = jsonLd.mainEntity.makesOffer

  it('preserves the absolute platform URL and appends the listing slug once', () => {
    expect(jsonLd.url).toBe('https://nexez.app/acme')
    expect(offers[0]?.url).toBe('https://nexez.app/checkout/acme?offer=services-0')
  })

  it('uses the configured path on a custom domain without appending the slug', () => {
    const custom = buildJsonLd(page, 'https://merchant.example', '/services')
    expect(custom.url).toBe('https://merchant.example/services')
  })

  it('emits NUMERIC price + currency for parsable prices (rich-result eligible)', () => {
    const priced = offers.find((o) => o.name === 'Strategy Session')!
    expect(priced.price).toBe(1200) // never the raw "$1,200" display string
    expect(priced.priceCurrency).toBe('USD')
  })

  it('omits price entirely for unparsable prices (never an invalid value)', () => {
    const quote = offers.find((o) => o.name === 'Custom Quote')!
    expect(quote.price).toBeUndefined()
    expect(quote.priceCurrency).toBeUndefined()
    expect(quote.priceValidUntil).toBeUndefined()
  })
})
