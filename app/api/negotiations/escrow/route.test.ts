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
    withNegotiation({ id: 'n1', status: 'held', stripe_payment_intent_id: 'pi_1', amount_cents: 9000, currency: 'usd', refunded_cents: 0, metadata: {} })
    const res = await POST(post({ negotiationId: 'n1', action: 'refund' }))
    expect(res.status).toBe(409)
    expect((stripeRef.refundCreate as any)).not.toHaveBeenCalled()
  })

  it('refunds a completed payment IN FULL → status refunded (+ cumulative idempotency key)', async () => {
    const getUpdate = withNegotiation({ id: 'n1', status: 'complete', stripe_payment_intent_id: 'pi_1', amount_cents: 9000, currency: 'usd', refunded_cents: 0, metadata: { foo: 'bar' } })
    const res = await POST(post({ negotiationId: 'n1', action: 'refund' }))
    expect(res.status).toBe(200)
    expect((await res.json())).toMatchObject({ ok: true, status: 'refunded', refundId: 're_1', fully: true, refundedCents: 9000 })
    const [params, opts] = (stripeRef.refundCreate as any).mock.calls[0]
    expect(params.payment_intent).toBe('pi_1')
    expect(params.amount).toBe(9000) // full remainder, explicit amount
    // gives Nexez's commission back on the refund (seller isn't out the fee)
    expect(params.refund_application_fee).toBe(true)
    // keyed on the resulting cumulative total, not just the id
    expect(opts.idempotencyKey).toBe('refund-n1-9000')
    const upd = getUpdate()
    expect(upd.status).toBe('refunded')
    expect(upd.refunded_cents).toBe(9000)
    expect(upd.metadata.foo).toBe('bar')
    expect(upd.metadata.refund).toMatchObject({ id: 're_1', amount_cents: 9000, source: 'owner_action' })
  })

  it('PARTIAL refund keeps the deal complete + advances the ledger', async () => {
    stripeRef.refundCreate = vi.fn(async () => ({ id: 're_p1', amount: 3000 }))
    const getUpdate = withNegotiation({ id: 'n1', status: 'complete', stripe_payment_intent_id: 'pi_1', amount_cents: 9000, currency: 'usd', refunded_cents: 0, metadata: {} })
    const res = await POST(post({ negotiationId: 'n1', action: 'refund', amount: 30 })) // $30 of $90
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, status: 'complete', fully: false, refundedCents: 3000 })
    const [params, opts] = (stripeRef.refundCreate as any).mock.calls[0]
    expect(params.amount).toBe(3000)
    expect(opts.idempotencyKey).toBe('refund-n1-3000')
    const upd = getUpdate()
    expect(upd.status).toBeUndefined() // not flipped — remainder still refundable
    expect(upd.refunded_cents).toBe(3000)
    expect(upd.metadata.partial_refund).toMatchObject({ amount_cents: 3000, source: 'owner_action' })
  })

  it('a SECOND equal-amount partial gets a distinct key (no collision) + closes when it reaches the total', async () => {
    stripeRef.refundCreate = vi.fn(async () => ({ id: 're_p2', amount: 6000 }))
    const getUpdate = withNegotiation({ id: 'n1', status: 'complete', stripe_payment_intent_id: 'pi_1', amount_cents: 9000, currency: 'usd', refunded_cents: 3000, metadata: { partial_refund: { amount_cents: 3000 } } })
    const res = await POST(post({ negotiationId: 'n1', action: 'refund', amount: 60 })) // remaining $60 → full
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, status: 'refunded', fully: true, refundedCents: 9000 })
    const [, opts] = (stripeRef.refundCreate as any).mock.calls[0]
    expect(opts.idempotencyKey).toBe('refund-n1-9000') // distinct from the first partial's key
    expect(getUpdate().status).toBe('refunded')
  })

  it('400 on a non-positive partial amount', async () => {
    withNegotiation({ id: 'n1', status: 'complete', stripe_payment_intent_id: 'pi_1', amount_cents: 9000, currency: 'usd', refunded_cents: 0, metadata: {} })
    expect((await POST(post({ negotiationId: 'n1', action: 'refund', amount: 0 }))).status).toBe(400)
    expect((await POST(post({ negotiationId: 'n1', action: 'refund', amount: -5 }))).status).toBe(400)
  })

  it('409 when the requested partial exceeds the refundable remainder', async () => {
    withNegotiation({ id: 'n1', status: 'complete', stripe_payment_intent_id: 'pi_1', amount_cents: 9000, currency: 'usd', refunded_cents: 6000, metadata: {} })
    const res = await POST(post({ negotiationId: 'n1', action: 'refund', amount: 50 })) // $50 > $30 remaining
    expect(res.status).toBe(409)
    expect((stripeRef.refundCreate as any)).not.toHaveBeenCalled()
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
