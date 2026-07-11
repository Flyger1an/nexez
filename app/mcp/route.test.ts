import { describe, it, expect, vi, beforeEach } from 'vitest'

let limited = false
vi.mock('../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => (limited ? new Response('rate', { status: 429 }) : null)),
  clientIp: vi.fn(() => '1.2.3.4'),
}))
vi.mock('../../lib/mcp-platform', () => ({
  handlePlatformMcpRequest: vi.fn(async (r: { id?: unknown; method?: string }) => ({ jsonrpc: '2.0', id: r.id ?? null, result: { echoed: r.method } })),
}))

import { GET, POST } from './route'

const post = (body: unknown) =>
  POST(new Request('https://nexez.app/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }))

describe('/mcp platform route', () => {
  beforeEach(() => {
    limited = false
  })

  it('GET → transport hint pointing at the discovery catalog', async () => {
    const j = await (await GET(new Request('https://nexez.app/mcp'))).json()
    expect(j.transport).toBe('http-jsonrpc')
    expect(j.static_manifest).toContain('/.well-known/mcp.json')
  })

  it('429 when rate-limited (before any work)', async () => {
    limited = true
    expect((await post({ id: 1, method: 'initialize' })).status).toBe(429)
  })

  it('-32700 on malformed JSON', async () => {
    const res = await post('{bad')
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe(-32700)
  })

  it('413 over the batch cap', async () => {
    expect((await post(Array.from({ length: 26 }, (_, i) => ({ id: i, method: 'ping' })))).status).toBe(413)
  })

  it('dispatches a single request', async () => {
    expect((await (await post({ id: 9, method: 'initialize' })).json()).result.echoed).toBe('initialize')
  })

  it('dispatches a bounded batch', async () => {
    const j = await (await post([{ id: 1, method: 'ping' }, { id: 2, method: 'tools/list' }])).json()
    expect(j.length).toBe(2)
  })
})
