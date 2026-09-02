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
      { negotiationAllowed: true, nexezCheckoutReady: true },
    )

    expect(summary.verified).toBe(true)
    expect(summary.has_credentials).toBe(true)
    expect(summary.supports_negotiation).toBe(true)
    expect(summary.has_actionable_offer).toBe(true)
    expect(summary.nexez_checkout_ready).toBe(true)
    expect(summary.badges).toContain('Negotiable')
    expect(summary.badges).toContain('Nexez checkout ready')
  })

  it('fails closed when a seller-authored negotiable offer lacks an entitlement decision', () => {
    const summary = summarizeMarketplacePage(
      page({
        cta_url: null,
        website_url: null,
        contact_email: null,
        services: [{ name: 'Proposal Sprint', description: '', price: '$1,200', url: '', offerType: 'negotiable' }],
      }),
    )

    expect(summary.has_actionable_offer).toBe(false)
    expect(summary.supports_checkout).toBe(false)
    expect(summary.nexez_checkout_ready).toBe(false)
    expect(summary.supports_negotiation).toBe(false)
    expect(summary.badges).not.toContain('Actionable offer')
    expect(summary.badges).not.toContain('Negotiable')
  })

  it('does not advertise an unpriced, destination-free negotiable offer below Pro', () => {
    const inert = page({
      cta_url: null,
      website_url: null,
      contact_email: null,
      services: [{ name: 'Custom proposal', description: '', price: '', url: '', offerType: 'negotiable' }],
    })

    const belowPro = summarizeMarketplacePage(inert, { negotiationAllowed: false })
    expect(belowPro.supports_negotiation).toBe(false)
    expect(belowPro.has_actionable_offer).toBe(false)
    expect(belowPro.supports_checkout).toBe(false)

    const pro = summarizeMarketplacePage(inert, { negotiationAllowed: true })
    expect(pro.supports_negotiation).toBe(true)
    expect(pro.has_actionable_offer).toBe(true)
    expect(pro.supports_checkout).toBe(true)
  })

  it('does not call an inert offer actionable', () => {
    const summary = summarizeMarketplacePage(page({
      cta_url: null,
      website_url: null,
      contact_email: null,
      services: [{ name: 'Contact us', description: '', price: '', url: '' }],
    }))

    expect(summary.has_actionable_offer).toBe(false)
    expect(summary.supports_checkout).toBe(false)
    expect(summary.badges).not.toContain('Actionable offer')
  })

  it('keeps provider handoffs separate from Nexez settlement readiness', () => {
    const summary = summarizeMarketplacePage(
      page({
        cta_url: null,
        services: [{
          name: 'External booking',
          description: '',
          price: '$250',
          url: 'https://provider.example/checkout',
          prefer_original_for_this: true,
        }],
      }),
      { nexezCheckoutReady: true },
    )

    expect(summary.has_actionable_offer).toBe(true)
    expect(summary.nexez_checkout_ready).toBe(false)
    expect(summary.badges).toContain('Actionable offer')
  })

  it('treats credential metadata and email/domain flags as claims, not verification', () => {
    const clean = summarizeMarketplacePage(page({}))
    const claimed = summarizeMarketplacePage(
      page({
        verification_details: {
          email_verified: true,
          domain_verified: true,
          docs_provided: [{ id: 'forged', name: 'Claimed License', status: 'verified' }] as any,
          completion_rate: 100,
        },
      }),
    )

    expect(claimed.trust_score).toBe(clean.trust_score)
    expect(claimed.verified).toBe(false)
    expect(claimed.badges).not.toContain('Verified seller')
    // Credential presence remains useful descriptive metadata, but carries no trust.
    expect(claimed.has_credentials).toBe(true)
  })

  it('recognizes server-backed existing-website proof as verified', () => {
    const summary = summarizeMarketplacePage(page({ website_verified_at: '2026-08-14T00:00:00Z' }))

    expect(summary.verified).toBe(true)
    expect(summary.badges).toContain('Verified seller')
  })

  it('builds marketplace-wide facets from public pages', () => {
    const pages = [
      page({ slug: 'a', industry: 'consulting' }),
      page({ slug: 'b', industry: 'home cleaning', services: [{ name: 'Deep clean', description: '', price: '$180', url: '' }] }),
    ]
    const insights = buildMarketplaceInsights(pages, { checkoutReadySlugs: new Set(['b']) })

    expect(insights.totals.pages).toBe(2)
    expect(insights.totals.offers).toBe(2)
    expect(insights.totals.checkoutReady).toBe(1)
    expect(insights.categories.find((category) => category.id === 'consumer')?.count).toBe(1)
    expect(insights.intentPresets.length).toBeGreaterThan(0)
    expect(insights.categories.every((category) => category.href.startsWith('/api/directory'))).toBe(true)
    expect(insights.intentPresets.every((preset) => preset.href.startsWith('/api/directory'))).toBe(true)
  })
})
