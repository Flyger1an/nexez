import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbRef } = vi.hoisted(() => ({
  dbRef: { handler: (_c: unknown) => ({ data: null as unknown, error: null as unknown }) },
}))

vi.mock('../../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../../test/supabase-mock')
  return { supabase: createSupabaseMock((c) => dbRef.handler(c)) }
})
vi.mock('../../../lib/observability', () => ({ captureEvent: vi.fn(), captureError: vi.fn() }))

import { GET, OPTIONS } from './route'

const demoPage = {
  id: 'p1',
  owner_id: 'o1',
  slug: 'demo',
  name: 'Demo Co',
  description: 'A demo business.',
  website_url: 'https://demo.example.com',
  services: [{ name: 'Consult', price: '$100', description: 'A call', url: '' }],
  products: [],
  faqs: [],
  is_published: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
}

const req = () => new Request('https://nexez.test/demo/embed.json')
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) })

describe('GET /[slug]/embed.json', () => {
  beforeEach(() => {
    dbRef.handler = () => ({ data: null, error: null })
  })

  it('returns the injectable manifest for a published page (CORS + Vary preserved)', async () => {
    dbRef.handler = () => ({ data: demoPage, error: null })
    const res = await GET(req(), ctx('demo'))
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect((res.headers.get('vary') || '').toLowerCase()).toContain('x-forwarded-host')
    expect(res.headers.get('x-robots-tag')).toBe('noindex')

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.slug).toBe('demo')

    // Structured consumers receive JSON data rather than needing to trust HTML.
    expect(body.structuredData['@context']).toBe('https://schema.org')
    expect(JSON.stringify(body.structuredData)).toContain('Consult')
    expect(body.structuredData.url).toBe('https://demo.example.com')
    expect(body.structuredData.mainEntity.url).toBe('https://demo.example.com')
    expect(body.structuredData.mainEntity.makesOffer[0].url).toBe('https://nexez.test/checkout/demo?offer=services-0')

    // Legacy HTML remains parseable for existing non-WordPress embedders.
    expect(body.jsonld.startsWith('<script type="application/ld+json">')).toBe(true)
    const inner = body.jsonld.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')
    const ld = JSON.parse(inner)
    expect(ld['@context']).toBe('https://schema.org')
    expect(JSON.stringify(ld)).toContain('Consult')
    expect(ld.url).toBe('https://demo.example.com')
    expect(ld.mainEntity.url).toBe('https://demo.example.com')
    expect(ld.mainEntity.makesOffer[0].url).toBe('https://nexez.test/checkout/demo?offer=services-0')

    // Self-references the merchant's own domain.
    expect(body.websiteBase).toBe('https://demo.example.com')

    // Absolute artifact URLs anchored at the listing.
    expect(body.artifacts.agentJson.startsWith('http')).toBe(true)
    expect(body.artifacts.agentJson).toMatch(/\/demo\/agent\.json$/)
    expect(body.artifacts.badge).toMatch(/\/demo\/badge\.svg$/)

    // Redirect map covers the well-known + core paths.
    const froms = body.redirects.map((r: { from: string }) => r.from)
    expect(froms).toContain('/.well-known/agent.json')
    expect(froms).toContain('/llms.txt')
    // metaHint is a template only - never a real token.
    expect(body.metaHint).toContain('YOUR_VERIFICATION_TOKEN')
  })

  it('falls back websiteBase to the platform listing URL when no website_url', async () => {
    dbRef.handler = () => ({ data: { ...demoPage, website_url: null }, error: null })
    const body = await (await GET(req(), ctx('demo'))).json()
    expect(body.websiteBase).toMatch(/\/demo$/)
    expect(body.structuredData.url).toBe('https://nexez.test/demo')
    const inner = body.jsonld.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')
    const ld = JSON.parse(inner)
    expect(ld.url).toBe('https://nexez.test/demo')
    expect(ld.mainEntity.makesOffer[0].url).toBe('https://nexez.test/checkout/demo?offer=services-0')
  })

  it('does NOT leak owner-private verification fields', async () => {
    dbRef.handler = () => ({
      data: { ...demoPage, website_verified_at: '2029-09-09T00:00:00Z', website_verified_method: 'file' },
      error: null,
    })
    const raw = JSON.stringify(await (await GET(req(), ctx('demo'))).json())
    expect(raw).not.toContain('website_verified')
    expect(raw).not.toContain('2029-09-09T00:00:00Z')
  })

  it('includes the /mcp.json redirect + artifact only when MCP is enabled', async () => {
    dbRef.handler = () => ({ data: { ...demoPage, mcp_enabled: true }, error: null })
    const body = await (await GET(req(), ctx('demo'))).json()
    expect(body.redirects.map((r: { from: string }) => r.from)).toContain('/mcp.json')
    expect(body.artifacts.mcp).toMatch(/\/demo\/mcp\.json$/)
  })

  it('omits the /mcp.json redirect when MCP is off (would 404)', async () => {
    dbRef.handler = () => ({ data: demoPage, error: null })
    const body = await (await GET(req(), ctx('demo'))).json()
    expect(body.redirects.map((r: { from: string }) => r.from)).not.toContain('/mcp.json')
    expect(body.artifacts.mcp).toBeNull()
  })

  it('404 (with CORS) for a missing/unpublished page', async () => {
    dbRef.handler = () => ({ data: null, error: { message: 'none' } })
    const res = await GET(req(), ctx('missing'))
    expect(res.status).toBe(404)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('OPTIONS preflight → 204 with CORS methods', () => {
    const res = OPTIONS()
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-methods')).toContain('GET')
  })
})
