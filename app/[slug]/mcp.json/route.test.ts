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
vi.mock('../../../lib/server/log-agent-page-view', () => ({ logAgentPageView: vi.fn() }))
vi.mock('../../../lib/server/storefront', () => ({
  loadStorefrontHandleForSlug: vi.fn(async () => storefrontRef.handle),
}))

import { GET } from './route'

const basePage = {
  id: 'p1',
  owner_id: 'o1',
  slug: 'demo',
  name: 'Demo Co',
  description: 'A demo business.',
  website_url: 'https://demo.example.com',
  cta_url: 'https://demo.example.com/book',
  services: [{ name: 'Consult', price: '$100', description: '', url: '' }],
  products: [],
  faqs: [],
  is_published: true,
}

const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) })
const req = () => new Request('https://nexez.test/demo/mcp.json')

describe('GET /[slug]/mcp.json', () => {
  beforeEach(() => {
    dbRef.handler = () => ({ data: null, error: null })
    storefrontRef.handle = null
  })

  it('404 when MCP is not enabled for the page', async () => {
    dbRef.handler = () => ({ data: { ...basePage, mcp_enabled: false }, error: null })
    expect((await GET(req(), ctx('demo'))).status).toBe(404)
  })

  it('returns an MCP manifest (resources + tools) when mcp_enabled', async () => {
    dbRef.handler = () => ({ data: { ...basePage, mcp_enabled: true }, error: null })
    const res = await GET(req(), ctx('demo'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.protocol_version).toBeTruthy()
    expect(Array.isArray(body.resources)).toBe(true)
    expect(body.tools.map((t: any) => t.name)).toContain('book_offer')
  })

  it('adds a storefront resource when the listing belongs to a storefront', async () => {
    dbRef.handler = () => ({ data: { ...basePage, mcp_enabled: true }, error: null })
    storefrontRef.handle = 'demo-store'
    const res = await GET(req(), ctx('demo'))
    const body = await res.json()
    expect(body.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          uri: expect.stringMatching(/^https:\/\/.+\/store\/demo-store\/agent\.json$/),
          name: 'Agent Storefront Manifest',
        }),
      ]),
    )
    expect(body._nexez.nexez_payload.storefront.handle).toBe('demo-store')
  })
})
