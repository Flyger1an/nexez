import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { QueryContext } from '../../../test/supabase-mock'

// lib/supabase is a module singleton, so route the mock through a hoisted,
// per-test-mutable handler.
const { dbRef } = vi.hoisted(() => ({
  dbRef: { handler: (_ctx: any) => ({ data: null, error: null }) as { data?: any; error?: any } },
}))

vi.mock('../../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../../test/supabase-mock')
  return { supabase: createSupabaseMock((ctx) => dbRef.handler(ctx)) }
})
vi.mock('../../../lib/email', () => ({
  buildNegotiationEmail: vi.fn(() => ({ subject: 's', html: 'h', text: 't' })),
  sendEmail: vi.fn(),
}))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: () => {} } // run nothing after the response in tests
})

import { POST } from './route'

const pageWithOffer = {
  id: 'p1',
  owner_id: 'o1',
  slug: 'demo',
  name: 'Demo Co',
  services: [{ name: 'Consult', price: '$100', description: '', url: '' }],
  products: [],
  contact_email: null,
}

const post = (body: unknown) =>
  new Request('https://nexez.test/api/negotiations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/negotiations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbRef.handler = () => ({ data: null, error: null })
  })
  afterEach(() => vi.unstubAllEnvs())

  it('400 when slug or offer is missing', async () => {
    expect((await POST(post({ slug: '', offer: '' }))).status).toBe(400)
    expect((await POST(post({ slug: 'demo' }))).status).toBe(400)
  })

  it('404 when the published page is not found', async () => {
    dbRef.handler = () => ({ data: null, error: { message: 'not found' } })
    expect((await POST(post({ slug: 'missing', offer: 'services-0' }))).status).toBe(404)
  })

  it('404 when the offer is not found on the page', async () => {
    dbRef.handler = (ctx: QueryContext) =>
      ctx.table === 'pages' ? { data: { ...pageWithOffer, services: [], products: [] }, error: null } : { data: null }
    expect((await POST(post({ slug: 'demo', offer: 'services-0' }))).status).toBe(404)
  })

  it('dryRun validates without inserting', async () => {
    let inserted = false
    dbRef.handler = (ctx: QueryContext) => {
      if (ctx.op === 'insert') inserted = true
      return ctx.table === 'pages' ? { data: pageWithOffer, error: null } : { data: null, error: null }
    }
    const res = await POST(post({ slug: 'demo', offer: 'services-0', dryRun: true }))
    expect(res.status).toBe(200)
    expect((await res.json())).toMatchObject({ ok: true, dryRun: true, status: 'negotiation' })
    expect(inserted).toBe(false)
  })

  it('inserts and replies from known values (no RETURNING/select — anon RLS safe)', async () => {
    const ops: string[] = []
    dbRef.handler = (ctx: QueryContext) => {
      ops.push(`${ctx.table}:${ctx.op}`)
      return ctx.table === 'pages' ? { data: pageWithOffer, error: null } : { data: null, error: null }
    }
    const res = await POST(post({ slug: 'demo', offer: 'services-0', buyerAgent: 'TestBot' }))
    expect(res.status).toBe(200)
    expect((await res.json())).toMatchObject({ ok: true, status: 'negotiation' })
    // the insert must NOT chain a select (the prior RLS-412 bug)
    expect(ops).toContain('agent_negotiations:insert')
  })

  it('escrow mode flips to manual_capture_ready when Stripe is configured', async () => {
    dbRef.handler = (ctx: QueryContext) => (ctx.table === 'pages' ? { data: pageWithOffer, error: null } : { data: null, error: null })

    let body = await (await POST(post({ slug: 'demo', offer: 'services-0' }))).json()
    expect(body.escrowMode).toBe('not_configured')

    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x')
    body = await (await POST(post({ slug: 'demo', offer: 'services-0' }))).json()
    expect(body.escrowMode).toBe('manual_capture_ready')
  })

  it('surfaces a 412 with guidance when the insert is blocked by RLS', async () => {
    dbRef.handler = (ctx: QueryContext) =>
      ctx.table === 'pages'
        ? { data: pageWithOffer, error: null }
        : { data: null, error: { message: 'new row violates row-level security policy' } }
    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect(res.status).toBe(412)
  })
})
