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

  it('refunds on the connected account WITH fee reversal + a stable idempotency key', async () => {
    session({ id: 'o1', status: 'paid', stripe_payment_intent_id: 'pi_1', stripe_connect_account_id: 'acct_1', metadata: {} })
    const res = await POST(post({ orderId: 'o1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, status: 'refunded', refundId: 're_1' })
    const [params, opts] = (stripeRef.refundCreate as any).mock.calls[0]
    expect(params).toMatchObject({ payment_intent: 'pi_1', refund_application_fee: true })
    expect(opts).toMatchObject({ stripeAccount: 'acct_1', idempotencyKey: 'refund-order-o1' })
  })
})
