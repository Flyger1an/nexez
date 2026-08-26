import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'
import type {
  CommerceTemplateCheckoutOutcome,
  CommerceTemplateNegotiatedOutcome,
  CommerceTemplateOutcomeListing,
} from '../commerce-template-outcomes'

const refs = vi.hoisted(() => ({
  hasAdmin: true,
  operations: [] as QueryContext[],
  templateListings: [] as CommerceTemplateOutcomeListing[],
  unattributedListings: [] as CommerceTemplateOutcomeListing[],
  orders: [] as CommerceTemplateCheckoutOutcome[],
  deals: [] as CommerceTemplateNegotiatedOutcome[],
  checkoutError: null as Error | null,
  benchmarkError: null as Error | null,
}))

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => refs.hasAdmin,
  createAdminClient: () => createSupabaseMock((context) => {
    refs.operations.push(context)
    if (context.table === 'pages') {
      const isForm = context.calls.some((call) => call[0] === 'is' && call[1] === 'commerce_template_id')
      return { data: isForm ? refs.unattributedListings : refs.templateListings, error: isForm ? refs.benchmarkError : null }
    }
    if (context.table === 'checkout_orders') return { data: refs.orders, error: refs.checkoutError }
    if (context.table === 'agent_negotiations') return { data: refs.deals, error: null }
    return { data: null, error: null }
  }),
}))
vi.mock('../observability', () => ({ captureError: vi.fn() }))

import { getCommerceTemplateOutcomeSnapshot } from './commerce-template-outcomes'

function page(id: string, template = true): CommerceTemplateOutcomeListing {
  return {
    id,
    name: 'Party Rentals',
    slug: `party-${id}`,
    description: 'Party rentals for local events.',
    website_url: 'https://example.com',
    cta_url: 'https://example.com/book',
    audience: 'Event hosts',
    industry: 'Party Rentals',
    location: 'Austin, TX',
    contact_email: 'hello@example.com',
    products: [],
    services: [{ name: 'Package', description: '', price: '$100', url: '' }],
    faqs: [{ question: 'Delivery?', answer: 'Yes.' }],
    is_published: true,
    created_at: '2026-08-25T12:00:00.000Z',
    commerce_template_id: template ? 'events.party-rentals' : null,
    commerce_template_version: template ? 1 : null,
    commerce_template_adopted_at: template ? '2026-08-25T12:00:00.000Z' : null,
    commerce_template_source: template ? 'owner_selected_intake' : null,
  }
}

describe('server Commerce Template outcomes', () => {
  beforeEach(() => {
    refs.hasAdmin = true
    refs.operations = []
    refs.templateListings = [page('page-1')]
    refs.unattributedListings = [page('unattributed-1', false)]
    refs.orders = [{
      id: 'order-1', page_id: 'page-1', status: 'paid', channel: 'acp', amount_cents: 10_000,
      stripe_livemode: true, service_agreement_id: null, staged_settlement_agreement_id: null,
      resource_hold_id: null,
    }]
    refs.deals = [{ id: 'deal-1', page_id: 'page-1', status: 'complete', amount_cents: 20_000, stripe_livemode: true }]
    refs.checkoutError = null
    refs.benchmarkError = null
  })

  it('loads private lineage and live outcomes through the service client', async () => {
    const snapshot = await getCommerceTemplateOutcomeSnapshot()
    expect(snapshot).toMatchObject({
      available: true,
      cohortStartedAt: '2026-08-25T12:00:00.000Z',
      summary: { listings: 1, checkoutOrders: 1, negotiatedDeals: 1 },
      lineageListings: [{
        id: 'page-1',
        name: 'Party Rentals',
        slug: 'party-page-1',
        isPublished: true,
        templateId: 'events.party-rentals',
        templateVersion: 1,
        source: 'owner_selected_intake',
      }],
      templates: [{ title: 'Party Rentals' }],
      sources: {
        listings: { available: true },
        benchmark: { available: true },
        checkout: { available: true },
        negotiated: { available: true },
      },
    })
    expect(snapshot.lineageListings[0]).not.toHaveProperty('contact_email')
    expect(snapshot.lineageListings[0]).not.toHaveProperty('owner_id')
    const templateQuery = refs.operations.find((operation) => (
      operation.table === 'pages' && operation.eqs.commerce_template_source === 'owner_selected_intake'
    ))
    expect(templateQuery).toBeDefined()
    expect(refs.operations.find((operation) => operation.table === 'checkout_orders')?.calls)
      .toContainEqual(['eq', 'stripe_livemode', true])
  })

  it('fails closed per money rail instead of turning an unavailable source into zero', async () => {
    refs.checkoutError = new Error('checkout unavailable')
    const snapshot = await getCommerceTemplateOutcomeSnapshot()
    expect(snapshot.sources.checkout.available).toBe(false)
    expect(snapshot.sources.negotiated.available).toBe(true)
    expect(snapshot.summary.checkoutOrders).toBe(0)
    expect(snapshot.summary.negotiatedDeals).toBe(1)
    expect(snapshot.warnings).toContain('Live checkout outcomes are unavailable. Checkout values are not shown as zero.')
  })

  it('marks an unavailable no-template benchmark instead of presenting a zero comparison', async () => {
    refs.benchmarkError = new Error('benchmark unavailable')
    const snapshot = await getCommerceTemplateOutcomeSnapshot()
    expect(snapshot.sources.benchmark.available).toBe(false)
    expect(snapshot.warnings).toContain('Listings without a recorded template are unavailable. Comparison values are not shown as zero.')
  })

  it('returns an unavailable snapshot without a service-role environment', async () => {
    refs.hasAdmin = false
    await expect(getCommerceTemplateOutcomeSnapshot()).resolves.toMatchObject({
      available: false,
      lineageListings: [],
      sources: {
        listings: { available: false },
        benchmark: { available: false },
        checkout: { available: false },
        negotiated: { available: false },
      },
    })
    expect(refs.operations).toEqual([])
  })
})
