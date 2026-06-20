import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbRef, storefrontRef } = vi.hoisted(() => ({
  dbRef: {
    pages: [] as any[],
    handler: (_c: any) => ({ data: [] as any[], error: null }) as { data?: any; error?: any },
  },
  storefrontRef: { handles: new Map<string, string>() },
}))

vi.mock('../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../test/supabase-mock')
  return { supabase: createSupabaseMock((c) => dbRef.handler(c)) }
})

vi.mock('../../lib/server/storefront', () => ({
  loadStorefrontHandlesForSlugs: vi.fn(async () => storefrontRef.handles),
}))

import { loadStorefrontHandlesForSlugs } from '../../lib/server/storefront'
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
]

describe('GET /agent-pages.json', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storefrontRef.handles = new Map()
    dbRef.pages = pages
    dbRef.handler = (ctx: any) => (ctx.table === 'pages_public' ? { data: dbRef.pages, error: null } : { data: null, error: null })
  })

  it('adds optional storefront fields to indexed listings', async () => {
    storefrontRef.handles = new Map([['demo', 'demo-store']])

    const res = await GET(new Request('https://nexez.app/agent-pages.json'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(loadStorefrontHandlesForSlugs).toHaveBeenCalledWith(['demo', 'solo'])
    expect(body.pages[0].slug).toBe('demo')
    expect(body.pages[0].storefront_handle).toBe('demo-store')
    expect(body.pages[0].storefront_url).toMatch(/^https:\/\/.+\/store\/demo-store$/)
    expect(body.pages[0].storefront_agent_json_url).toMatch(/^https:\/\/.+\/store\/demo-store\/agent\.json$/)
    expect(body.pages[1].storefront_handle).toBeUndefined()
  })
})
