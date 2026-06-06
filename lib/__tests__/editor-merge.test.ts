import { describe, expect, it } from 'vitest'
import {
  smartMergeOffers,
  countOfferChanges,
  detectStripePriceChanges,
  buildDraftContent,
  buildVersionSnapshot,
  buildSavePayload,
  type EditorSaveInput,
} from '../editor-merge'
import { OfferItem } from '../agent-page'

const offer = (o: Partial<OfferItem> & { name: string }): OfferItem => ({
  description: '',
  price: '',
  url: '',
  ...o,
})

describe('smartMergeOffers', () => {
  it('appends genuinely new offers (case-insensitive name match)', () => {
    const existing = [offer({ name: 'Deep Clean' })]
    const incoming = [offer({ name: 'deep clean', price: '$120' }), offer({ name: 'Window Wash', price: '$40' })]
    const merged = smartMergeOffers(existing, incoming, 'all')
    expect(merged).toHaveLength(2)
    expect(merged.find((m) => m.name === 'Window Wash')?.price).toBe('$40')
  })

  it('protects a long manual description (>80 chars) but takes a fresh short one', () => {
    const long = 'x'.repeat(90)
    const existingLong = [offer({ name: 'A', description: long })]
    expect(smartMergeOffers(existingLong, [offer({ name: 'a', description: 'new short' })])[0].description).toBe(long)

    const existingShort = [offer({ name: 'A', description: 'short' })]
    expect(smartMergeOffers(existingShort, [offer({ name: 'a', description: 'fresher' })])[0].description).toBe('fresher')
  })

  it('protects existing tiers but adopts incoming tiers when none exist', () => {
    const withTiers = [offer({ name: 'A', tiers: [{ name: 'Basic', price: '$1' }] as any })]
    expect(smartMergeOffers(withTiers, [offer({ name: 'a', tiers: [{ name: 'Pro', price: '$9' }] as any })])[0].tiers).toEqual([
      { name: 'Basic', price: '$1' },
    ])

    const noTiers = [offer({ name: 'A' })]
    expect(smartMergeOffers(noTiers, [offer({ name: 'a', tiers: [{ name: 'Pro', price: '$9' }] as any })])[0].tiers).toEqual([
      { name: 'Pro', price: '$9' },
    ])
  })

  it('always takes the fresh price for Stripe-sourced offers', () => {
    const existing = [offer({ name: 'Plan', price: '$10', source: 'stripe' })]
    const incoming = [offer({ name: 'Plan', price: '$12', source: 'stripe' })]
    expect(smartMergeOffers(existing, incoming)[0].price).toBe('$12')
  })

  it('mode "new" only appends and never mutates existing offers', () => {
    const existing = [offer({ name: 'A', price: '$1' })]
    const incoming = [offer({ name: 'A', price: '$2' }), offer({ name: 'B', price: '$3' })]
    const merged = smartMergeOffers(existing, incoming, 'new')
    expect(merged).toHaveLength(2)
    expect(merged.find((m) => m.name === 'A')?.price).toBe('$1') // untouched
    expect(merged.find((m) => m.name === 'B')?.price).toBe('$3')
  })

  it('preserves source and prefer_original_for_this when incoming omits them (website-import equivalence)', () => {
    const existing = [offer({ name: 'A', source: 'calendly', prefer_original_for_this: true })]
    const incoming = [offer({ name: 'A', price: '$5' })] // no source / prefer flag
    const merged = smartMergeOffers(existing, incoming)[0]
    expect(merged.source).toBe('calendly')
    expect(merged.prefer_original_for_this).toBe(true)
    expect(merged.price).toBe('$5')
  })

  it('does not mutate the input arrays', () => {
    const existing = [offer({ name: 'A', price: '$1' })]
    smartMergeOffers(existing, [offer({ name: 'A', price: '$9' })])
    expect(existing[0].price).toBe('$1')
  })
})

describe('countOfferChanges', () => {
  it('splits incoming into new vs updates', () => {
    const existing = [offer({ name: 'A' })]
    const incoming = [offer({ name: 'a' }), offer({ name: 'B' }), offer({ name: 'C' })]
    expect(countOfferChanges(existing, incoming)).toEqual({ newCount: 2, updateCount: 1 })
  })
})

describe('detectStripePriceChanges', () => {
  it('reports only Stripe offers whose price changed', () => {
    const existing = [
      offer({ name: 'Plan', price: '$10', source: 'stripe' }),
      offer({ name: 'Same', price: '$5', source: 'stripe' }),
      offer({ name: 'Manual', price: '$1' }),
    ]
    const incoming = [
      offer({ name: 'Plan', price: '$12', source: 'stripe' }),
      offer({ name: 'Same', price: '$5', source: 'stripe' }),
      offer({ name: 'Manual', price: '$99' }), // not stripe → ignored
    ]
    expect(detectStripePriceChanges(existing, incoming)).toEqual([{ name: 'Plan', old: '$10', new: '$12' }])
  })
})

const baseSaveInput: EditorSaveInput = {
  name: 'Acme',
  slug: '',
  description: 'desc',
  websiteUrl: 'https://acme.com',
  ctaUrl: '',
  ctaLabel: '',
  audience: 'buyers',
  location: 'NYC',
  contactEmail: 'a@acme.com',
  industry: 'Consulting',
  preferOriginalSite: false,
  nextAvailable: '',
  isPublished: true,
  services: '',
  products: '',
  faqs: 'q | a',
  servicesOffers: [offer({ name: 'Svc', price: '$100' })],
  productsOffers: [],
}

describe('buildSavePayload', () => {
  it('derives slug from name when slug is blank, and defaults cta fields', () => {
    const { payload } = buildSavePayload(baseSaveInput, [])
    expect(payload.slug).toBe('acme')
    expect(payload.cta_url).toBe('https://acme.com') // falls back to website
    expect(payload.cta_label).toBe('Visit website')
    expect(payload.next_available).toBeNull()
    expect(payload.services).toEqual([offer({ name: 'Svc', price: '$100' })])
    expect(payload.faqs).toEqual([{ question: 'q', answer: 'a' }])
  })

  it('prepends a fresh snapshot and caps version history at 10', () => {
    const existing = Array.from({ length: 12 }, (_, i) => ({ timestamp: `t${i}`, name: `v${i}` }))
    const { versions } = buildSavePayload(baseSaveInput, existing, '2026-06-05T00:00:00.000Z')
    expect(versions).toHaveLength(10)
    expect(versions[0].timestamp).toBe('2026-06-05T00:00:00.000Z')
    expect(versions[1].name).toBe('v0')
  })
})

describe('buildDraftContent / buildVersionSnapshot', () => {
  it('draft has no timestamp; snapshot is timestamped', () => {
    const draft = buildDraftContent(baseSaveInput)
    expect(draft).not.toHaveProperty('timestamp')
    expect(draft.name).toBe('Acme')

    const snap = buildVersionSnapshot(baseSaveInput, '2026-06-05T00:00:00.000Z')
    expect(snap.timestamp).toBe('2026-06-05T00:00:00.000Z')
  })
})
