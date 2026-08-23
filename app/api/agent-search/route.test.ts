import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbRef } = vi.hoisted(() => ({
  dbRef: { handler: (_c: any) => ({ data: [] as any[], error: null }) as { data?: any; error?: any } },
}))

vi.mock('../../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../../test/supabase-mock')
  return { supabase: createSupabaseMock((c) => dbRef.handler(c)) }
})
vi.mock('../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => null),
}))
vi.mock('../../../lib/server/storefront', () => ({
  loadStorefrontHandlesForSlugs: vi.fn(async () => new Map()),
}))
vi.mock('../../../lib/server/reviews', () => ({
  loadReviewSummariesForSlugs: vi.fn(async () => new Map()),
}))
vi.mock('../../../lib/server/public-commerce-capabilities', () => ({
  resolvePublicCommerceCapabilities: vi.fn(async () => ({
    negotiationEligibleSlugs: new Set(['demo']),
    checkoutReadySlugs: new Set(['demo']),
  })),
}))

import { GET } from './route'

const pages = [
  {
    name: 'Demo Co',
    slug: 'demo',
    description: 'Consulting for startups.',
    location: 'Remote',
    products: [],
    services: [{ name: 'Consult', price: '$100', description: 'A call', url: '' }],
    faqs: [],
    is_published: true,
    created_at: '2026-01-01T00:00:00Z',
  },
]

describe('GET /api/agent-search', () => {
  beforeEach(() => {
    dbRef.handler = (ctx: any) => (ctx.table === 'pages_public' ? { data: pages, error: null } : { data: null, error: null })
  })

  it('returns results cached + noindexed (agents still query it; Google never indexes it)', async () => {
    const res = await GET(new Request('https://nexez.test/api/agent-search?q=consult'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('public')
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    const body = await res.json()
    expect(body.schema_version).toBe('nexez.agent-search.v1')
    expect(body.ranking_policy).toBe('nexez.discovery-ranking.v1')
    expect(body.result_count).toBeGreaterThan(0)
    expect(body.results[0].marketplace).toMatchObject({
      has_actionable_offer: true,
      nexez_checkout_ready: true,
    })
    expect(body.results[0].ranking).toMatchObject({
      policy_version: 'nexez.discovery-ranking.v1',
      relevance: expect.any(Number),
      review_evidence: 'cold-start',
    })
  })

  it('returns coordinates as context without claiming they filter results', async () => {
    const res = await GET(
      new Request('https://nexez.test/api/agent-search?q=consult&lat=41.8781&lng=-87.6298'),
    )
    const body = await res.json()

    expect(body.result_count).toBeGreaterThan(0)
    expect(body.location_filter).toMatchObject({
      active: false,
      query: null,
      lat: 41.8781,
      lng: -87.6298,
    })
    expect(body.location_filter.matching).toContain('do not filter or rerank')
    expect(body.search_url).toContain('lat=41.8781')
    expect(body.search_url).toContain('lng=-87.6298')
    expect(body.usage.note).toContain('context metadata only')
  })

  it('applies structured filters and returns an explainable canonical search URL', async () => {
    const filteredPages = [{
      ...pages[0],
      industry: 'Management Consulting',
      custom_domain_verified: true,
      services: [{
        ...pages[0].services[0],
        offerType: 'negotiable',
      }],
    }]
    dbRef.handler = (ctx: any) =>
      ctx.table === 'pages_public' ? { data: filteredPages, error: null } : { data: null, error: null }

    const res = await GET(new Request(
      'https://nexez.test/api/agent-search?q=consult&industry=consulting&verified=true&supports_negotiation=true&price_band=100_500&min_readiness=10',
    ))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.result_count).toBe(1)
    expect(body.filters).toMatchObject({
      industry: 'consulting',
      verified: true,
      supports_negotiation: true,
      price_band: '100_500',
      min_readiness: 10,
    })
    expect(body.results[0].match_reasons.length).toBeGreaterThan(0)
    expect(body.search_url).toContain('supports_negotiation=true')
  })

  it('rejects invalid structured filter values', async () => {
    const res = await GET(new Request('https://nexez.test/api/agent-search?q=consult&verified=yes'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('invalid_search_filter')
  })

  it('validates the authoritative checkout-readiness filter', async () => {
    const valid = await GET(new Request('https://nexez.test/api/agent-search?q=consult&nexez_checkout_ready=true'))
    expect(valid.status).toBe(200)
    expect((await valid.json()).result_count).toBeGreaterThan(0)

    const invalid = await GET(new Request('https://nexez.test/api/agent-search?q=consult&nexez_checkout_ready=yes'))
    expect(invalid.status).toBe(400)
  })
})
