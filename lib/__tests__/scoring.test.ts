import { describe, expect, it } from 'vitest'
import { getReadinessScore, getTrustScore, type AgentPage } from '../agent-page'

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

describe('getTrustScore', () => {
  it('base is 60% of readiness with no verification', () => {
    expect(getTrustScore(fullPage)).toBe(60) // readiness 100 * 0.6
  })
  it('adds verification bonuses (domain +15, email +10, docs +10)', () => {
    expect(getTrustScore({ ...fullPage, custom_domain_verified: '2026-01-01' })).toBe(75)
    expect(
      getTrustScore({
        ...fullPage,
        custom_domain_verified: '2026-01-01',
        verification_details: { email_verified: true, docs_provided: ['license.pdf'] },
      } as Partial<AgentPage>),
    ).toBe(95)
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
      { ...fullPage, custom_domain_verified: 'x', verification_details: { email_verified: true, docs_provided: ['a'] } } as Partial<AgentPage>,
      [{ event_type: 'checkout_attempt' }, { event_type: 'stripe_session_created' }],
    )
    expect(score).toBeLessThanOrEqual(100)
    expect(score).toBeGreaterThanOrEqual(0)
  })
})
