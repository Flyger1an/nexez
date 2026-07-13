import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = { storefront: null as unknown }

vi.mock('../../../../lib/server/storefront', () => ({
  loadStorefrontByHandle: vi.fn(async () => state.storefront),
}))
vi.mock('../../../../lib/server/plan', () => ({ ownerAllows: vi.fn(async () => false) }))
vi.mock('../../../../utils/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})) }))

import { GET } from './route'

const page = {
  id: 'p', name: 'Acme', slug: 'acme', is_published: true,
  services: [{ name: 'Consult', price: '$100', url: '' }], products: [], faqs: [],
}
const ctx = (handle: string) => ({ params: Promise.resolve({ handle }) })
const req = () => new Request('https://nexez.app/store/acme-store/mcp.json')

describe('GET /store/[handle]/mcp.json', () => {
  beforeEach(() => { state.storefront = null })

  it('404 for an unknown storefront', async () => {
    expect((await GET(req(), ctx('nope'))).status).toBe(404)
  })

  it('returns the manifest pointing at the live endpoint + Vary', async () => {
    state.storefront = { storefront: { handle: 'acme-store', owner_id: 'o1' }, listings: [page] }
    const res = await GET(req(), ctx('acme-store'))
    expect(res.status).toBe(200)
    expect((res.headers.get('vary') || '').toLowerCase()).toContain('x-forwarded-host')
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    const j = await res.json()
    expect(j._nexez.mcp_endpoint).toMatch(/\/store\/acme-store\/mcp$/)
    expect(j.tools.find((t: { name: string }) => t.name === 'book_offer').inputSchema.required).toEqual(['slug', 'offer'])
    expect(j.resources.some((r: { uri: string }) => r.uri.includes('/acme#services-0'))).toBe(true)
  })
})
