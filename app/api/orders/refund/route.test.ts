import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

const { stripeRef, adminRef } = vi.hoisted(() => ({
  stripeRef: { refundCreate: (..._a: any[]) => ({}) as any },
  adminRef: { handler: (_c: any) => ({ data: null, error: null }) as { data?: any; error?: any } },
}))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('../../../../utils/supabase/admin', async () => {
  const { createSupabaseMock } = await import('../../../../test/supabase-mock')
  return {
    hasSupabaseAdminEnv: vi.fn(() => true),
    createAdminClient: vi.fn(() => createSupabaseMock((c) => adminRef.handler(c))),
  }
})
vi.mock('stripe', () => ({
  default: class {
    refunds = { create: (...a: any[]) => stripeRef.refundCreate(...a) }
  },
}))

import { POST } from './route'
import { createClient } from '../../../../utils/supabase/server'
import { hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

function session(order: any, user: any = { id: 'owner-1' }) {
  vi.mocked(createClient).mockReturnValue(
    createSupabaseMock((ctx: QueryContext) => {
      if (ctx.table === 'checkout_orders') return { data: order, error: null }
      return { data: null, error: null }
    }, { user }) as any,
  )
}
const post = (body: unknown) =>
  new Request('https://nexez.test/api/orders/refund', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/orders/refund', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x')
    stripeRef.refundCreate = vi.fn(async () => ({ id: 're_1', amount: 5000 }))
    adminRef.handler = () => ({ data: null, error: null })
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('412 when Stripe is disabled', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    expect((await POST(post({ orderId: 'o1' }))).status).toBe(412)
  })

  it('401 when not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue(createSupabaseMock(() => ({ data: null }), { user: null }) as any)
    expect((await POST(post({ orderId: 'o1' }))).status).toBe(401)
  })

  it('503 before moving money when the durable order writer is unavailable', async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(false)
    session({ id: 'o1', status: 'paid', stripe_payment_intent_id: 'pi_1', amount_cents: 5000, currency: 'usd', refunded_cents: 0, metadata: {} })
    expect((await POST(post({ orderId: 'o1' }))).status).toBe(503)
    expect(stripeRef.refundCreate).not.toHaveBeenCalled()
  })

  it('404 when the order is not the caller’s (RLS read returns null)', async () => {
    session(null)
    expect((await POST(post({ orderId: 'o1' }))).status).toBe(404)
    expect(stripeRef.refundCreate).not.toHaveBeenCalled()
  })

  it('409 when the order is not paid (already refunded/disputed)', async () => {
    session({ id: 'o1', status: 'refunded', stripe_payment_intent_id: 'pi_1', stripe_connect_account_id: 'acct_1', metadata: {} })
    expect((await POST(post({ orderId: 'o1' }))).status).toBe(409)
    expect(stripeRef.refundCreate).not.toHaveBeenCalled()
  })

  it('409 when there is no captured payment intent yet', async () => {
    session({ id: 'o1', status: 'paid', stripe_payment_intent_id: null, stripe_connect_account_id: 'acct_1', metadata: {} })
    expect((await POST(post({ orderId: 'o1' }))).status).toBe(409)
    expect(stripeRef.refundCreate).not.toHaveBeenCalled()
  })

  it('refunds IN FULL on the connected account WITH fee reversal + a cumulative idempotency key', async () => {
    let upd: any
    adminRef.handler = (c) => {
      if (c.op === 'update') {
        upd = c.payload
        return { data: { id: 'o1', status: 'refunded', refunded_cents: 5000 }, error: null }
      }
      return { data: null, error: null }
    }
    session({ id: 'o1', status: 'paid', stripe_payment_intent_id: 'pi_1', stripe_connect_account_id: 'acct_1', amount_cents: 5000, currency: 'usd', refunded_cents: 0, metadata: {} })
    const res = await POST(post({ orderId: 'o1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, status: 'refunded', refundId: 're_1', fully: true, refundedCents: 5000 })
    const [params, opts] = (stripeRef.refundCreate as any).mock.calls[0]
    expect(params).toMatchObject({ payment_intent: 'pi_1', amount: 5000, refund_application_fee: true })
    expect(opts).toMatchObject({ stripeAccount: 'acct_1', idempotencyKey: 'refund-order-o1-5000' })
    expect(upd).toMatchObject({ status: 'refunded', refunded_cents: 5000 })
    expect(upd.metadata.refund).toMatchObject({ amount_cents: 5000, source: 'owner_action' })
  })

  it('PARTIAL refund keeps the order paid + advances the ledger (distinct keys, no collision)', async () => {
    let upd: any
    adminRef.handler = (c) => {
      if (c.op === 'update') {
        upd = c.payload
        return { data: { id: 'o1', status: 'paid', refunded_cents: 4000 }, error: null }
      }
      return { data: null, error: null }
    }
    stripeRef.refundCreate = vi.fn(async () => ({ id: 're_p', amount: 2000 }))
    // already refunded $20 of $50 → a further $20 partial brings the total to $40 (still open)
    session({ id: 'o1', status: 'paid', stripe_payment_intent_id: 'pi_1', stripe_connect_account_id: 'acct_1', amount_cents: 5000, currency: 'usd', refunded_cents: 2000, metadata: { partial_refund: { amount_cents: 2000 } } })
    const res = await POST(post({ orderId: 'o1', amount: 20 }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, status: 'paid', fully: false, refundedCents: 4000 })
    const [params, opts] = (stripeRef.refundCreate as any).mock.calls[0]
    expect(params.amount).toBe(2000)
    expect(opts.idempotencyKey).toBe('refund-order-o1-4000') // cumulative, distinct from the first $20's key
    expect(upd.status).toBeUndefined() // stays paid
    expect(upd.refunded_cents).toBe(4000)
    expect(upd.metadata.partial_refund).toMatchObject({ amount_cents: 4000, source: 'owner_action' })
  })

  it('400 on a non-positive partial amount', async () => {
    session({ id: 'o1', status: 'paid', stripe_payment_intent_id: 'pi_1', stripe_connect_account_id: 'acct_1', amount_cents: 5000, currency: 'usd', refunded_cents: 0, metadata: {} })
    expect((await POST(post({ orderId: 'o1', amount: 0 }))).status).toBe(400)
    expect((stripeRef.refundCreate as any)).not.toHaveBeenCalled()
  })

  it('409 when the requested partial exceeds the refundable remainder', async () => {
    session({ id: 'o1', status: 'paid', stripe_payment_intent_id: 'pi_1', stripe_connect_account_id: 'acct_1', amount_cents: 5000, currency: 'usd', refunded_cents: 4000, metadata: {} })
    const res = await POST(post({ orderId: 'o1', amount: 30 })) // $30 > $10 remaining
    expect(res.status).toBe(409)
    expect((stripeRef.refundCreate as any)).not.toHaveBeenCalled()
  })

  it('reports committed money separately when the local ledger update fails', async () => {
    adminRef.handler = (context) => context.op === 'update'
      ? { data: null, error: { message: 'database unavailable' } }
      : { data: null, error: null }
    session({ id: 'o1', status: 'paid', stripe_payment_intent_id: 'pi_1', stripe_connect_account_id: 'acct_1', amount_cents: 5000, currency: 'usd', refunded_cents: 0, metadata: {} })

    const response = await POST(post({ orderId: 'o1' }))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      code: 'refund_ledger_pending',
      refundCommitted: true,
      refundId: 're_1',
      refundedCents: 5000,
    })
  })
})
