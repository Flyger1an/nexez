import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbRef, storefrontRef } = vi.hoisted(() => ({
  dbRef: { handler: (_c: any) => ({ data: null, error: null }) as { data?: any; error?: any } },
  storefrontRef: { handle: null as string | null },
}))

vi.mock('../../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../../test/supabase-mock')
  return { supabase: createSupabaseMock((c) => dbRef.handler(c)) }
})
vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/server')>()), after: () => {} }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('../../../lib/server/log-agent-page-view', () => ({ logAgentPageView: vi.fn() }))
vi.mock('../../../lib/server/storefront', () => ({
  loadStorefrontHandleForSlug: vi.fn(async () => storefrontRef.handle),
}))

import { GET } from './route'

const demoPage = {
  id: 'p1',
  owner_id: 'o1',
  slug: 'demo',
  name: 'Demo Co',
  description: 'A demo business.',
  website_url: 'https://demo.example.com',
  cta_url: 'https://demo.example.com/book',
  cta_label: 'Book',
  audience: 'startups',
  location: 'Remote',
  contact_email: 'hi@demo.example.com',
  industry: 'Consulting',
  services: [{ name: 'Consult', price: '$100', description: 'A call', url: '' }],
  products: [],
  faqs: [{ question: 'q', answer: 'a' }],
  is_published: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  branding: null,
}

const req = () => new Request('https://nexez.test/demo/agent.json')
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) })

describe('GET /[slug]/agent.json', () => {
  beforeEach(() => {
    dbRef.handler = () => ({ data: null, error: null })
    storefrontRef.handle = null
  })

  it('returns the agent manifest JSON for a published page', async () => {
    dbRef.handler = () => ({ data: demoPage, error: null })
    const res = await GET(req(), ctx('demo'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    const body = await res.json()
    expect(JSON.stringify(body)).toContain('demo') // references the page
  })

  it('includes storefront context when the listing owner has a storefront', async () => {
    dbRef.handler = () => ({ data: demoPage, error: null })
    storefrontRef.handle = 'demo-store'
    const res = await GET(req(), ctx('demo'))
    const body = await res.json()
    expect(body.storefront.handle).toBe('demo-store')
    expect(body.storefront.url).toMatch(/^https:\/\/.+\/store\/demo-store$/)
    expect(body.storefront.agent_json_url).toMatch(/^https:\/\/.+\/store\/demo-store\/agent\.json$/)
    expect(body.plain_text).toContain(`Storefront: ${body.storefront.url}`)
  })

  it('calls notFound() for a missing/unpublished page', async () => {
    dbRef.handler = () => ({ data: null, error: { message: 'none' } })
    await expect(GET(req(), ctx('missing'))).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
