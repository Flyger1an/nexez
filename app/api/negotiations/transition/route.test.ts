import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../utils/supabase/server', () => ({ createClient: vi.fn() }))

import { POST } from './route'
import { createClient } from '../../../../utils/supabase/server'

const post = (body: unknown) =>
  new Request('https://nexez.test/api/negotiations/transition', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

function withNegotiation(neg: any, user = { id: 'owner-1' }) {
  vi.mocked(createClient).mockReturnValue(
    createSupabaseMock((ctx: QueryContext) => (ctx.table === 'agent_negotiations' ? { data: neg, error: null } : { data: null, error: null }), {
      user,
    }) as any,
  )
}

describe('POST /api/negotiations/transition', () => {
  beforeEach(() => vi.clearAllMocks())

  it('401 when not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue(createSupabaseMock(() => ({ data: null }), { user: null }) as any)
    expect((await POST(post({ negotiationId: 'n1', to: 'declined' }))).status).toBe(401)
  })

  it('400 on a missing/invalid target status', async () => {
    withNegotiation({ id: 'n1', status: 'negotiation', escrow_mode: 'not_configured' })
    expect((await POST(post({ negotiationId: 'n1' }))).status).toBe(400)
    expect((await POST(post({ negotiationId: 'n1', to: 'banana' }))).status).toBe(400)
  })

  it('409 — held is buyer-funded, never set directly here', async () => {
    withNegotiation({ id: 'n1', status: 'agreement_proposed', escrow_mode: 'manual_capture_ready' })
    const res = await POST(post({ negotiationId: 'n1', to: 'held' }))
    expect(res.status).toBe(409)
  })

  it('409 on an illegal transition (complete from negotiation)', async () => {
    withNegotiation({ id: 'n1', status: 'negotiation', escrow_mode: 'not_configured', stripe_payment_intent_id: null })
    const res = await POST(post({ negotiationId: 'n1', to: 'complete' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/Illegal transition/)
  })

  it('allows a legal transition (negotiation → agreement_proposed)', async () => {
    withNegotiation({ id: 'n1', status: 'negotiation', escrow_mode: 'not_configured', stripe_payment_intent_id: null })
    const res = await POST(post({ negotiationId: 'n1', to: 'agreement_proposed' }))
    expect(res.status).toBe(200)
    expect((await res.json())).toMatchObject({ ok: true, status: 'agreement_proposed' })
  })

  it('refuses to complete a Stripe-backed hold here (must capture via escrow)', async () => {
    withNegotiation({ id: 'n1', status: 'held', escrow_mode: 'manual_capture_created', stripe_payment_intent_id: 'pi_1' })
    const res = await POST(post({ negotiationId: 'n1', to: 'complete' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/Capture the held funds/)
  })

  it('404 when the negotiation is not the owner’s', async () => {
    vi.mocked(createClient).mockReturnValue(
      createSupabaseMock(() => ({ data: null, error: null }), { user: { id: 'owner-1' } }) as any,
    )
    expect((await POST(post({ negotiationId: 'nope', to: 'declined' }))).status).toBe(404)
  })
})
