import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { encryptForTest, stubBearerTokenKey } from '../../../../../../test/bearer-token-fixtures'
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
const OK_CONTEXT = { ok: true, context: { pageId: 'pg1', ownerId: 'owner-1', connectAccountId: 'acct_seller', planId: 'free', commissionBps: 900, commissionPercent: 9, commissionSource: 'plan_default' } }
const OK_SETTLE = { ok: true, paymentIntentId: 'pi_1', amount: 120000, applicationFee: 10800, currency: 'usd', livemode: false }

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
const PAYMENT = { buyer: { email: 'b@x.com', name: 'Dana' }, payment_data: { instrument: { credential: 'spt_123' } } }

describe('POST /api/acp/checkout_sessions/[id]/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubBearerTokenKey()
    hasSupabaseAdminEnv.mockReturnValue(true)
    resolveSettlementContext.mockResolvedValue(OK_CONTEXT)
    settleSessionToPaymentIntent.mockResolvedValue(OK_SETTLE)
    vi.stubEnv('ACP_SHARED_SECRET', 'sk_acp')
  })
  afterEach(() => vi.unstubAllEnvs())

  function readySessionDb(over: Record<string, any> = {}, page: Record<string, any> = PAGE) {
    let order: any = { access_token_encrypted: encryptForTest('tok123') }
    let sessionUpdate: any
    let orderUpsert: any
    createAdminClient.mockReturnValue(
      adminMock((c) => {
        if (c.table === 'checkout_sessions' && c.op === 'select') return { data: { ...ROW, ...over } }
        if (c.table === 'checkout_sessions' && c.op === 'update') {
          sessionUpdate = c.payload
          return { error: null }
        }
        if (c.table === 'pages') return { data: page }
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
    expect(payment).toEqual({ token: 'spt_123', kind: 'shared_payment_token' })
    expect(context.connectAccountId).toBe('acct_seller')
    expect(passedSession.buyer).toMatchObject({ email: 'b@x.com' })
    // Session marked completed + PI linked; durable order persisted under 'acp'.
    expect(spy.getSessionUpdate()).toMatchObject({ status: 'completed', stripe_payment_intent_id: 'pi_1', stripe_livemode: false })
    expect(spy.getOrderUpsert()).toMatchObject({ channel: 'acp', stripe_payment_intent_id: 'pi_1', amount_cents: 120000, application_fee_cents: 10800, commission_bps: 900, commission_percent: 9, plan_id_at_purchase: 'free', commission_source: 'plan_default', stripe_livemode: false, status: 'paid' })
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

  // The settlement-time re-price reflects live offers, so a merchant editing their
  // price mid-flight used to settle at the new number under the buyer's old
  // authorization. APPROVED carries what was actually agreed to.
  describe('buyer-approved amount', () => {
    const APPROVED = {
      approved_amount_cents: 120000,
      approved_currency: 'usd',
      approved_cart_fingerprint: '1-e483a793d4d2f2f3',
    }
    const pageAt = (price: string) => ({ ...PAGE, services: [{ ...PAGE.services[0], price }] })

    it('refuses to charge when the merchant raised the price after authorization', async () => {
      const spy = readySessionDb(APPROVED, pageAt('$1,900'))
      const res = await COMPLETE(req(PAYMENT), ctx)
      expect(res.status).toBe(409)
      expect((await res.json()).code).toBe('amount_increased')
      expect(settleSessionToPaymentIntent).not.toHaveBeenCalled()
      expect(spy.getSessionUpdate()).toMatchObject({ status: 'ready' }) // never completed
    })

    it('settles at the lower amount when the merchant dropped the price', async () => {
      settleSessionToPaymentIntent.mockResolvedValue({ ...OK_SETTLE, amount: 90000, applicationFee: 8100 })
      readySessionDb(APPROVED, pageAt('$900'))
      const res = await COMPLETE(req(PAYMENT), ctx)
      expect(res.status).toBe(200)
      const [passedSession] = settleSessionToPaymentIntent.mock.calls[0]
      expect(passedSession.totals.total).toBe(90000)
    })

    it('refuses when the authorization was given in a different currency', async () => {
      readySessionDb({ ...APPROVED, approved_currency: 'eur' })
      const res = await COMPLETE(req(PAYMENT), ctx)
      expect(res.status).toBe(409)
      expect((await res.json()).code).toBe('currency_changed')
      expect(settleSessionToPaymentIntent).not.toHaveBeenCalled()
    })

    it('refuses when the cart no longer matches the authorization', async () => {
      readySessionDb({ ...APPROVED, approved_cart_fingerprint: '1-deadbeefdeadbeef' })
      const res = await COMPLETE(req(PAYMENT), ctx)
      expect(res.status).toBe(409)
      expect((await res.json()).code).toBe('cart_changed')
      expect(settleSessionToPaymentIntent).not.toHaveBeenCalled()
    })

    // Rows predating the approval columns. Deliberately allowed through: they expire
    // inside one deploy cycle, and failing closed would strand in-flight checkouts.
    it('still settles a legacy row that carries no approval', async () => {
      readySessionDb({}, pageAt('$1,900'))
      expect((await COMPLETE(req(PAYMENT), ctx)).status).toBe(200)
    })
  })
})
