import { describe, expect, it } from 'vitest'
import { handleMcpRequest, handleStorefrontMcpRequest, MCP_PROTOCOL_VERSION } from '../mcp-server'
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
  it('tools/call book_offer honors an offer-level provider preference', () => {
    const shopifyUrl = 'https://nexez-tester.myshopify.com/products/agent-ready-cap'
    const shopifyPage = {
      ...page,
      services: [{
        name: 'Agent-ready cap',
        description: 'A cap',
        price: '$30',
        url: shopifyUrl,
        source: 'shopify',
        prefer_original_for_this: true,
      }],
    } as AgentPage
    const r = handleMcpRequest(shopifyPage, base, {
      id: 4,
      method: 'tools/call',
      params: { name: 'book_offer', arguments: { offer: 'services-0' } },
    })
    expect((r.result as any).content[0].text).toContain(shopifyUrl)
  })
  it('unknown method → JSON-RPC error', () => {
    const r = handleMcpRequest(page, base, { id: 5, method: 'bogus' })
    expect(r.error?.code).toBe(-32601)
  })
})

const pageB = {
  id: 'p2', name: 'Beta Co', slug: 'beta', is_published: true,
  services: [{ name: 'Setup', description: 'Onboarding', price: '$50', url: '' }],
  products: [], faqs: [],
} as unknown as AgentPage
const listings = [page, pageB]

describe('handleStorefrontMcpRequest (per-merchant)', () => {
  it('initialize → storefront serverInfo', () => {
    const r = handleStorefrontMcpRequest('acme-store', listings, base, { id: 1, method: 'initialize' })
    expect((r.result as any).protocolVersion).toBe(MCP_PROTOCOL_VERSION)
    expect((r.result as any).serverInfo.name).toBe('nexez:store:acme-store')
  })

  it('tools require slug + offer, and negotiate_offer is gated', () => {
    const allowed = handleStorefrontMcpRequest('acme-store', listings, base, { id: 2, method: 'tools/list' }, { negotiationAllowed: true })
    const book = (allowed.result as any).tools.find((t: any) => t.name === 'book_offer')
    expect(book.inputSchema.required).toEqual(['slug', 'offer'])
    expect((allowed.result as any).tools.map((t: any) => t.name)).toContain('negotiate_offer')

    const gated = handleStorefrontMcpRequest('acme-store', listings, base, { id: 2, method: 'tools/list' })
    expect((gated.result as any).tools.map((t: any) => t.name)).not.toContain('negotiate_offer')
  })

  it('resources/list aggregates every listing + its offers (namespaced by slug), no raw fields', () => {
    const r = handleStorefrontMcpRequest('acme-store', listings, base, { id: 3, method: 'resources/list' })
    const uris = (r.result as any).resources.map((x: any) => x.uri)
    expect(uris.some((u: string) => u.endsWith('/store/acme-store/agent.json'))).toBe(true)
    expect(uris.some((u: string) => u.endsWith('/acme/agent.json'))).toBe(true)
    expect(uris.some((u: string) => u.endsWith('/beta/agent.json'))).toBe(true)
    expect(uris.some((u: string) => u.includes('/acme#services-0'))).toBe(true)
    expect(uris.some((u: string) => u.includes('/beta#services-0'))).toBe(true)
    // Never serialize raw offer arrays / private rules.
    const raw = JSON.stringify((r.result as any).resources)
    expect(raw).not.toContain('"products"')
    expect(raw).not.toContain('"services"')
    expect(raw).not.toContain('"rules"')
  })

  it('book_offer routes a valid slug+offer to that listing’s checkout', () => {
    const r = handleStorefrontMcpRequest('acme-store', listings, base, {
      id: 4, method: 'tools/call', params: { name: 'book_offer', arguments: { slug: 'beta', offer: 'services-0' } },
    })
    expect((r.result as any).content[0].text).toContain('/checkout/beta')
  })

  it('CROSS-TENANT GUARD: book_offer rejects a slug not in this storefront', () => {
    const r = handleStorefrontMcpRequest('acme-store', listings, base, {
      id: 5, method: 'tools/call', params: { name: 'book_offer', arguments: { slug: 'someone-elses-listing', offer: 'services-0' } },
    })
    expect(r.error?.code).toBe(-32602)
    expect(r.result).toBeUndefined()
  })

  it('book_offer rejects an unknown offer key within an owned listing', () => {
    const r = handleStorefrontMcpRequest('acme-store', listings, base, {
      id: 6, method: 'tools/call', params: { name: 'book_offer', arguments: { slug: 'acme', offer: 'products-9' } },
    })
    expect(r.error?.code).toBe(-32602)
  })
})
