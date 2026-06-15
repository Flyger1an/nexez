import { describe, expect, it } from 'vitest'
import { handleMcpRequest, MCP_PROTOCOL_VERSION } from '../mcp-server'
import type { AgentPage } from '../agent-page'

const page = {
  id: 'p', name: 'Acme', slug: 'acme', is_published: true,
  services: [{ name: 'Consult', description: 'A consult', price: '$100', url: '' }],
  products: [], faqs: [],
} as unknown as AgentPage
const base = 'https://nexez.vercel.app'

describe('handleMcpRequest', () => {
  it('initialize returns protocol + serverInfo', () => {
    const r = handleMcpRequest(page, base, { jsonrpc: '2.0', id: 1, method: 'initialize' })
    expect((r.result as any).protocolVersion).toBe(MCP_PROTOCOL_VERSION)
    expect((r.result as any).serverInfo.name).toBe('nexez:acme')
  })
  it('tools/list includes negotiate_offer ONLY when negotiation is allowed', () => {
    const allowed = handleMcpRequest(page, base, { id: 2, method: 'tools/list' }, { negotiationAllowed: true })
    const allowedNames = (allowed.result as any).tools.map((t: any) => t.name)
    expect(allowedNames).toContain('book_offer')
    expect(allowedNames).toContain('negotiate_offer')

    // Default (plan doesn't allow / no negotiable offer): book_offer only.
    const gated = handleMcpRequest(page, base, { id: 2, method: 'tools/list' })
    const gatedNames = (gated.result as any).tools.map((t: any) => t.name)
    expect(gatedNames).toContain('book_offer')
    expect(gatedNames).not.toContain('negotiate_offer')
  })

  it('tools/call negotiate_offer is rejected when negotiation is not allowed', () => {
    const r = handleMcpRequest(page, base, { id: 6, method: 'tools/call', params: { name: 'negotiate_offer', arguments: { offer: 'services-0' } } })
    expect(r.error?.code).toBe(-32601)
  })
  it('resources/list includes agent.json + offers', () => {
    const r = handleMcpRequest(page, base, { id: 3, method: 'resources/list' })
    const uris = (r.result as any).resources.map((x: any) => x.uri)
    expect(uris.some((u: string) => u.endsWith('/acme/agent.json'))).toBe(true)
  })
  it('tools/call book_offer returns a target URL', () => {
    const r = handleMcpRequest(page, base, { id: 4, method: 'tools/call', params: { name: 'book_offer', arguments: { offer: 'services-0' } } })
    expect((r.result as any).content[0].text).toContain('/checkout/acme')
  })
  it('unknown method → JSON-RPC error', () => {
    const r = handleMcpRequest(page, base, { id: 5, method: 'bogus' })
    expect(r.error?.code).toBe(-32601)
  })
})
