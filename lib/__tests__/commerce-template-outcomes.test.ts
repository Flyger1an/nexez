import { describe, expect, it } from 'vitest'
import {
  buildCommerceTemplateOutcomeReport,
  classifyCommerceTemplateCheckoutRail,
  isSuccessfulCommerceTemplateCheckout,
  isSuccessfulCommerceTemplateNegotiation,
  type CommerceTemplateCheckoutOutcome,
  type CommerceTemplateOutcomeListing,
} from '../commerce-template-outcomes'

function listing(
  id: string,
  templateId: string | null,
  overrides: Partial<CommerceTemplateOutcomeListing> = {},
): CommerceTemplateOutcomeListing {
  return {
    id,
    name: 'Sample listing',
    slug: `sample-${id}`,
    description: 'A clear business description.',
    website_url: 'https://example.com',
    cta_url: 'https://example.com/book',
    audience: 'Local buyers',
    industry: 'Services',
    location: 'Austin, TX',
    contact_email: 'hello@example.com',
    services: [{ name: 'Service', description: '', price: '$100', url: '' }],
    products: [],
    faqs: [{ question: 'What is included?', answer: 'Everything listed.' }],
    is_published: true,
    commerce_template_id: templateId,
    commerce_template_version: templateId ? 1 : null,
    commerce_template_adopted_at: templateId ? '2026-08-25T12:00:00.000Z' : null,
    commerce_template_source: templateId ? 'owner_selected_intake' : null,
    ...overrides,
  }
}

function order(overrides: Partial<CommerceTemplateCheckoutOutcome> = {}): CommerceTemplateCheckoutOutcome {
  return {
    id: 'order-1',
    page_id: 'template-1',
    status: 'paid',
    channel: 'agent_checkout',
    amount_cents: 10_000,
    stripe_livemode: true,
    service_agreement_id: null,
    staged_settlement_agreement_id: null,
    resource_hold_id: null,
    ...overrides,
  }
}

describe('Commerce Template outcome reporting', () => {
  it('compares current readiness and publishing without claiming a fabricated baseline', () => {
    const report = buildCommerceTemplateOutcomeReport({
      templateListings: [
        listing('template-1', 'events.party-rentals'),
        listing('template-2', 'events.party-rentals', { is_published: false, faqs: [] }),
      ],
      unattributedListings: [
        listing('form-1', null, { is_published: false, faqs: [], cta_url: null }),
      ],
      checkoutOrders: [],
      negotiatedDeals: [],
      templateTitles: new Map([['events.party-rentals@1', 'Party Rentals']]),
    })

    expect(report.summary).toMatchObject({
      templateVersions: 1,
      listings: 2,
      publishedListings: 1,
      publishedRate: 50,
    })
    expect(report.templates[0]).toMatchObject({
      title: 'Party Rentals',
      listings: 2,
      publishedListings: 1,
      publishedRate: 50,
    })
    expect(report.templates[0].averageReadiness).toBeGreaterThan(report.noTemplateBenchmark.averageReadiness!)
    expect(report.templates[0].readinessVsNoTemplate).toBeGreaterThan(0)
  })

  it('keeps checkout rails and negotiated escrow separate', () => {
    const report = buildCommerceTemplateOutcomeReport({
      templateListings: [listing('template-1', 'events.party-rentals')],
      unattributedListings: [],
      checkoutOrders: [
        order(),
        order({ id: 'order-2', channel: 'acp' }),
        order({ id: 'order-3', service_agreement_id: 'agreement-1', channel: 'recurring_service' }),
        order({ id: 'order-4', staged_settlement_agreement_id: 'staged-1', channel: 'staged_settlement' }),
        order({ id: 'order-5', resource_hold_id: 'hold-1', channel: 'reservable_resource' }),
        order({ id: 'legacy-negotiation-order', channel: 'negotiation' }),
      ],
      negotiatedDeals: [{
        id: 'deal-1',
        page_id: 'template-1',
        status: 'complete',
        amount_cents: 50_000,
        stripe_livemode: true,
      }],
    })

    expect(report.summary).toMatchObject({
      checkoutOrders: 5,
      checkoutListings: 1,
      negotiatedDeals: 1,
      negotiatedListings: 1,
    })
    expect(report.templates[0].checkout.rails).toEqual({
      hosted_checkout: 1,
      protocol_checkout: 1,
      recurring_service: 1,
      staged_settlement: 1,
      resource_reservation: 1,
    })
    expect(report.templates[0].negotiated).toEqual({ deals: 1, listings: 1 })
  })

  it('excludes tests, reversals, unfinished deals, and unknown lineage', () => {
    const report = buildCommerceTemplateOutcomeReport({
      templateListings: [
        listing('template-1', 'events.party-rentals'),
        listing('invalid', 'events.party-rentals', { commerce_template_source: null }),
      ],
      unattributedListings: [],
      checkoutOrders: [
        order({ id: 'test', stripe_livemode: false }),
        order({ id: 'refund', status: 'refunded' }),
        order({ id: 'dispute', status: 'disputed' }),
      ],
      negotiatedDeals: [
        { id: 'held', page_id: 'template-1', status: 'held', amount_cents: 10_000, stripe_livemode: true },
        { id: 'test-deal', page_id: 'template-1', status: 'complete', amount_cents: 10_000, stripe_livemode: false },
      ],
    })

    expect(report.summary).toMatchObject({ listings: 1, checkoutOrders: 0, negotiatedDeals: 0 })
  })

  it('classifies rail identity before generic channel labels', () => {
    expect(classifyCommerceTemplateCheckoutRail(order({ channel: 'acp' }))).toBe('protocol_checkout')
    expect(classifyCommerceTemplateCheckoutRail(order({ channel: 'acp', resource_hold_id: 'hold-1' }))).toBe('resource_reservation')
    expect(classifyCommerceTemplateCheckoutRail(order({ channel: 'negotiation' }))).toBeNull()
  })

  it('requires durable live money for every successful outcome', () => {
    expect(isSuccessfulCommerceTemplateCheckout(order())).toBe(true)
    expect(isSuccessfulCommerceTemplateCheckout(order({ amount_cents: 0 }))).toBe(false)
    expect(isSuccessfulCommerceTemplateCheckout(order({ status: 'dispute_won' }))).toBe(true)
    expect(isSuccessfulCommerceTemplateNegotiation({
      id: 'deal-1', page_id: 'template-1', status: 'complete', amount_cents: 1, stripe_livemode: true,
    })).toBe(true)
    expect(isSuccessfulCommerceTemplateNegotiation({
      id: 'deal-2', page_id: 'template-1', status: 'complete', amount_cents: 1, stripe_livemode: false,
    })).toBe(false)
  })
})
