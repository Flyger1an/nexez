import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

const { stripeRef, refundRef } = vi.hoisted(() => ({
  refundRef: { execute: vi.fn(), configured: false },
  stripeRef: { refundCreate: (..._a: any[]) => ({}) as any },
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('stripe', () => ({
  default: class {
    refunds = { create: (...a: any[]) => stripeRef.refundCreate(...a) }
    paymentIntents = { capture: async () => ({}), cancel: async () => ({}) }
  },
}))

vi.mock('../../../../utils/supabase/admin', () => ({ hasSupabaseAdminEnv: () => refundRef.configured, createAdminClient: () => ({}) }))
vi.mock('../../../../lib/server/refund-operation', async (original) => ({ ...await original<any>(), executeRefund: refundRef.execute }))

import { POST } from './route'
import { createClient } from '../../../../utils/supabase/server'

function withNegotiation(neg: any, user: any = { id: 'owner-1' }) {
  let updated: any
  vi.mocked(createClient).mockReturnValue(
    createSupabaseMock((ctx: QueryContext) => {
      if (ctx.table === 'agent_negotiations' && ctx.op === 'update') updated = ctx.payload
      if (ctx.table === 'agent_negotiations') return { data: neg, error: null }
      if (ctx.table === 'billing_subscriptions') return { data: { stripe_connect_account_id: null }, error: null }
      return { data: null, error: null }
    }, { user }) as any,
  )
  return () => updated
}

const post = (body: unknown) =>
  new Request('https://nexez.test/api/negotiations/escrow', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/negotiations/escrow - durable refund', () => {
  const operationId = '75000000-0000-4000-8000-000000000001'
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture')
    refundRef.configured = true
    refundRef.execute.mockResolvedValue(Response.json({ ok: true, operationId }))
    withNegotiation({ id: 'n1', status: 'complete', currency: 'jpy' })
  })
  afterEach(() => { vi.unstubAllEnvs(); refundRef.configured = false })
  it('binds a refund to the authenticated owner and recorded currency', async () => {
    expect((await POST(post({ negotiationId: 'n1', action: 'refund', amount: 200, operationId }))).status).toBe(200)
    expect(refundRef.execute).toHaveBeenCalledWith({ operationId, ownerId: 'owner-1', kind: 'negotiation', targetId: 'n1', currency: 'jpy', amount: 200 })
  })
  it('requires a stable operation identity', async () => {
    expect((await POST(post({ negotiationId: 'n1', action: 'refund' }))).status).toBe(400)
    expect(refundRef.execute).not.toHaveBeenCalled()
  })
  it('requires durable storage before a refund', async () => {
    refundRef.configured = false
    expect((await POST(post({ negotiationId: 'n1', action: 'refund', operationId }))).status).toBe(503)
    expect(refundRef.execute).not.toHaveBeenCalled()
  })
  it('preserves authentication and owner visibility checks', async () => {
    withNegotiation(null)
    expect((await POST(post({ negotiationId: 'n1', action: 'refund', operationId }))).status).toBe(404)
    withNegotiation(null, null)
    expect((await POST(post({ negotiationId: 'n1', action: 'refund', operationId }))).status).toBe(401)
    expect(refundRef.execute).not.toHaveBeenCalled()
  })
  it.each([0, -1])('rejects an invalid partial amount %s', async (amount) => {
    expect((await POST(post({ negotiationId: 'n1', action: 'refund', amount, operationId }))).status).toBe(400)
    expect(refundRef.execute).not.toHaveBeenCalled()
  })
})

describe('POST /api/negotiations/escrow - cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('409 - a captured (complete) deal cannot be cancelled (must refund instead)', async () => {
    const getUpdate = withNegotiation({ id: 'n1', status: 'complete', stripe_payment_intent_id: 'pi_1', metadata: {} })
    const res = await POST(post({ negotiationId: 'n1', action: 'cancel' }))
    expect(res.status).toBe(409)
    expect(getUpdate()).toBeUndefined() // status NOT flipped to declined
  })

  it('cancels a held authorization → status declined', async () => {
    const getUpdate = withNegotiation({ id: 'n1', status: 'held', stripe_payment_intent_id: 'pi_1', metadata: {} })
    const res = await POST(post({ negotiationId: 'n1', action: 'cancel' }))
    expect(res.status).toBe(200)
    expect((await res.json())).toMatchObject({ ok: true, status: 'declined' })
    expect(getUpdate().status).toBe('declined')
  })
})
