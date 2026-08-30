import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbRef, storefrontRef, reviewRef } = vi.hoisted(() => ({
  dbRef: {
    pages: [] as any[],
    handler: (_c: any) => ({ data: [] as any[], error: null }) as { data?: any; error?: any },
  },
  storefrontRef: { handles: new Map<string, string>() },
  reviewRef: { summaries: new Map<string, any>() },
}))

vi.mock('../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../test/supabase-mock')
  return { supabase: createSupabaseMock((c) => dbRef.handler(c)) }
})

vi.mock('../../lib/server/storefront', () => ({
  loadStorefrontHandlesForSlugs: vi.fn(async () => storefrontRef.handles),
}))
vi.mock('../../lib/server/reviews', () => ({
  loadReviewSummariesForSlugs: vi.fn(async () => reviewRef.summaries),
}))

import { loadStorefrontHandlesForSlugs } from '../../lib/server/storefront'
import { loadReviewSummariesForSlugs } from '../../lib/server/reviews'
import { GET } from './route'

const pages = [
  {
    name: 'Demo Co',
    slug: 'demo',
    description: 'A demo business.',
    location: 'Remote',
    products: [],
    services: [{ name: 'Consult', price: '$100', description: 'A call', url: '' }],
    created_at: '2026-01-01T00:00:00Z',
    currency: 'usd',
    website_url: 'https://demo.example.com',
    cta_url: 'https://demo.example.com/book',
    audience: 'startups',
    industry: 'Consulting',
    contact_email: 'hi@demo.example.com',
    faqs: [],
    is_published: true,
  },
  {
    name: 'Solo Co',
    slug: 'solo',
    description: 'A solo listing.',
    location: 'Austin',
    products: [],
    services: [],
    created_at: '2026-01-01T00:00:00Z',
    currency: 'usd',
    website_url: 'https://solo.example.com',
    cta_url: 'https://solo.example.com/book',
    audience: 'local buyers',
    industry: 'Services',
    contact_email: 'hi@solo.example.com',
    faqs: [],
    is_published: true,
  },
  {
    name: 'Direct Only Co',
    slug: 'direct-only-co',
    description: 'A directly reachable listing excluded from marketplace discovery.',
    location: 'Remote',
    products: [],
    services: [{ name: 'Private consult', price: '$100', description: 'A direct-only call', url: '' }],
    created_at: '2026-01-01T00:00:00Z',
    currency: 'usd',
    website_url: 'https://direct-only.example.com',
    cta_url: 'https://direct-only.example.com/book',
    audience: 'invited buyers',
    industry: 'Consulting',
    contact_email: 'hi@direct-only.example.com',
    faqs: [],
    is_published: true,
    marketplace_discoverable: false,
  },
  {
    name: 'Nexez Party Rentals Certification',
    slug: 'nexez-party-rentals-certification',
    description: 'Internal certification fixture.',
    location: 'Remote',
    products: [],
    services: [{ name: 'Certification run', price: '$1', description: 'Internal.', url: '' }],
    created_at: '2026-01-01T00:00:00Z',
    currency: 'usd',
    website_url: 'https://nexez.test',
    cta_url: 'https://nexez.test',
    audience: 'operators',
    industry: 'Testing',
    contact_email: 'test@nexez.test',
    faqs: [],
    is_published: true,
  },
]

describe('GET /agent-pages.json', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storefrontRef.handles = new Map()
    reviewRef.summaries = new Map()
    dbRef.pages = pages
    dbRef.handler = (ctx: any) => (ctx.table === 'pages_public' ? { data: dbRef.pages, error: null } : { data: null, error: null })
  })

  it('adds optional storefront fields to indexed listings', async () => {
    storefrontRef.handles = new Map([['demo', 'demo-store']])

    const res = await GET(new Request('https://nexez.app/agent-pages.json'))
    expect(res.status).toBe(200)
    // Out of Google's index (agents discover this via .well-known, not search).
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    const body = await res.json()

    expect(loadStorefrontHandlesForSlugs).toHaveBeenCalledWith(['demo', 'solo'])
    expect(body.pages[0].slug).toBe('demo')
    expect(body.pages[0].consumer_visible).toBe(true)
    expect(body.pages[0].storefront_handle).toBe('demo-store')
    expect(body.pages[0].storefront_url).toMatch(/^https:\/\/.+\/store\/demo-store$/)
    expect(body.pages[0].storefront_agent_json_url).toMatch(/^https:\/\/.+\/store\/demo-store\/agent\.json$/)
    expect(body.pages[1].storefront_handle).toBeUndefined()
    expect(body.pages.map((page: { slug: string }) => page.slug)).not.toContain('direct-only-co')
    expect(body.pages.map((page: { slug: string }) => page.slug)).not.toContain('nexez-party-rentals-certification')
  })

  it('adds rating summaries when verified reviews exist', async () => {
    reviewRef.summaries = new Map([
      ['demo', {
        average: 4.8,
        count: 12,
        verified_count: 12,
        reputation_score: 4.62,
        distribution: { '1': 0, '2': 0, '3': 1, '4': 2, '5': 9 },
        recent_positive_tags: [{ label: 'Fast response', count: 6 }],
        recent_reviews: [],
      }],
    ])

    const res = await GET(new Request('https://nexez.app/agent-pages.json'))
    const body = await res.json()

    expect(loadReviewSummariesForSlugs).toHaveBeenCalledWith(['demo', 'solo'], 0)
    expect(body.pages[0].rating_summary).toMatchObject({
      average: 4.8,
      count: 12,
      reputation_score: 4.62,
    })
    expect(body.pages[1].rating_summary).toBeNull()
  })

  it('indexes a provider-preferred Shopify import as a product with its Shopify URL', async () => {
    const shopifyUrl = 'https://nexez-tester.myshopify.com/products/agent-ready-cap'
    dbRef.pages = [{
      ...pages[0],
      services: [{
        name: 'Agent-ready cap',
        description: 'A cap',
        price: '$30',
        url: shopifyUrl,
        source: 'shopify',
        prefer_original_for_this: true,
        metadata: { commerce_provider: 'shopify' },
      }],
      prefer_original_site: false,
    }]

    const res = await GET(new Request('https://nexez.app/agent-pages.json'))
    const body = await res.json()

    expect(body.pages[0].checkout_urls[0]).toMatchObject({
      type: 'product',
      url: shopifyUrl,
      provider_url: shopifyUrl,
      prefer_original_for_this: true,
    })
    expect(body.pages[0].checkout_urls[0].action).toBeNull()
  })
})
