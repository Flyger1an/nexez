import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = { limited: false, storefront: null as unknown }

vi.mock('../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => (state.limited ? new Response('rate', { status: 429 }) : null)),
}))
vi.mock('../../../../lib/server/storefront', () => ({
  loadStorefrontByHandle: vi.fn(async () => state.storefront),
}))
vi.mock('../../../../lib/server/plan', () => ({ ownerAllows: vi.fn(async () => false) }))
vi.mock('../../../../utils/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})) }))

import { GET, POST } from './route'

const page = {
  id: 'p', name: 'Acme', slug: 'acme', is_published: true,
  services: [{ name: 'Consult', price: '$100', url: '' }], products: [], faqs: [],
}
const sf = (listings: unknown[]) => ({ storefront: { handle: 'acme-store', owner_id: 'o1' }, listings })

const post = (body: unknown, handle = 'acme-store') =>
  POST(
    new Request(`https://nexez.app/store/${handle}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ handle }) },
  )

describe('POST /store/[handle]/mcp', () => {
  beforeEach(() => {
    state.limited = false
    state.storefront = null
  })

  it('404 for an unknown storefront', async () => {
    expect((await post({ id: 1, method: 'initialize' })).status).toBe(404)
  })

  it('429 when rate-limited (before any work)', async () => {
    state.limited = true
    expect((await post({ id: 1, method: 'initialize' })).status).toBe(429)
  })

  it('initialize works for a live storefront', async () => {
    state.storefront = sf([page])
    const json = await (await post({ id: 1, method: 'initialize' })).json()
    expect(json.result.serverInfo.name).toBe('nexez:store:acme-store')
  })

  it('PAUSED owner (listings:[]) → book_offer rejected + no listing leaked', async () => {
    state.storefront = sf([]) // loadStorefrontByHandle returns empty listings when paused
    const booked = await (await post({ id: 1, method: 'tools/call', params: { name: 'book_offer', arguments: { slug: 'acme', offer: 'services-0' } } })).json()
    expect(booked.error.code).toBe(-32602)
    const res = await (await post({ id: 2, method: 'resources/list' })).json()
    expect(JSON.stringify(res.result.resources)).not.toContain('/acme/agent.json')
  })

  it('-32700 on malformed JSON', async () => {
    state.storefront = sf([page])
    const res = await post('{not json')
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe(-32700)
  })

  it('413 over the batch cap', async () => {
    state.storefront = sf([page])
    const res = await post(Array.from({ length: 26 }, (_, i) => ({ id: i, method: 'ping' })))
    expect(res.status).toBe(413)
  })

  it('GET returns a hint pointing at the manifest', async () => {
    state.storefront = sf([page])
    const res = await GET(new Request('https://nexez.app/store/acme-store/mcp'), { params: Promise.resolve({ handle: 'acme-store' }) })
    expect((await res.json()).static_manifest).toContain('/store/acme-store/mcp.json')
  })
})
