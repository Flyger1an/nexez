import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbRef } = vi.hoisted(() => ({
  dbRef: { handler: (_c: any) => ({ data: null, error: null }) as { data?: any; error?: any } },
}))

vi.mock('../../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../../test/supabase-mock')
  return { supabase: createSupabaseMock((c) => dbRef.handler(c)) }
})

import { GET } from './route'

const demoPage = {
  id: 'p1',
  owner_id: 'o1',
  slug: 'demo',
  name: 'Demo Co',
  description: 'A demo business.',
  website_url: 'https://demo.example.com',
  services: [
    { name: 'Consult', price: '$100', description: 'A call', url: '' },
    { name: 'Audit', price: '$500', description: 'A review', url: '' },
  ],
  products: [],
  faqs: [],
  is_published: true,
}

const req = (url = 'https://nexez.test/demo/openapi.json') => new Request(url)
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) })

describe('GET /[slug]/openapi.json', () => {
  beforeEach(() => {
    dbRef.handler = () => ({ data: null, error: null })
  })

  it('404s when no published page matches', async () => {
    const res = await GET(req(), ctx('missing'))
    expect(res.status).toBe(404)
  })

  it('serves a page-scoped spec: slug + real offer keys pinned', async () => {
    dbRef.handler = () => ({ data: demoPage, error: null })
    const res = await GET(req(), ctx('demo'))
    expect(res.status).toBe(200)
    const spec = await res.json()
    expect(spec.openapi).toBe('3.1.0')
    expect(spec.info.title).toContain('Demo Co')
    expect(spec.info['x-nexez-page'].slug).toBe('demo')

    const checkout = spec.paths['/api/checkout'].post.requestBody.content['application/json'].schema
    expect(checkout.properties.slug.enum).toEqual(['demo'])
    expect(checkout.properties.offer.enum).toEqual(['services-0', 'services-1'])
    expect(checkout.properties.offer.description).toContain('Consult')

    // The page's own manifest path is concrete - no {slug} template.
    expect(spec.paths['/demo/agent.json']).toBeTruthy()
    // No negotiable offer → negotiation is NOT advertised (matches llms.txt/agent.json).
    expect(spec.paths['/api/negotiations']).toBeUndefined()
    expect(spec.components.schemas.AgentNegotiationResponse).toBeUndefined()
  })

  it('advertises negotiation when a negotiable offer exists (fails open without admin env)', async () => {
    dbRef.handler = () => ({
      data: {
        ...demoPage,
        services: [{ name: 'Consult', price: '$100', description: '', url: '', offerType: 'negotiable' }],
      },
      error: null,
    })
    const res = await GET(req(), ctx('demo'))
    const spec = await res.json()
    const neg = spec.paths['/api/negotiations'].post.requestBody.content['application/json'].schema
    expect(neg.properties.slug.enum).toEqual(['demo'])
    expect(spec.components.schemas.AgentNegotiationResponse).toBeTruthy()
  })

  it('brand-domain requests get identity URLs on the custom host, transactions on the platform', async () => {
    dbRef.handler = () => ({ data: { ...demoPage, custom_domain: 'demo.example.com' }, error: null })
    const res = await GET(
      new Request('https://demo.example.com/openapi.json', { headers: { host: 'demo.example.com' } }),
      ctx('demo'),
    )
    const spec = await res.json()
    const pageLinks = spec.info['x-nexez-page']
    expect(pageLinks.url).toBe('https://demo.example.com')
    expect(pageLinks.openapi_url).toBe('https://demo.example.com/openapi.json')
    expect(pageLinks.agent_json_url).toBe('https://demo.example.com/agent.json')
    // Transactional server stays the platform runtime, never the brand host.
    expect(spec.servers[0].url).not.toContain('demo.example.com')
    expect(res.headers.get('vary')).toContain('x-forwarded-host')
  })
})
