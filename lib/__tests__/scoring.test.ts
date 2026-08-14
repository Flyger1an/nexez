import { describe, expect, it } from 'vitest'
import { getReadinessScore, getReadinessCriteria, getTrustScore, type AgentPage } from '../agent-page'

const fullPage: Partial<AgentPage> = {
  name: 'Acme',
  slug: 'acme',
  description: 'desc',
  website_url: 'https://acme.com',
  cta_url: 'https://acme.com/book',
  audience: 'buyers',
  industry: 'Consulting',
  location: 'NYC',
  contact_email: 'a@acme.com',
  services: [{ name: 's', description: '', price: '', url: '' }],
  products: [],
  faqs: [{ question: 'q', answer: 'a' }],
  is_published: true,
}

describe('getReadinessScore', () => {
  it('is 0 for an empty page and 100 for a complete one', () => {
    expect(getReadinessScore({})).toBe(0)
    expect(getReadinessScore(fullPage)).toBe(100)
  })
  it('is proportional to completed checks', () => {
    const partial = getReadinessScore({ name: 'x', slug: 'x', is_published: true })
    expect(partial).toBeGreaterThan(0)
    expect(partial).toBeLessThan(100)
  })
  it('counts offers from services or products', () => {
    const withOffers = getReadinessScore({ name: 'x', services: [{ name: 'a', description: '', price: '', url: '' }] })
    const without = getReadinessScore({ name: 'x' })
    expect(withOffers).toBeGreaterThan(without)
  })
})

describe('getReadinessCriteria', () => {
  it('returns a stable per-criterion breakdown that drives the score', () => {
    const all = getReadinessCriteria(fullPage)
    expect(all).toHaveLength(11)
    expect(all.every((c) => c.met)).toBe(true)
    // every criterion carries an id + a non-empty hint for the "what's missing" UI
    expect(all.every((c) => c.id && c.label && c.hint)).toBe(true)
  })
  it('stays in lockstep with getReadinessScore (met/total === %)', () => {
    for (const page of [{}, fullPage, { name: 'x', slug: 'x', is_published: true }, { name: 'x', industry: 'Law' }]) {
      const criteria = getReadinessCriteria(page)
      const derived = Math.round((criteria.filter((c) => c.met).length / criteria.length) * 100)
      expect(derived).toBe(getReadinessScore(page))
    }
  })
  it('marks unmet criteria so the checklist can surface them', () => {
    const criteria = getReadinessCriteria({ name: 'x' })
    const unmet = criteria.filter((c) => !c.met).map((c) => c.id)
    expect(unmet).toContain('industry')
    expect(unmet).toContain('offers')
    expect(unmet).toContain('publish')
  })
})

describe('getTrustScore', () => {
  it('base is 60% of readiness with no verification', () => {
    expect(getTrustScore(fullPage)).toBe(60) // readiness 100 * 0.6
  })
  it('adds bonuses only for server-backed domain and website proofs', () => {
    expect(getTrustScore({ ...fullPage, custom_domain_verified: '2026-01-01' })).toBe(75)
    expect(getTrustScore({ ...fullPage, website_verified_at: '2026-01-02' })).toBe(70)
    expect(
      getTrustScore({
        ...fullPage,
        custom_domain_verified: '2026-01-01',
        website_verified_at: '2026-01-02',
      } as Partial<AgentPage>),
    ).toBe(85)
  })
  it('ignores every owner-writable verification_details trust claim', () => {
    expect(
      getTrustScore({
        ...fullPage,
        verification_details: {
          email_verified: true,
          domain_verified: true,
          docs_provided: [{ name: 'license.pdf', status: 'verified' }],
          completion_rate: 100,
        },
      } as Partial<AgentPage>),
    ).toBe(60)
  })
  it('derives completion rate from events (capped at +5)', () => {
    const events = [
      { event_type: 'checkout_attempt' },
      { event_type: 'checkout_attempt' },
      { event_type: 'stripe_session_created' },
      { event_type: 'provider_redirect' },
    ]
    // 2 successes / 2 attempts = 100% completion → +5 over the base 60
    expect(getTrustScore(fullPage, events)).toBe(65)
  })
  it('clamps to 0-100', () => {
    const score = getTrustScore(
      { ...fullPage, custom_domain_verified: 'x', website_verified_at: 'y' } as Partial<AgentPage>,
      [{ event_type: 'checkout_attempt' }, { event_type: 'stripe_session_created' }],
    )
    expect(score).toBeLessThanOrEqual(100)
    expect(score).toBeGreaterThanOrEqual(0)
  })
})
