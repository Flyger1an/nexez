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
  cta_url: 'https://demo.example.com/book',
  audience: 'startups',
  location: 'Remote',
  contact_email: 'hi@demo.example.com',
  industry: 'Consulting',
  services: [{ name: 'Consult', price: '$100', description: '', url: '' }],
  products: [],
  faqs: [{ question: 'q', answer: 'a' }],
  is_published: true,
}

const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) })
const req = () => new Request('https://nexez.test/demo/badge.json')

describe('GET /[slug]/badge.json', () => {
  beforeEach(() => {
    dbRef.handler = () => ({ data: null, error: null })
  })

  it('404 + valid:false for a missing/unpublished page', async () => {
    dbRef.handler = () => ({ data: null, error: { message: 'none' } })
    const res = await GET(req(), ctx('missing'))
    expect(res.status).toBe(404)
    expect((await res.json()).valid).toBe(false)
  })

  it('returns a live, versioned certification record for a published page', async () => {
    dbRef.handler = () => ({ data: demoPage, error: null })
    const res = await GET(req(), ctx('demo'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      schema_version: 'nexez.agent-ready-verification.v1',
      issuer: 'nexez',
      valid: true,
      certified: true,
      status: 'certified',
      slug: 'demo',
      name: 'Demo Co',
      standard: {
        id: 'nexez.agent-ready',
        version: '2026.1',
        threshold: 100,
      },
      criteria: { met: 11, total: 11, missing: [] },
    })
    expect(typeof body.readiness).toBe('number')
    expect(typeof body.trust).toBe('number')
    expect(body.issued_at).toBeUndefined()
    expect(typeof body.evaluated_at).toBe('string')
  })

  it('keeps the verification record valid without claiming certification for an incomplete page', async () => {
    dbRef.handler = () => ({ data: { ...demoPage, cta_url: null }, error: null })
    const res = await GET(req(), ctx('demo'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      valid: true,
      certified: false,
      status: 'incomplete',
      criteria: {
        met: 10,
        total: 11,
        missing: [expect.objectContaining({ id: 'cta_url' })],
      },
    })
  })
})
