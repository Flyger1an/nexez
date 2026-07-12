import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../../../test/supabase-mock'

const { hasSupabaseAdminEnv, createAdminClient } = vi.hoisted(() => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: vi.fn(),
}))
const { resolveSettlementContext, settleSessionToPaymentIntent } = vi.hoisted(() => ({
  resolveSettlementContext: vi.fn(),
  settleSessionToPaymentIntent: vi.fn(),
}))
vi.mock('../../../../../../utils/supabase/admin', () => ({ createAdminClient, hasSupabaseAdminEnv }))
vi.mock('../../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../../../lib/commerce/settlement-bridge', () => ({ resolveSettlementContext, settleSessionToPaymentIntent }))
vi.mock('../../../../../../lib/supabase', async () => {
  const { createSupabaseMock: mk } = await import('../../../../../../test/supabase-mock')
  return { supabase: mk((ctx: QueryContext) => (ctx.table === 'pages_public' ? { data: { name: 'Acme Studio' } } : { data: null })) }
})

import { POST as COMPLETE } from './route'

const PAGE = {
  id: 'pg1',
  owner_id: 'owner-1',
  slug: 'acme',
  name: 'Acme Studio',
  currency: 'usd',
  services: [{ name: 'Strategy Session', price: '$1,200', description: '', url: '' }],
  products: [],
}
const ROW = {
  id: 'sess_1',
  channel: 'acp',
  slug: 'acme',
  status: 'ready',
  currency: 'usd',
  line_items: [{ id: 'services-0', offerKey: 'services-0', kind: 'services', index: 0, name: 'Strategy Session', description: '', quantity: 1, unitAmount: 120000, subtotal: 120000, currency: 'usd', offerType: 'fixed', availability: 'available' }],
  totals: { currency: 'usd', subtotal: 120000, tax: 0, total: 120000 },
  buyer: null,
  stripe_payment_intent_id: null,
  expires_at: '2999-01-01T00:00:00.000Z',
}
const OK_CONTEXT = { ok: true, context: { pageId: 'pg1', ownerId: 'owner-1', connectAccountId: 'acct_seller', commissionPercent: 10 } }
const OK_SETTLE = { ok: true, paymentIntentId: 'pi_1', amount: 120000, applicationFee: 12000, currency: 'usd' }

function adminMock(handler: (ctx: QueryContext) => { data?: any; error?: any } | undefined) {
  return createSupabaseMock((ctx) => handler(ctx) ?? { data: null, error: null }) as any
}
function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://nexez.app/api/acp/checkout_sessions/sess_1/complete', {
    method: 'POST',
    headers: { authorization: 'Bearer sk_acp', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}
const ctx = { params: Promise.resolve({ id: 'sess_1' }) }
const PAYMENT = { buyer: { email: 'b@x.com', name: 'Dana' }, payment_data: { instrument: { credential: 'vt_123' } } }

describe('POST /api/acp/checkout_sessions/[id]/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasSupabaseAdminEnv.mockReturnValue(true)
    resolveSettlementContext.mockResolvedValue(OK_CONTEXT)
    settleSessionToPaymentIntent.mockResolvedValue(OK_SETTLE)
    vi.stubEnv('ACP_SHARED_SECRET', 'sk_acp')
  })
  afterEach(() => vi.unstubAllEnvs())

  function readySessionDb(over: Record<string, any> = {}) {
    let order: any = { access_token: 'tok123' }
    let sessionUpdate: any
    let orderUpsert: any
    createAdminClient.mockReturnValue(
      adminMock((c) => {
        if (c.table === 'checkout_sessions' && c.op === 'select') return { data: { ...ROW, ...over } }
        if (c.table === 'checkout_sessions' && c.op === 'update') {
          sessionUpdate = c.payload
          return { error: null }
        }
        if (c.table === 'pages') return { data: PAGE }
        if (c.table === 'checkout_orders' && c.op === 'upsert') {
          orderUpsert = c.payload
          return { error: null }
        }
        if (c.table === 'checkout_orders' && c.op === 'select') return { data: order }
        return { data: null }
      }),
    )
    return { getSessionUpdate: () => sessionUpdate, getOrderUpsert: () => orderUpsert, setOrder: (o: any) => (order = o) }
  }

  it('settles the session and returns CheckoutSessionWithOrder (200)', async () => {
    const spy = readySessionDb()
    const res = await COMPLETE(req(PAYMENT), ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('completed')
    expect(body.order).toMatchObject({ id: 'pi_1', checkout_session_id: 'sess_1', status: 'confirmed' })
    expect(body.order.permalink_url).toMatch(/\/orders\/tok123$/)
    // Charged via the shared bridge with the delegated token.
    expect(settleSessionToPaymentIntent).toHaveBeenCalledTimes(1)
    const [passedSession, payment, context] = settleSessionToPaymentIntent.mock.calls[0]
    expect(payment).toEqual({ token: 'vt_123', kind: 'shared_payment_token' })
    expect(context.connectAccountId).toBe('acct_seller')
    expect(passedSession.buyer).toMatchObject({ email: 'b@x.com' })
    // Session marked completed + PI linked; durable order persisted under 'acp'.
    expect(spy.getSessionUpdate()).toMatchObject({ status: 'completed', stripe_payment_intent_id: 'pi_1' })
    expect(spy.getOrderUpsert()).toMatchObject({ channel: 'acp', stripe_payment_intent_id: 'pi_1', amount_cents: 120000, application_fee_cents: 12000, status: 'paid' })
  })

  it('400 when payment_data is missing', async () => {
    readySessionDb()
    const res = await COMPLETE(req({ buyer: { email: 'b@x.com' } }), ctx)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('missing_payment')
    expect(settleSessionToPaymentIntent).not.toHaveBeenCalled()
  })

  it('402 when settlement declines (never marks completed)', async () => {
    const spy = readySessionDb()
    settleSessionToPaymentIntent.mockResolvedValue({ ok: false, code: 'stripe_error', message: 'card_declined' })
    const res = await COMPLETE(req(PAYMENT), ctx)
    expect(res.status).toBe(402)
    expect((await res.json()).code).toBe('stripe_error')
    expect(spy.getSessionUpdate()).toBeUndefined() // not completed
  })

  it('409 when the seller is paused (settlement context)', async () => {
    readySessionDb()
    resolveSettlementContext.mockResolvedValue({ ok: false, code: 'paused', message: 'paused' })
    const res = await COMPLETE(req(PAYMENT), ctx)
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('paused')
    expect(settleSessionToPaymentIntent).not.toHaveBeenCalled()
  })

  it('402 when the seller has no connect account', async () => {
    readySessionDb()
    resolveSettlementContext.mockResolvedValue({ ok: false, code: 'no_connect', message: 'no payout' })
    const res = await COMPLETE(req(PAYMENT), ctx)
    expect(res.status).toBe(402)
  })

  it('replays an already-completed session without charging again', async () => {
    readySessionDb({ status: 'completed', stripe_payment_intent_id: 'pi_1' })
    const res = await COMPLETE(req(PAYMENT), ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('completed')
    expect(body.order.permalink_url).toMatch(/\/orders\/tok123$/)
    expect(settleSessionToPaymentIntent).not.toHaveBeenCalled()
    expect(resolveSettlementContext).not.toHaveBeenCalled()
  })

  it('409 on a canceled session', async () => {
    readySessionDb({ status: 'canceled' })
    expect((await COMPLETE(req(PAYMENT), ctx)).status).toBe(409)
    expect(settleSessionToPaymentIntent).not.toHaveBeenCalled()
  })

  it('401 without the shared secret', async () => {
    vi.stubEnv('ACP_SHARED_SECRET', '')
    expect((await COMPLETE(req(PAYMENT), ctx)).status).toBe(401)
  })
})
