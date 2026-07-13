import { describe, it, expect } from 'vitest'
import { mergeProviderOffers, mergeProviderOffersAcrossColumns } from './integration-merge'
import type { OfferItem } from './agent-page'

const o = (over: Partial<OfferItem> & { name: string }): OfferItem => ({ description: '', price: '$0', url: '', ...over })

describe('mergeProviderOffers', () => {
  it('adds new provider offers and tags them source=<provider>', () => {
    const out = mergeProviderOffers([], [o({ name: 'Intro Call', url: 'https://calendly.com/x', metadata: { calendly_event_type: 'https://api.calendly.com/event_types/GB' } })], 'calendly')
    expect(out).toHaveLength(1)
    expect(out[0]!.source).toBe('calendly')
    expect(out[0]!.metadata?.calendly_event_type).toBe('https://api.calendly.com/event_types/GB')
  })

  it('preserves manual + other-provider offers verbatim', () => {
    const existing = [o({ name: 'Consulting', price: '$500', source: undefined }), o({ name: 'Widget', price: '$9', source: 'shopify' })]
    const out = mergeProviderOffers(existing, [o({ name: 'Intro', source: 'calendly' })], 'calendly')
    expect(out.find((x) => x.name === 'Consulting')!.price).toBe('$500')
    expect(out.find((x) => x.name === 'Widget')!.source).toBe('shopify')
    expect(out.find((x) => x.name === 'Intro')!.source).toBe('calendly')
  })

  it('NEVER clobbers a same-named manual offer — keeps it + adds the provider one', () => {
    const existing = [o({ name: 'Discovery Call', price: '$199', url: 'https://mysite.com/book', source: undefined })]
    const incoming = [o({ name: 'Discovery Call', price: 'Custom', url: 'https://calendly.com/d/x', metadata: { calendly_event_type: 'https://api.calendly.com/event_types/GB' } })]
    const out = mergeProviderOffers(existing, incoming, 'calendly')
    const named = out.filter((x) => x.name === 'Discovery Call')
    expect(named).toHaveLength(2)
    const manual = named.find((x) => x.source !== 'calendly')!
    expect(manual.price).toBe('$199')
    expect(manual.url).toBe('https://mysite.com/book')
    const cal = named.find((x) => x.source === 'calendly')!
    expect(cal.metadata?.calendly_event_type).toBe('https://api.calendly.com/event_types/GB')
  })

  it('updates an existing SAME-provider offer in place (re-sync refresh) without duplicating', () => {
    const existing = [o({ name: 'Intro Call', price: 'Custom', url: 'https://old', source: 'calendly', metadata: { calendly_event_type: 'https://api.calendly.com/event_types/GB' } })]
    const incoming = [o({ name: 'Intro Call', price: 'Custom', url: 'https://calendly.com/new', metadata: { calendly_event_type: 'https://api.calendly.com/event_types/GB' } })]
    const out = mergeProviderOffers(existing, incoming, 'calendly')
    expect(out.filter((x) => x.name === 'Intro Call')).toHaveLength(1)
    expect(out[0]!.url).toBe('https://calendly.com/new')
    expect(out[0]!.metadata?.calendly_event_type).toBe('https://api.calendly.com/event_types/GB')
  })

  it('is scoped per provider — a shopify sync never touches calendly offers', () => {
    const existing = [o({ name: 'Intro', source: 'calendly' }), o({ name: 'Mug', price: '$12', source: 'shopify' })]
    const out = mergeProviderOffers(existing, [o({ name: 'Mug', price: '$15', source: 'shopify' })], 'shopify')
    expect(out.find((x) => x.name === 'Intro')!.source).toBe('calendly') // untouched
    expect(out.find((x) => x.name === 'Mug')!.price).toBe('$15') // refreshed
    expect(out.filter((x) => x.name === 'Mug')).toHaveLength(1)
  })
})

describe('mergeProviderOffersAcrossColumns', () => {
  it('adds a new Shopify offer to products, leaving existing manual products untouched', () => {
    const out = mergeProviderOffersAcrossColumns([], [o({ name: 'Handmade', price: '$40', source: undefined })], [o({ name: 'Mug', price: '$12' })], 'shopify')
    expect(out.services).toHaveLength(0)
    expect(out.products.map((x) => x.name)).toEqual(['Handmade', 'Mug'])
  })

  it('updates an existing provider offer IN products in place — never duplicates into services', () => {
    const products = [o({ name: 'Mug', price: '$10', url: 'https://old', source: 'shopify' })]
    const out = mergeProviderOffersAcrossColumns([], products, [o({ name: 'Mug', price: '$10', url: 'https://new' })], 'shopify')
    expect(out.services).toHaveLength(0) // NOT added to services
    expect(out.products).toHaveLength(1)
    expect(out.products[0]!.url).toBe('https://new') // refreshed in place
  })

  it('preserves manual + other-provider offers in both columns', () => {
    const services = [o({ name: 'Consulting', price: '$500', source: undefined })]
    const products = [o({ name: 'Widget', price: '$9', source: undefined }), o({ name: 'Mug', price: '$10', source: 'shopify' })]
    const out = mergeProviderOffersAcrossColumns(services, products, [o({ name: 'Mug', price: '$11' }), o({ name: 'Tee', price: '$20' })], 'shopify')
    expect(out.services.find((x) => x.name === 'Consulting')!.price).toBe('$500')
    expect(out.products.find((x) => x.name === 'Tee')).toBeTruthy() // new Shopify item → products
    expect(out.products.find((x) => x.name === 'Widget')!.price).toBe('$9')
    expect(out.products.find((x) => x.name === 'Mug')!.price).toBe('$11') // updated in products
    expect(out.services.find((x) => x.name === 'Mug')).toBeUndefined() // no cross-column dup
  })

  it('keeps a legacy Shopify item in services so its stable offer key does not change', () => {
    const services = [o({ name: 'Legacy Mug', price: '$10', url: 'https://old', source: 'shopify' })]
    const out = mergeProviderOffersAcrossColumns(services, [], [
      o({ name: 'Legacy Mug', price: '$12', url: 'https://new' }),
      o({ name: 'New Tee', price: '$20', url: 'https://tee' }),
    ], 'shopify')

    expect(out.services).toHaveLength(1)
    expect(out.services[0]).toMatchObject({ name: 'Legacy Mug', price: '$12', url: 'https://new' })
    expect(out.products.map((x) => x.name)).toEqual(['New Tee'])
  })
})
