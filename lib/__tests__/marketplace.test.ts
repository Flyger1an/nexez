import { describe, expect, it } from 'vitest'
import {
  buildMarketplaceInsights,
  classifyMarketplaceCategory,
  getMarketplacePriceBand,
  summarizeMarketplacePage,
} from '../marketplace'
import type { AgentPage } from '../agent-page'

function page(overrides: Partial<AgentPage>): AgentPage {
  return {
    id: overrides.slug || 'p',
    name: overrides.name || 'Test Page',
    slug: overrides.slug || 'test-page',
    description: overrides.description ?? 'Useful service',
    website_url: overrides.website_url ?? 'https://example.com',
    cta_url: overrides.cta_url ?? 'https://example.com/book',
    audience: overrides.audience ?? 'operators',
    location: overrides.location ?? 'Remote',
    contact_email: overrides.contact_email ?? 'hello@example.com',
    industry: overrides.industry ?? 'consulting',
    services: overrides.services ?? [{ name: 'Strategy Session', description: 'Plan next steps', price: '$250', url: '' }],
    products: overrides.products ?? [],
    faqs: overrides.faqs ?? [{ question: 'How fast?', answer: 'This week.' }],
    is_published: overrides.is_published ?? true,
    ...overrides,
  } as AgentPage
}

describe('marketplace intelligence', () => {
  it('classifies local/consumer services from industry and offer copy', () => {
    expect(classifyMarketplaceCategory(page({ industry: 'home plumbing' }))).toBe('consumer')
    expect(classifyMarketplaceCategory(page({ industry: 'B2B consulting' }))).toBe('professional')
  })

  it('places offers into useful price bands', () => {
    expect(getMarketplacePriceBand(page({ services: [{ name: 'Audit', description: '', price: '$75', url: '' }] }))).toBe('under_100')
    expect(getMarketplacePriceBand(page({ services: [{ name: 'Retainer', description: '', price: '$3,500', url: '' }] }))).toBe('2000_plus')
    expect(getMarketplacePriceBand(page({ services: [{ name: 'Discovery', description: '', price: 'Custom quote', url: '' }] }))).toBe('custom')
  })

  it('summarizes seller trust and action signals', () => {
    const summary = summarizeMarketplacePage(
      page({
        custom_domain_verified: true,
        verification_details: { docs_provided: [{ id: 'doc', name: 'License', status: 'verified' }] as any },
        services: [{ name: 'Proposal Sprint', description: '', price: '$1,200', url: '', offerType: 'negotiable' }],
      }),
    )

    expect(summary.verified).toBe(true)
    expect(summary.has_credentials).toBe(true)
    expect(summary.supports_negotiation).toBe(true)
    expect(summary.badges).toContain('Negotiable')
  })

  it('builds marketplace-wide facets from public pages', () => {
    const insights = buildMarketplaceInsights([
      page({ slug: 'a', industry: 'consulting' }),
      page({ slug: 'b', industry: 'home cleaning', services: [{ name: 'Deep clean', description: '', price: '$180', url: '' }] }),
    ])

    expect(insights.totals.pages).toBe(2)
    expect(insights.totals.offers).toBe(2)
    expect(insights.categories.find((category) => category.id === 'consumer')?.count).toBe(1)
    expect(insights.intentPresets.length).toBeGreaterThan(0)
  })
})
