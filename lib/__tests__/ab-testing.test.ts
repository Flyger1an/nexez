import { describe, it, expect } from 'vitest'
import type { OfferItem } from '../agent-page'
import type { CheckoutEvent } from '../checkout-events'
import {
  AB_BUCKET_MAX,
  AB_IMPRESSION_EVENT,
  canonicalHiddenIndices,
  getActiveTests,
  hiddenVariantIndices,
  parseBucket,
  randomBucket,
  rollupAbResults,
  servedIndexForTest,
  servedVariants,
} from '../ab-testing'

function offer(name: string, ab_test?: string, ab_label?: string): OfferItem {
  return { name, price: '$10', description: '', url: '', ab_test, ab_label }
}

function event(partial: Partial<CheckoutEvent>): CheckoutEvent {
  return {
    id: Math.random().toString(36).slice(2),
    page_id: 'p1',
    owner_id: 'o1',
    slug: 'demo',
    offer_key: 'services-0',
    offer_name: 'Offer',
    offer_kind: 'services',
    event_type: 'checkout_view',
    agent_user_agent: null,
    referrer: null,
    query: null,
    checkout_url: null,
    provider_url: null,
    stripe_session_id: null,
    metadata: {},
    created_at: new Date().toISOString(),
    ...partial,
  }
}

describe('parseBucket', () => {
  it('parses valid integers within range', () => {
    expect(parseBucket('42')).toBe(42)
    expect(parseBucket(String(AB_BUCKET_MAX + 7))).toBe(7)
  })
  it('falls back to 0 on garbage', () => {
    expect(parseBucket(null)).toBe(0)
    expect(parseBucket('')).toBe(0)
    expect(parseBucket('abc')).toBe(0)
    expect(parseBucket('-5')).toBe(0)
  })
})

describe('randomBucket', () => {
  it('stays within [0, AB_BUCKET_MAX)', () => {
    for (let i = 0; i < 100; i++) {
      const b = randomBucket()
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThan(AB_BUCKET_MAX)
    }
  })
})

describe('getActiveTests', () => {
  it('groups only tests with 2+ members, indices ascending', () => {
    const offers = [
      offer('A1', 't1', 'A'),
      offer('Solo'),
      offer('B1', 't1', 'B'),
      offer('Lonely', 't2', 'A'), // single member → not a test
    ]
    const tests = getActiveTests(offers)
    expect([...tests.keys()]).toEqual(['t1'])
    expect(tests.get('t1')).toEqual([0, 2])
  })
})

describe('servedIndexForTest', () => {
  it('is deterministic for a bucket and splits across members', () => {
    const members = [0, 2]
    expect(servedIndexForTest(members, 0)).toBe(0)
    expect(servedIndexForTest(members, 1)).toBe(2)
    expect(servedIndexForTest(members, 2)).toBe(0)
    expect(servedIndexForTest(members, 3)).toBe(2)
  })
})

describe('hiddenVariantIndices', () => {
  const offers = [offer('A1', 't1', 'A'), offer('Solo'), offer('B1', 't1', 'B')]
  it('hides the non-served variant only', () => {
    expect(hiddenVariantIndices(offers, 0)).toEqual(new Set([2])) // serve A (idx0) → hide B
    expect(hiddenVariantIndices(offers, 1)).toEqual(new Set([0])) // serve B (idx2) → hide A
  })
  it('never hides non-test offers', () => {
    expect(hiddenVariantIndices(offers, 0).has(1)).toBe(false)
    expect(hiddenVariantIndices(offers, 1).has(1)).toBe(false)
  })
})

describe('canonicalHiddenIndices', () => {
  it('keeps the first member, hides the rest, regardless of bucket', () => {
    const offers = [offer('A1', 't1', 'A'), offer('B1', 't1', 'B'), offer('C1', 't1', 'C')]
    expect(canonicalHiddenIndices(offers)).toEqual(new Set([1, 2]))
  })
})

describe('servedVariants', () => {
  it('returns the served index + test + label for each active test', () => {
    const offers = [offer('A1', 't1', 'A'), offer('B1', 't1', 'B')]
    expect(servedVariants(offers, 0)).toEqual([{ index: 0, ab_test: 't1', ab_label: 'A' }])
    expect(servedVariants(offers, 1)).toEqual([{ index: 1, ab_test: 't1', ab_label: 'B' }])
  })
})

describe('rollupAbResults', () => {
  it('computes per-variant impressions, conversions, rate and a winner', () => {
    const events: CheckoutEvent[] = [
      // Variant A: 10 impressions, 1 conversion (10%)
      ...Array.from({ length: 10 }, () =>
        event({ event_type: AB_IMPRESSION_EVENT, offer_name: 'Plan (Variant A)', metadata: { ab_test: 't1', ab_label: 'A' } }),
      ),
      event({ event_type: 'provider_redirect', offer_name: 'Plan (Variant A)', metadata: { ab_test: 't1', ab_label: 'A' } }),
      // Variant B: 10 impressions, 3 conversions (30%)
      ...Array.from({ length: 10 }, () =>
        event({ event_type: AB_IMPRESSION_EVENT, offer_name: 'Plan (Variant B)', metadata: { ab_test: 't1', ab_label: 'B' } }),
      ),
      ...Array.from({ length: 3 }, () =>
        event({ event_type: 'stripe_session_created', offer_name: 'Plan (Variant B)', metadata: { ab_test: 't1', ab_label: 'B' } }),
      ),
    ]
    const [result] = rollupAbResults(events)
    expect(result.test).toBe('t1')
    const a = result.variants.find((v) => v.label === 'A')!
    const b = result.variants.find((v) => v.label === 'B')!
    expect(a.impressions).toBe(10)
    expect(a.conversions).toBe(1)
    expect(a.rate).toBeCloseTo(0.1)
    expect(b.impressions).toBe(10)
    expect(b.conversions).toBe(3)
    expect(b.rate).toBeCloseTo(0.3)
    expect(result.winnerLabel).toBe('B')
  })

  it('ignores events with no ab_test and excludes dry-run conversions', () => {
    const events: CheckoutEvent[] = [
      event({ event_type: 'provider_redirect', metadata: {} }), // no test → ignored
      event({ event_type: AB_IMPRESSION_EVENT, metadata: { ab_test: 't1', ab_label: 'A' } }),
      event({ event_type: 'provider_redirect', metadata: { ab_test: 't1', ab_label: 'A', dry_run: true } }), // simulator → not counted
    ]
    const results = rollupAbResults(events)
    expect(results).toHaveLength(1)
    const a = results[0].variants.find((v) => v.label === 'A')!
    expect(a.impressions).toBe(1)
    expect(a.conversions).toBe(0)
  })

  it('declares no winner when rates tie', () => {
    const events: CheckoutEvent[] = [
      event({ event_type: AB_IMPRESSION_EVENT, metadata: { ab_test: 't1', ab_label: 'A' } }),
      event({ event_type: 'provider_redirect', metadata: { ab_test: 't1', ab_label: 'A' } }),
      event({ event_type: AB_IMPRESSION_EVENT, metadata: { ab_test: 't1', ab_label: 'B' } }),
      event({ event_type: 'provider_redirect', metadata: { ab_test: 't1', ab_label: 'B' } }),
    ]
    expect(rollupAbResults(events)[0].winnerLabel).toBeNull()
  })
})
