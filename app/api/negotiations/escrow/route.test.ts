import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

const { stripeRef } = vi.hoisted(() => ({
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

describe('POST /api/negotiations/escrow — refund', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x')
    stripeRef.refundCreate = vi.fn(async () => ({ id: 're_1', amount: 9000 }))
  })
  afterEach(() => vi.unstubAllEnvs())

  it('412 when Stripe is not enabled', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    expect((await POST(post({ negotiationId: 'n1', action: 'refund' }))).status).toBe(412)
  })

  it('401 when not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue(createSupabaseMock(() => ({ data: null }), { user: null }) as any)
    expect((await POST(post({ negotiationId: 'n1', action: 'refund' }))).status).toBe(401)
  })

  it('409 when the negotiation is not a completed payment', async () => {
    withNegotiation({ id: 'n1', status: 'held', stripe_payment_intent_id: 'pi_1', metadata: {} })
    const res = await POST(post({ negotiationId: 'n1', action: 'refund' }))
    expect(res.status).toBe(409)
    expect((stripeRef.refundCreate as any)).not.toHaveBeenCalled()
  })

  it('refunds a completed payment → status refunded (+ idempotency key)', async () => {
    const getUpdate = withNegotiation({ id: 'n1', status: 'complete', stripe_payment_intent_id: 'pi_1', metadata: { foo: 'bar' } })
    const res = await POST(post({ negotiationId: 'n1', action: 'refund' }))
    expect(res.status).toBe(200)
    expect((await res.json())).toMatchObject({ ok: true, status: 'refunded', refundId: 're_1' })
    // refund created with an idempotency key
    const [params, opts] = (stripeRef.refundCreate as any).mock.calls[0]
    expect(params.payment_intent).toBe('pi_1')
    // gives Nexez's commission back on the refund (seller isn't out the fee)
    expect(params.refund_application_fee).toBe(true)
    expect(opts.idempotencyKey).toBe('refund-n1')
    // status flipped + metadata.refund recorded, prior metadata preserved
    const upd = getUpdate()
    expect(upd.status).toBe('refunded')
    expect(upd.metadata.foo).toBe('bar')
    expect(upd.metadata.refund).toMatchObject({ id: 're_1', amount_cents: 9000, source: 'owner_action' })
  })
})

describe('POST /api/negotiations/escrow — cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('409 — a captured (complete) deal cannot be cancelled (must refund instead)', async () => {
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
