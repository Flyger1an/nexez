import { describe, expect, it } from 'vitest'
import type { OfferItem } from '@/src/types/nexez'
import { formatOfferLines, mergeOfferLines } from './agent-page'

const retainedOffer: OfferItem = {
  name: 'Strategy Sprint',
  price: '$1,000',
  description: 'Original description',
  url: 'https://example.com/sprint',
  offerType: 'negotiable',
  rules: {
    minPrice: '$800',
    maxDiscountPercent: 20,
    autoAccept: true,
    autoAcceptWithinPercent: 5,
    autoCounter: true,
    autoSettleMax: '$2,000',
    minNoticeHours: 24,
    blackoutDates: ['2026-12-25'],
    maxBookingsPerWeek: 4,
    includedScope: 'Research and roadmap',
    excludedScope: 'Implementation',
    maxRevisions: 2,
    maxProjectWeeks: 3,
  },
  source: 'shopify',
  metadata: { productId: 'gid://shopify/Product/1' },
  tiers: [{ name: 'Standard', price: '$1,000', description: 'One workshop' }],
  availability: 'limited',
}

describe('mobile compact offer editing', () => {
  it('preserves advanced and retained fields while editing basic columns', () => {
    const text = 'Strategy Sprint | $1,200 | Updated description | https://example.com/new'
    const [saved] = mergeOfferLines(text, [retainedOffer])

    expect(saved).toMatchObject({
      name: 'Strategy Sprint',
      price: '$1,200',
      description: 'Updated description',
      url: 'https://example.com/new',
      offerType: 'negotiable',
      rules: retainedOffer.rules,
      source: 'shopify',
      metadata: retainedOffer.metadata,
      tiers: retainedOffer.tiers,
      availability: 'limited',
    })
  })

  it('preserves objects by name through reordering and by index through a rename', () => {
    const second: OfferItem = { name: 'Audit', price: '$200', metadata: { id: 'audit-1' } }
    const reordered = mergeOfferLines(
      `${formatOfferLines([second])}\n${formatOfferLines([retainedOffer])}`,
      [retainedOffer, second],
    )
    expect(reordered[0].metadata).toEqual({ id: 'audit-1' })
    expect(reordered[1].rules).toEqual(retainedOffer.rules)

    const [renamed] = mergeOfferLines('Renamed Sprint | $1,000 | Original description | https://example.com/sprint', [retainedOffer])
    expect(renamed.name).toBe('Renamed Sprint')
    expect(renamed.rules).toEqual(retainedOffer.rules)
  })

  it('does not inherit metadata for a new row when row cardinality changes', () => {
    const saved = mergeOfferLines(
      `New offer | $50 | New | https://example.com/new\n${formatOfferLines([retainedOffer])}`,
      [retainedOffer],
    )
    expect(saved[0]).not.toHaveProperty('metadata')
    expect(saved[0]).not.toHaveProperty('rules')
    expect(saved[1].rules).toEqual(retainedOffer.rules)
  })
})
