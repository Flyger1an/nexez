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

const PAGE = { id: 'pg1', owner_id: 'owner-1', slug: 'acme', name: 'Acme Studio', currency: 'usd', services: [{ name: 'Strategy Session', price: '$1,200', description: '', url: '' }], products: [] }
const ROW = {
  id: 'sess_1', channel: 'ucp', slug: 'acme', status: 'ready', currency: 'usd',
  line_items: [{ id: 'services-0', offerKey: 'services-0', kind: 'services', index: 0, name: 'Strategy Session', description: '', quantity: 1, unitAmount: 120000, subtotal: 120000, currency: 'usd', offerType: 'fixed', availability: 'available' }],
  totals: { currency: 'usd', subtotal: 120000, tax: 0, total: 120000 }, buyer: null, stripe_payment_intent_id: null, expires_at: '2999-01-01T00:00:00.000Z',
}
const OK_CONTEXT = { ok: true, context: { pageId: 'pg1', ownerId: 'owner-1', connectAccountId: 'acct_seller', planId: 'free', commissionBps: 900, commissionPercent: 9, commissionSource: 'plan_default' } }
const OK_SETTLE = { ok: true, paymentIntentId: 'pi_1', amount: 120000, applicationFee: 10800, currency: 'usd', livemode: false }

function adminMock(handler: (ctx: QueryContext) => { data?: any; error?: any } | undefined) {
  return createSupabaseMock((ctx) => handler(ctx) ?? { data: null, error: null }) as any
}
function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://nexez.app/api/ucp/checkout-sessions/sess_1/complete', {
    method: 'POST',
    headers: { authorization: 'Bearer sk_ucp', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}
const ctx = { params: Promise.resolve({ id: 'sess_1' }) }
const PAYMENT = {
  buyer: { email: 'b@x.com' },
  payment: {
    instruments: [{
      id: 'instrument_1',
      handler_id: 'handler_123',
      type: 'card',
      credential: { type: 'PAYMENT_GATEWAY', token: 'gp_123' },
    }],
  },
}

describe('POST /api/ucp/checkout-sessions/[id]/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubBearerTokenKey()
    hasSupabaseAdminEnv.mockReturnValue(true)
    resolveSettlementContext.mockResolvedValue(OK_CONTEXT)
    settleSessionToPaymentIntent.mockResolvedValue(OK_SETTLE)
    vi.stubEnv('UCP_SHARED_SECRET', 'sk_ucp')
    vi.stubEnv('UCP_GOOGLE_PAY_HANDLER_ID', 'handler_123')
  })
  afterEach(() => vi.unstubAllEnvs())

  function readyDb(over: Record<string, any> = {}, page: Record<string, any> = PAGE) {
    let sessionUpdate: any
    let orderUpsert: any
    let credentialEvent: any
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
        if (c.table === 'checkout_orders' && c.op === 'select') return { data: { id: 'order-1', access_token_encrypted: encryptForTest('tok123') } }
        if (c.table === 'checkout_order_events' && c.op === 'insert') {
          credentialEvent = c.payload
          return { error: null }
        }
        return { data: null }
      }),
    )
    return {
      getSessionUpdate: () => sessionUpdate,
      getOrderUpsert: () => orderUpsert,
      getCredentialEvent: () => credentialEvent,
    }
  }

  it('settles via the shared bridge with the Google Pay token (200 + order)', async () => {
    const spy = readyDb()
    const res = await COMPLETE(req(PAYMENT), ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('completed')
    expect(body.order).toMatchObject({ id: 'pi_1', status: 'completed' })
    expect(body.order.permalink_url).toMatch(/\/orders\/tok123$/)
    const [, payment] = settleSessionToPaymentIntent.mock.calls[0]
    expect(payment).toEqual({ token: 'gp_123', kind: 'google_pay', handlerId: 'handler_123', credentialType: 'PAYMENT_GATEWAY' })
    expect(spy.getOrderUpsert()).toMatchObject({ channel: 'ucp', stripe_payment_intent_id: 'pi_1', commission_bps: 900, commission_percent: 9, plan_id_at_purchase: 'free', commission_source: 'plan_default', stripe_livemode: false, status: 'paid' })
    expect(spy.getCredentialEvent()).toMatchObject({
      order_id: 'order-1',
      event_type: 'protocol_credential_confirmed',
      source: 'system',
      metadata: { channel: 'ucp', credentialKind: 'google_pay', handlerId: 'handler_123' },
    })
    expect(spy.getSessionUpdate()).toMatchObject({ status: 'completed', stripe_payment_intent_id: 'pi_1', stripe_livemode: false })
  })

  it('400 when the Google Pay credential is missing', async () => {
    readyDb()
    const res = await COMPLETE(req({ buyer: { email: 'b@x.com' } }), ctx)
    expect(res.status).toBe(400)
    expect(settleSessionToPaymentIntent).not.toHaveBeenCalled()
  })

  it('503 when the Google Pay handler declaration is not configured', async () => {
    readyDb()
    vi.stubEnv('UCP_GOOGLE_PAY_HANDLER_ID', '')
    const res = await COMPLETE(req(PAYMENT), ctx)
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('payment_handler_unconfigured')
    expect(settleSessionToPaymentIntent).not.toHaveBeenCalled()
  })

  it('400 when the selected instrument points at another handler', async () => {
    readyDb()
    const res = await COMPLETE(req({
      payment: { instruments: [{ ...PAYMENT.payment.instruments[0], handler_id: 'other_handler' }] },
    }), ctx)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('payment_handler_mismatch')
    expect(settleSessionToPaymentIntent).not.toHaveBeenCalled()
  })

  it('402 when settlement declines', async () => {
    readyDb()
    settleSessionToPaymentIntent.mockResolvedValue({ ok: false, code: 'stripe_error', message: 'declined' })
    expect((await COMPLETE(req(PAYMENT), ctx)).status).toBe(402)
  })

  it('409 when the seller is paused', async () => {
    readyDb()
    resolveSettlementContext.mockResolvedValue({ ok: false, code: 'paused', message: 'paused' })
    expect((await COMPLETE(req(PAYMENT), ctx)).status).toBe(409)
    expect(settleSessionToPaymentIntent).not.toHaveBeenCalled()
  })

  it('replays an already-completed session without charging again', async () => {
    readyDb({ status: 'completed', stripe_payment_intent_id: 'pi_1' })
    const res = await COMPLETE(req(PAYMENT), ctx)
    expect(res.status).toBe(200)
    expect(settleSessionToPaymentIntent).not.toHaveBeenCalled()
  })

  it('401 without the shared secret', async () => {
    vi.stubEnv('UCP_SHARED_SECRET', '')
    expect((await COMPLETE(req(PAYMENT), ctx)).status).toBe(401)
  })

  // A Google Pay token carries no allowance ceiling to fall back on, so this check is
  // the only thing between a mid-flight price edit and the buyer's card.
  describe('buyer-approved amount', () => {
    const APPROVED = {
      approved_amount_cents: 120000,
      approved_currency: 'usd',
      approved_cart_fingerprint: '1-e483a793d4d2f2f3',
    }
    const pageAt = (price: string) => ({ ...PAGE, services: [{ ...PAGE.services[0], price }] })

    it('refuses to charge when the merchant raised the price after authorization', async () => {
      readyDb(APPROVED, pageAt('$1,900'))
      const res = await COMPLETE(req(PAYMENT), ctx)
      expect(res.status).toBe(409)
      expect((await res.json()).code).toBe('amount_increased')
      expect(settleSessionToPaymentIntent).not.toHaveBeenCalled()
    })

    it('settles at the lower amount when the merchant dropped the price', async () => {
      settleSessionToPaymentIntent.mockResolvedValue({ ...OK_SETTLE, amount: 90000, applicationFee: 8100 })
      readyDb(APPROVED, pageAt('$900'))
      expect((await COMPLETE(req(PAYMENT), ctx)).status).toBe(200)
      const [passedSession] = settleSessionToPaymentIntent.mock.calls[0]
      expect(passedSession.totals.total).toBe(90000)
    })

    it('refuses a cart that no longer matches the authorization', async () => {
      readyDb({ ...APPROVED, approved_cart_fingerprint: '1-deadbeefdeadbeef' })
      const res = await COMPLETE(req(PAYMENT), ctx)
      expect(res.status).toBe(409)
      expect((await res.json()).code).toBe('cart_changed')
      expect(settleSessionToPaymentIntent).not.toHaveBeenCalled()
    })

    it('still settles a legacy row that carries no approval', async () => {
      readyDb({}, pageAt('$1,900'))
      expect((await COMPLETE(req(PAYMENT), ctx)).status).toBe(200)
    })
  })
})
