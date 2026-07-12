import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

const {
  constructEvent,
  retrieveSubscription,
  hasSupabaseAdminEnv,
  createAdminClient,
  adminFrom,
  adminUpsert,
  adminInsert,
} = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  retrieveSubscription: vi.fn(),
  hasSupabaseAdminEnv: vi.fn(),
  createAdminClient: vi.fn(),
  adminFrom: vi.fn(),
  adminUpsert: vi.fn(),
  adminInsert: vi.fn(),
}))
vi.mock('stripe', () => ({
  default: class {
    webhooks = { constructEvent }
    subscriptions = { retrieve: retrieveSubscription }
  },
}))
vi.mock('../../../../utils/supabase/admin', () => ({ createAdminClient, hasSupabaseAdminEnv }))

// Cancel-on-refund runs inside next/server `after`. Make `after` record-only so
// other tests are unaffected (callbacks simply never run unless a test drains
// them); the cancel-on-refund tests drain + await afterCbs explicitly.
const { afterCbs, cancelSpy } = vi.hoisted(() => ({
  afterCbs: [] as Array<() => unknown>,
  cancelSpy: vi.fn((_admin?: any, _neg?: any) => Promise.resolve({ cancelled: true as const })),
}))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => unknown) => { afterCbs.push(fn) } }
})
vi.mock('../../../../lib/server/calendly-cancel-on-refund', () => ({ cancelCalendlyForRefund: cancelSpy }))
vi.mock('../../../../lib/server/billing-checkout-attempt', () => ({ releaseBillingCheckoutAttempt: vi.fn(async () => true) }))

import { POST } from './route'

const post = (opts: { sig?: string; body?: string } = {}) =>
  new Request('https://nexez.test/api/webhooks/stripe', {
    method: 'POST',
    headers: opts.sig ? { 'stripe-signature': opts.sig } : {},
    body: opts.body ?? '{}',
  }) as any

describe('POST /api/webhooks/stripe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasSupabaseAdminEnv.mockReturnValue(false)
    adminUpsert.mockResolvedValue({ error: null })
    // .insert covers the new webhook event-id idempotency ledger (Burst 1).
    adminInsert.mockResolvedValue({ error: null })
    adminFrom.mockReturnValue({ upsert: adminUpsert, insert: adminInsert })
    createAdminClient.mockReturnValue({ from: adminFrom })
  })
  afterEach(() => vi.unstubAllEnvs())

  it('412 when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    expect((await POST(post({ sig: 't=1,v1=x' }))).status).toBe(412)
  })

  it('400 when the Stripe signature header is missing', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
    expect((await POST(post({}))).status).toBe(400)
  })

  it('401 when signature verification fails', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
    constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature')
    })
    expect((await POST(post({ sig: 'bad' }))).status).toBe(401)
  })

  it('200 acknowledges a verified event', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
    constructEvent.mockReturnValue({ type: 'checkout.session.completed', data: { object: {} } })
    const res = await POST(post({ sig: 'good', body: '{"id":"evt_1"}' }))
    expect(res.status).toBe(200)
    expect((await res.json()).received).toBe(true)
  })

  it('verifies against the connected-accounts secret when the account secret fails (multi-endpoint)', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_account')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET_CONNECT', 'whsec_connect')
    // The connected-account endpoint signs with its OWN secret; the account secret
    // must NOT verify it, the connect secret must.
    constructEvent.mockImplementation((_body: string, _sig: string, secret: string) => {
      if (secret === 'whsec_connect') return { type: 'checkout.session.completed', data: { object: {} } }
      throw new Error('No signatures found matching the expected signature')
    })
    const res = await POST(post({ sig: 'good', body: '{"id":"evt_connect_1"}' }))
    expect(res.status).toBe(200)
    expect((await res.json()).received).toBe(true)
    // Both secrets were tried (account first, then connect).
    expect(constructEvent).toHaveBeenCalledTimes(2)
  })

  it('syncs billing checkout sessions into billing_subscriptions', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_ready')
    vi.stubEnv('STRIPE_PRICE_PRO', 'price_pro')
    hasSupabaseAdminEnv.mockReturnValue(true)
    retrieveSubscription.mockResolvedValue({
      id: 'sub_123',
      status: 'active',
      customer: 'cus_123',
      metadata: { nexez_user_id: 'user_1', nexez_plan: 'pro', nexez_price_id: 'price_pro' },
      cancel_at_period_end: false,
      latest_invoice: 'in_123',
      items: {
        data: [
          {
            price: { id: 'price_pro' },
            current_period_start: 1_700_000_000,
            current_period_end: 1_702_592_000,
          },
        ],
      },
    })
    constructEvent.mockReturnValue({
      id: 'evt_checkout',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_123',
          payment_status: 'paid',
          customer: 'cus_123',
          subscription: 'sub_123',
          metadata: {
            nexez_source: 'billing_page',
            nexez_user_id: 'user_1',
            nexez_plan: 'pro',
            nexez_price_id: 'price_pro',
          },
        },
      },
    })

    const res = await POST(post({ sig: 'good', body: '{"id":"evt_checkout"}' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.billing).toBe(true)
    expect(adminFrom).toHaveBeenCalledWith('billing_subscriptions')
    expect(adminUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: 'user_1',
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: 'sub_123',
        stripe_price_id: 'price_pro',
        plan_id: 'pro',
        status: 'active',
      }),
      { onConflict: 'owner_id' },
    )
  })

  it('syncs subscription lifecycle events into billing_subscriptions', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
    vi.stubEnv('STRIPE_PRICE_SCALE', 'price_scale')
    hasSupabaseAdminEnv.mockReturnValue(true)
    constructEvent.mockReturnValue({
      id: 'evt_sub',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_456',
          status: 'past_due',
          customer: 'cus_456',
          metadata: { nexez_user_id: 'user_2', nexez_plan: 'scale', nexez_price_id: 'price_scale' },
          cancel_at_period_end: true,
          latest_invoice: { id: 'in_456' },
          items: {
            data: [
              {
                price: { id: 'price_scale' },
                current_period_start: 1_710_000_000,
                current_period_end: 1_712_592_000,
              },
            ],
          },
        },
      },
    })

    const res = await POST(post({ sig: 'good', body: '{"id":"evt_sub"}' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.billing).toBe(true)
    expect(adminUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: 'user_2',
        stripe_customer_id: 'cus_456',
        stripe_subscription_id: 'sub_456',
        stripe_price_id: 'price_scale',
        plan_id: 'scale',
        status: 'past_due',
        cancel_at_period_end: true,
      }),
      { onConflict: 'owner_id' },
    )
  })

  describe('billing entitlement hardening (audit leftovers)', () => {
    beforeEach(() => {
      vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
      vi.stubEnv('STRIPE_PRICE_PRO', 'price_pro')
      hasSupabaseAdminEnv.mockReturnValue(true)
    })

    it('IGNORES a connected-account subscription event (never writes platform entitlements)', async () => {
      // A connected Express account emits customer.subscription.updated carrying an
      // attacker-chosen nexez_user_id/nexez_plan. Must not clobber the victim's plan.
      constructEvent.mockReturnValue({
        id: 'evt_connect_sub',
        account: 'acct_evil',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_x', status: 'active', customer: 'cus_x',
            metadata: { nexez_user_id: 'victim', nexez_plan: 'scale', nexez_price_id: 'price_pro' },
            items: { data: [{ price: { id: 'price_pro' }, current_period_start: 1, current_period_end: 2 }] },
          },
        },
      })

      const res = await POST(post({ sig: 'good', body: '{"id":"evt_connect_sub"}' }))
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.billing).toBe(false)
      expect(String(json.reason)).toMatch(/connect/i)
      expect(adminUpsert).not.toHaveBeenCalled()
    })

    it('RELEASES the idempotency claim when the billing upsert 500s (Stripe can retry, not swallow)', async () => {
      const deletedEventIds: string[] = []
      createAdminClient.mockReturnValue(
        createSupabaseMock((ctx: QueryContext) => {
          if (ctx.table === 'stripe_webhook_events' && ctx.op === 'delete') {
            deletedEventIds.push(ctx.eqs.event_id)
            return { error: null }
          }
          if (ctx.table === 'billing_subscriptions' && ctx.op === 'upsert') {
            return { error: { message: 'db pool timeout' } } // transient failure
          }
          return { data: null, error: null } // ledger insert: no conflict
        }) as any,
      )
      constructEvent.mockReturnValue({
        id: 'evt_sub_fail',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_f', status: 'active', customer: 'cus_f',
            metadata: { nexez_user_id: 'user_9', nexez_plan: 'pro', nexez_price_id: 'price_pro' },
            items: { data: [{ price: { id: 'price_pro' }, current_period_start: 1, current_period_end: 2 }] },
          },
        },
      })

      const res = await POST(post({ sig: 'good', body: '{"id":"evt_sub_fail"}' }))

      expect(res.status).toBe(500)
      // The claim was released → Stripe's retry reprocesses instead of being 200-duplicated.
      expect(deletedEventIds).toContain('evt_sub_fail')
    })
  })

  describe('negotiation escrow checkout sessions', () => {
    beforeEach(() => {
      vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
      hasSupabaseAdminEnv.mockReturnValue(true)
    })

    function withEscrowNeg(neg: any) {
      let updated: any
      createAdminClient.mockReturnValue(
        createSupabaseMock((ctx: QueryContext) => {
          if (ctx.table === 'agent_negotiations' && ctx.op === 'update') {
            updated = ctx.payload
            return { data: neg, error: null }
          }
          if (ctx.table === 'agent_negotiations') return { data: neg, error: null }
          return { data: null, error: null }
        }) as any,
      )
      return () => updated
    }

    it('settles only when the completed session matches current money terms', async () => {
      const getUpd = withEscrowNeg({
        id: 'n1',
        status: 'agreement_proposed',
        amount_cents: 90000,
        currency: 'usd',
        settlement_state: 'auto',
        stripe_checkout_session_id: 'cs_current',
      })
      constructEvent.mockReturnValue({
        id: 'evt_escrow',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_current',
            amount_total: 90000,
            currency: 'usd',
            payment_status: 'paid',
            payment_intent: 'pi_1',
            metadata: {
              nexez_kind: 'negotiation_escrow',
              nexez_negotiation_id: 'n1',
              nexez_settlement: 'auto',
            },
          },
        },
      })

      const res = await POST(post({ sig: 'good', body: '{}' }))
      expect(res.status).toBe(200)
      expect(getUpd()).toMatchObject({ status: 'complete', escrow_mode: 'captured', stripe_payment_intent_id: 'pi_1' })
    })

    it('ignores stale completed sessions with an old amount', async () => {
      const getUpd = withEscrowNeg({
        id: 'n1',
        status: 'agreement_proposed',
        amount_cents: 120000,
        currency: 'usd',
        settlement_state: 'auto',
        stripe_checkout_session_id: 'cs_current',
      })
      constructEvent.mockReturnValue({
        id: 'evt_stale',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_old',
            amount_total: 90000,
            currency: 'usd',
            payment_status: 'paid',
            payment_intent: 'pi_old',
            metadata: {
              nexez_kind: 'negotiation_escrow',
              nexez_negotiation_id: 'n1',
              nexez_settlement: 'auto',
            },
          },
        },
      })

      const res = await POST(post({ sig: 'good', body: '{}' }))
      const json = await res.json()
      expect(res.status).toBe(200)
      expect(json).toMatchObject({ ignored: true, reason: 'stale_or_mismatched_checkout_session' })
      expect(getUpd()).toBeUndefined()
    })
  })

  // Burst 2: refund / dispute / cancel reversals matched by payment intent.
  describe('escrow reversals', () => {
    function withNeg(neg: any) {
      let updated: any
      hasSupabaseAdminEnv.mockReturnValue(true)
      createAdminClient.mockReturnValue(
        createSupabaseMock((ctx: QueryContext) => {
          if (ctx.table === 'agent_negotiations' && ctx.op === 'update') updated = ctx.payload
          if (ctx.table === 'agent_negotiations') return { data: neg, error: null }
          return { data: null, error: null } // stripe_webhook_events dedupe insert: no conflict
        }) as any,
      )
      return () => updated
    }

    beforeEach(() => vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test'))

    it('charge.refunded → refunded', async () => {
      const getUpd = withNeg({ id: 'n1', status: 'complete', metadata: {} })
      constructEvent.mockReturnValue({ id: 'evt_r', type: 'charge.refunded', data: { object: { payment_intent: 'pi_1', amount_refunded: 9000 } } })
      const res = await POST(post({ sig: 'good', body: '{}' }))
      expect(res.status).toBe(200)
      expect(getUpd().status).toBe('refunded')
    })

    it('charge.dispute.created → disputed', async () => {
      const getUpd = withNeg({ id: 'n1', status: 'complete', metadata: {} })
      constructEvent.mockReturnValue({ id: 'evt_d', type: 'charge.dispute.created', data: { object: { payment_intent: 'pi_1', reason: 'fraudulent', amount: 9000, status: 'needs_response' } } })
      await POST(post({ sig: 'good', body: '{}' }))
      const upd = getUpd()
      expect(upd.status).toBe('disputed')
      expect((upd.metadata as any).dispute.reason).toBe('fraudulent')
    })

    it('charge.dispute.closed lost → refunded, won → complete', async () => {
      const getLost = withNeg({ id: 'n1', status: 'disputed', metadata: {} })
      constructEvent.mockReturnValue({ id: 'evt_dl', type: 'charge.dispute.closed', data: { object: { payment_intent: 'pi_1', status: 'lost' } } })
      await POST(post({ sig: 'good', body: '{}' }))
      expect(getLost().status).toBe('refunded')

      const getWon = withNeg({ id: 'n1', status: 'disputed', metadata: {} })
      constructEvent.mockReturnValue({ id: 'evt_dw', type: 'charge.dispute.closed', data: { object: { payment_intent: 'pi_1', status: 'won' } } })
      await POST(post({ sig: 'good', body: '{}' }))
      expect(getWon().status).toBe('complete')
    })

    it('payment_intent.canceled flips a held negotiation to declined', async () => {
      const getUpd = withNeg({ id: 'n1', status: 'held', metadata: {} })
      constructEvent.mockReturnValue({ id: 'evt_c', type: 'payment_intent.canceled', data: { object: { id: 'pi_1' } } })
      await POST(post({ sig: 'good', body: '{}' }))
      expect(getUpd().status).toBe('declined')
    })

    it('no matching negotiation → 200, no change', async () => {
      hasSupabaseAdminEnv.mockReturnValue(true)
      createAdminClient.mockReturnValue(createSupabaseMock(() => ({ data: null, error: null })) as any)
      constructEvent.mockReturnValue({ id: 'evt_x', type: 'charge.refunded', data: { object: { payment_intent: 'pi_unknown' } } })
      const res = await POST(post({ sig: 'good', body: '{}' }))
      expect(res.status).toBe(200)
      expect((await res.json()).matched).toBe(false)
    })
  })

  describe('ACP order-status webhook (A4)', () => {
    const drain = async () => {
      for (const cb of afterCbs) await cb()
    }
    let fetchSpy: ReturnType<typeof vi.fn>
    beforeEach(() => {
      vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
      afterCbs.length = 0
      hasSupabaseAdminEnv.mockReturnValue(true)
      fetchSpy = vi.fn(async () => ({ ok: true, status: 200 }))
      vi.stubGlobal('fetch', fetchSpy)
    })
    afterEach(() => vi.unstubAllGlobals())

    function withAcpOrder(orderOver: Record<string, any> = {}) {
      createAdminClient.mockReturnValue(
        createSupabaseMock((ctx: QueryContext) => {
          if (ctx.table === 'agent_negotiations') return { data: null, error: null }
          if (ctx.table === 'checkout_orders' && ctx.op === 'select') {
            return {
              data: { id: 'ord_1', status: 'paid', metadata: {}, offer_name: 'X', page_id: 'pg1', currency: 'usd', slug: 'acme', buyer_email: null, access_token: 'tok', channel: 'acp', ...orderOver },
              error: null,
            }
          }
          if (ctx.table === 'checkout_sessions') return { data: { id: 'sess_1' }, error: null }
          return { data: null, error: null }
        }) as any,
      )
    }
    const refundEvent = (id: string) => ({ id, type: 'charge.refunded', account: 'acct_seller', data: { object: { payment_intent: 'pi_1', amount: 9000, amount_refunded: 9000 } } })

    it('POSTs order_updated (status canceled + refunds) to OpenAI on a full refund', async () => {
      vi.stubEnv('ACP_ORDER_WEBHOOK_URL', 'https://openai.example/orders')
      vi.stubEnv('ACP_ORDER_WEBHOOK_SECRET', 's3cret')
      withAcpOrder()
      constructEvent.mockReturnValue(refundEvent('evt_acp_r'))
      await POST(post({ sig: 'good', body: '{}' }))
      await drain()
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe('https://openai.example/orders')
      const body = JSON.parse(init.body as string)
      expect(body.type).toBe('order_updated')
      expect(body.data).toMatchObject({ type: 'order', id: 'pi_1', checkout_session_id: 'sess_1', status: 'canceled' })
      expect(body.data.refunds[0]).toMatchObject({ amount: 9000, currency: 'usd' })
      expect((init.headers as Record<string, string>).signature).toBeTruthy()
    })

    it('does NOT fire when the order webhook is unconfigured (dormant)', async () => {
      withAcpOrder()
      constructEvent.mockReturnValue(refundEvent('evt_acp_r2'))
      await POST(post({ sig: 'good', body: '{}' }))
      await drain()
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('does NOT fire for a non-ACP (agent_checkout) order', async () => {
      vi.stubEnv('ACP_ORDER_WEBHOOK_URL', 'https://openai.example/orders')
      vi.stubEnv('ACP_ORDER_WEBHOOK_SECRET', 's3cret')
      withAcpOrder({ channel: 'agent_checkout' })
      constructEvent.mockReturnValue(refundEvent('evt_ac_r'))
      await POST(post({ sig: 'good', body: '{}' }))
      await drain()
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  // Cancel-on-refund: only a FULL refund / lost dispute (status → 'refunded') on a
  // Calendly-linked negotiation releases the calendar hold. Partials never do.
  describe('escrow reversals - Calendly cancel-on-refund', () => {
    const EVENT_URI = 'https://api.calendly.com/scheduled_events/EVENTUUID12345678'
    function withNeg(neg: any) {
      hasSupabaseAdminEnv.mockReturnValue(true)
      createAdminClient.mockReturnValue(
        createSupabaseMock((ctx: QueryContext) => {
          if (ctx.table === 'agent_negotiations') return { data: neg, error: null }
          return { data: null, error: null }
        }) as any,
      )
    }
    const linked = (over: Record<string, any> = {}) => ({ id: 'n1', status: 'complete', metadata: {}, page_id: 'pg1', calendly_event_uri: EVENT_URI, calendly_cancelled_at: null, ...over })
    const drain = async () => { for (const cb of afterCbs) await cb() }

    beforeEach(() => { vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test'); afterCbs.length = 0 })

    it('full refund cancels the linked booking', async () => {
      withNeg(linked())
      constructEvent.mockReturnValue({ id: 'evt_rc', type: 'charge.refunded', data: { object: { payment_intent: 'pi_1', amount: 9000, amount_refunded: 9000 } } })
      await POST(post({ sig: 'good', body: '{}' }))
      await drain()
      expect(cancelSpy).toHaveBeenCalledTimes(1)
      expect(cancelSpy.mock.calls[0]![1]).toMatchObject({ id: 'n1', page_id: 'pg1', calendly_event_uri: EVENT_URI })
    })

    it('PARTIAL refund does NOT cancel the booking', async () => {
      withNeg(linked())
      constructEvent.mockReturnValue({ id: 'evt_rp', type: 'charge.refunded', data: { object: { payment_intent: 'pi_1', amount: 9000, amount_refunded: 4000 } } })
      await POST(post({ sig: 'good', body: '{}' }))
      await drain()
      expect(cancelSpy).not.toHaveBeenCalled()
    })

    it('lost dispute (→ refunded) also cancels the booking', async () => {
      withNeg(linked({ status: 'disputed' }))
      constructEvent.mockReturnValue({ id: 'evt_dll', type: 'charge.dispute.closed', data: { object: { payment_intent: 'pi_1', status: 'lost' } } })
      await POST(post({ sig: 'good', body: '{}' }))
      await drain()
      expect(cancelSpy).toHaveBeenCalledTimes(1)
    })

    it('won dispute (→ complete) does NOT cancel', async () => {
      withNeg(linked({ status: 'disputed' }))
      constructEvent.mockReturnValue({ id: 'evt_dw', type: 'charge.dispute.closed', data: { object: { payment_intent: 'pi_1', status: 'won' } } })
      await POST(post({ sig: 'good', body: '{}' }))
      await drain()
      expect(cancelSpy).not.toHaveBeenCalled()
    })

    it('no linked booking → no cancel attempt', async () => {
      withNeg(linked({ calendly_event_uri: null }))
      constructEvent.mockReturnValue({ id: 'evt_rn', type: 'charge.refunded', data: { object: { payment_intent: 'pi_1', amount: 9000, amount_refunded: 9000 } } })
      await POST(post({ sig: 'good', body: '{}' }))
      await drain()
      expect(cancelSpy).not.toHaveBeenCalled()
    })

    it('already-cancelled booking → skipped (idempotent)', async () => {
      withNeg(linked({ calendly_cancelled_at: '2026-07-08T00:00:00Z' }))
      constructEvent.mockReturnValue({ id: 'evt_ra', type: 'charge.refunded', data: { object: { payment_intent: 'pi_1', amount: 9000, amount_refunded: 9000 } } })
      await POST(post({ sig: 'good', body: '{}' }))
      await drain()
      expect(cancelSpy).not.toHaveBeenCalled()
    })
  })

  describe('direct-checkout orders', () => {
    beforeEach(() => vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test'))

    it('session.completed (agent_checkout) → persists a checkout_orders row with the captured PI', async () => {
      hasSupabaseAdminEnv.mockReturnValue(true)
      let upserted: any
      createAdminClient.mockReturnValue(
        createSupabaseMock((ctx: QueryContext) => {
          if (ctx.table === 'checkout_orders' && ctx.op === 'upsert') upserted = ctx.payload
          return { data: null, error: null }
        }) as any,
      )
      constructEvent.mockReturnValue({
        id: 'evt_dc',
        type: 'checkout.session.completed',
        account: 'acct_x',
        data: {
          object: {
            id: 'cs_dc', payment_status: 'paid', payment_intent: 'pi_dc', amount_total: 5000, currency: 'usd',
            metadata: { nexez_source: 'agent_checkout', nexez_owner_id: 'owner-1', nexez_page_id: 'pg1', nexez_page_slug: 'acme', nexez_offer_name: 'Audit', nexez_offer_key: 's0', nexez_application_fee_cents: '750' },
          },
        },
      })
      const res = await POST(post({ sig: 'good', body: '{}' }))
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ order: true, status: 'paid' })
      expect(upserted).toMatchObject({ owner_id: 'owner-1', stripe_session_id: 'cs_dc', stripe_payment_intent_id: 'pi_dc', amount_cents: 5000, currency: 'usd', status: 'paid', application_fee_cents: 750, stripe_connect_account_id: 'acct_x' })
    })

    it('charge.refunded with no negotiation but a matching ORDER → order refunded', async () => {
      hasSupabaseAdminEnv.mockReturnValue(true)
      let updated: any
      createAdminClient.mockReturnValue(
        createSupabaseMock((ctx: QueryContext) => {
          if (ctx.table === 'agent_negotiations') return { data: null, error: null }
          if (ctx.table === 'checkout_orders') {
            if (ctx.op === 'update') {
              updated = ctx.payload
              return { data: null, error: null }
            }
            return { data: { id: 'o1', status: 'paid', metadata: {}, page_id: 'pg1', currency: 'usd', offer_name: 'Audit', slug: 'acme' }, error: null }
          }
          return { data: null, error: null }
        }) as any,
      )
      constructEvent.mockReturnValue({ id: 'evt_or', type: 'charge.refunded', data: { object: { payment_intent: 'pi_dc', amount_refunded: 5000 } } })
      const res = await POST(post({ sig: 'good', body: '{}' }))
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ order: 'o1', status: 'refunded' })
      expect(updated.status).toBe('refunded')
    })
  })

  // Bi-directional catalog sync: price.updated rewrites imported offers in place.
  describe('price.updated → offer price sync', () => {
    const priceEvent = (eventOver: Record<string, any> = {}, priceOver: Record<string, any> = {}) => ({
      id: 'evt_price',
      type: 'price.updated',
      data: { object: { id: 'price_1', active: true, unit_amount: 5500, recurring: null, ...priceOver } },
      ...eventOver,
    })
    const stripeOffer = (over: Record<string, any> = {}) => ({
      name: 'Deep Clean',
      description: 'Imported from Stripe',
      price: '$40',
      url: '',
      source: 'stripe',
      metadata: { stripe_price_id: 'price_1', stripe_product_id: 'prod_1' },
      ...over,
    })
    // Handler + context recorder; the default arm also serves the event ledger insert.
    function withDb(handler: (ctx: QueryContext) => { data?: any; error?: any } | undefined) {
      const contexts: QueryContext[] = []
      hasSupabaseAdminEnv.mockReturnValue(true)
      createAdminClient.mockReturnValue(
        createSupabaseMock((ctx: QueryContext) => {
          contexts.push(ctx)
          return handler(ctx) ?? { data: null, error: null }
        }) as any,
      )
      return contexts
    }
    const containsColumn = (ctx: QueryContext) => ctx.calls.find((c) => c[0] === 'contains')?.[1]

    beforeEach(() => vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test'))

    it('connect event scopes to the connected account owner and rewrites only matching offers', async () => {
      const page = {
        id: 'pg1',
        slug: 'acme',
        owner_id: 'owner-1',
        services: [stripeOffer(), stripeOffer({ name: 'Manual add', source: undefined, metadata: {} })],
        products: [],
      }
      const contexts = withDb((ctx) => {
        if (ctx.table === 'billing_subscriptions') return { data: { owner_id: 'owner-1' }, error: null }
        if (ctx.table === 'pages' && ctx.op === 'select') {
          return { data: containsColumn(ctx) === 'services' ? [page] : [], error: null }
        }
        return undefined
      })
      constructEvent.mockReturnValue(priceEvent({ account: 'acct_1' }))
      const res = await POST(post({ sig: 'good', body: '{}' }))
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ offersUpdated: 1, pagesTouched: 1 })
      // Tenancy: every pages read carried the resolved owner filter.
      const pageSelects = contexts.filter((c) => c.table === 'pages' && c.op === 'select')
      expect(pageSelects.length).toBeGreaterThan(0)
      for (const c of pageSelects) expect(c.eqs.owner_id).toBe('owner-1')
      const update = contexts.find((c) => c.table === 'pages' && c.op === 'update')!
      expect(update.eqs.id).toBe('pg1')
      expect(update.payload.services[0]).toMatchObject({ name: 'Deep Clean', price: '$55' })
      expect(update.payload.services[0].metadata.last_stripe_sync).toBeTruthy()
      expect(update.payload.services[1].price).toBe('$40') // non-Stripe offer untouched
      // Audit trail lands in the analytics vocabulary.
      const audit = contexts.find((c) => c.table === 'checkout_events' && c.op === 'insert')!
      expect(audit.payload).toMatchObject({ page_id: 'pg1', event_type: 'stripe_price_sync' })
      expect(audit.payload.metadata.changes).toEqual([{ name: 'Deep Clean', from: '$40', to: '$55' }])
    })

    it('price.created reaches product-keyed offers via the stripe_product_id fallback', async () => {
      const page = {
        id: 'pg3',
        slug: 'beta',
        owner_id: 'owner-2',
        services: [],
        products: [stripeOffer({ name: 'Product-keyed', metadata: { stripe_product_id: 'prod_1' } })],
      }
      const contexts = withDb((ctx) => {
        if (ctx.table === 'pages' && ctx.op === 'select') {
          const marker = ctx.calls.find((c) => c[0] === 'contains')?.[2]?.[0]
          const byProduct = marker?.metadata?.stripe_product_id === 'prod_1'
          return { data: containsColumn(ctx) === 'products' && byProduct ? [page] : [], error: null }
        }
        return undefined
      })
      constructEvent.mockReturnValue(priceEvent({ type: 'price.created' }, { product: 'prod_1' }))
      const res = await POST(post({ sig: 'good', body: '{}' }))
      expect(await res.json()).toMatchObject({ type: 'price.created', offersUpdated: 1, pagesTouched: 1 })
      const update = contexts.find((c) => c.table === 'pages' && c.op === 'update')!
      expect(update.payload.products[0].price).toBe('$55')
    })

    it('unknown connected account → acknowledged, pages never queried (no cross-tenant writes)', async () => {
      const contexts = withDb((ctx) => {
        if (ctx.table === 'billing_subscriptions') return { data: null, error: null }
        return undefined
      })
      constructEvent.mockReturnValue(priceEvent({ account: 'acct_stranger' }))
      const res = await POST(post({ sig: 'good', body: '{}' }))
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ skipped: 'unknown connected account' })
      expect(contexts.some((c) => c.table === 'pages')).toBe(false)
    })

    it('platform event (no account) matches by price id alone; recurring format + Standard tier follow', async () => {
      const page = {
        id: 'pg2',
        slug: 'gamma',
        owner_id: 'owner-3',
        services: [],
        products: [stripeOffer({
          price: '$40 / month',
          tiers: [{ name: 'Standard', price: '$40 / month', description: 'Recurring via Stripe' }],
        })],
      }
      const contexts = withDb((ctx) => {
        if (ctx.table === 'pages' && ctx.op === 'select') {
          return { data: containsColumn(ctx) === 'products' ? [page] : [], error: null }
        }
        return undefined
      })
      constructEvent.mockReturnValue(priceEvent({}, { recurring: { interval: 'month' } }))
      const res = await POST(post({ sig: 'good', body: '{}' }))
      expect(await res.json()).toMatchObject({ offersUpdated: 1, pagesTouched: 1 })
      expect(contexts.some((c) => c.table === 'billing_subscriptions')).toBe(false)
      for (const c of contexts.filter((x) => x.table === 'pages' && x.op === 'select')) {
        expect('owner_id' in c.eqs).toBe(false)
      }
      const update = contexts.find((c) => c.table === 'pages' && c.op === 'update')!
      expect(update.payload.products[0].price).toBe('$55 / month')
      expect(update.payload.products[0].tiers[0].price).toBe('$55 / month')
    })

    it('inactive price → skipped, listings keep the last synced price', async () => {
      const contexts = withDb(() => undefined)
      constructEvent.mockReturnValue(priceEvent({}, { active: false }))
      const res = await POST(post({ sig: 'good', body: '{}' }))
      expect(await res.json()).toMatchObject({ skipped: 'inactive price' })
      expect(contexts.some((c) => c.table === 'pages')).toBe(false)
    })

    it('already-current offers → no write issued (redelivery past the ledger no-ops)', async () => {
      const page = { id: 'pg1', slug: 'acme', owner_id: 'owner-1', services: [stripeOffer({ price: '$55' })], products: [] }
      const contexts = withDb((ctx) => {
        if (ctx.table === 'pages' && ctx.op === 'select') {
          return { data: containsColumn(ctx) === 'services' ? [page] : [], error: null }
        }
        return undefined
      })
      constructEvent.mockReturnValue(priceEvent())
      const res = await POST(post({ sig: 'good', body: '{}' }))
      expect(await res.json()).toMatchObject({ offersUpdated: 0, pagesTouched: 0 })
      expect(contexts.some((c) => c.table === 'pages' && c.op === 'update')).toBe(false)
      expect(contexts.some((c) => c.table === 'checkout_events')).toBe(false)
    })
  })

  describe('payment_intent.succeeded (ACP/UCP settlement)', () => {
    function withDb(handler: (ctx: QueryContext) => { data?: any; error?: any } | undefined) {
      const contexts: QueryContext[] = []
      hasSupabaseAdminEnv.mockReturnValue(true)
      createAdminClient.mockReturnValue(
        createSupabaseMock((ctx: QueryContext) => {
          contexts.push(ctx)
          return handler(ctx) ?? { data: null, error: null }
        }) as any,
      )
      return contexts
    }
    beforeEach(() => vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test'))

    const piEvent = (metadata: Record<string, string>, over: Record<string, any> = {}) => ({
      id: 'evt_pi',
      type: 'payment_intent.succeeded',
      account: 'acct_seller',
      data: { object: { id: 'pi_777', amount: 120000, currency: 'usd', status: 'succeeded', metadata, ...over } },
    })
    const fullMeta = {
      nexez_session_id: 'sess_abc',
      nexez_owner_id: 'owner-1',
      nexez_page_id: 'pg1',
      nexez_page_slug: 'acme',
      nexez_offer_name: 'Strategy Session',
      nexez_offer_key: 'services-0',
      nexez_application_fee_cents: '12000',
      nexez_commission_percent: '10',
      nexez_source: 'acp',
      nexez_buyer_email: 'buyer@x.com',
    }

    it('persists an ACP order keyed on the PI (amount + channel from the PI, not a session)', async () => {
      const contexts = withDb(() => undefined)
      constructEvent.mockReturnValue(piEvent(fullMeta))
      const res = await POST(post({ sig: 'good', body: '{}' }))
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ order: true, status: 'paid', channel: 'acp' })
      const upsert = contexts.find((c) => c.table === 'checkout_orders' && c.op === 'upsert')!
      expect(upsert).toBeTruthy()
      expect(upsert.payload).toMatchObject({
        owner_id: 'owner-1',
        page_id: 'pg1',
        slug: 'acme',
        offer_name: 'Strategy Session',
        offer_key: 'services-0',
        stripe_payment_intent_id: 'pi_777',
        stripe_connect_account_id: 'acct_seller',
        amount_cents: 120000,
        currency: 'usd',
        application_fee_cents: 12000,
        commission_percent: 10,
        status: 'paid',
        channel: 'acp',
        buyer_email: 'buyer@x.com',
      })
      // No hosted Checkout Session id is set for a delegated-token charge.
      expect('stripe_session_id' in upsert.payload).toBe(false)
    })

    it('ignores a PI without nexez_session_id (a hosted-checkout / negotiation PI never double-persists)', async () => {
      const contexts = withDb(() => undefined)
      constructEvent.mockReturnValue(piEvent({ some: 'thing' }))
      const res = await POST(post({ sig: 'good', body: '{}' }))
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ order: false, reason: 'not a commerce-core session' })
      expect(contexts.some((c) => c.table === 'checkout_orders')).toBe(false)
    })

    it('nulls channel when nexez_source is absent or forged (CHECK-guarded)', async () => {
      const contexts = withDb(() => undefined)
      constructEvent.mockReturnValue(piEvent({ ...fullMeta, nexez_source: 'evil' }))
      await POST(post({ sig: 'good', body: '{}' }))
      const upsert = contexts.find((c) => c.table === 'checkout_orders' && c.op === 'upsert')!
      expect(upsert.payload.channel).toBeNull()
    })

    it('order:false when the owner metadata is empty (no charge attribution)', async () => {
      const contexts = withDb(() => undefined)
      constructEvent.mockReturnValue(piEvent({ ...fullMeta, nexez_owner_id: '' }))
      const res = await POST(post({ sig: 'good', body: '{}' }))
      expect(await res.json()).toMatchObject({ order: false, reason: 'missing owner/amount' })
      expect(contexts.some((c) => c.table === 'checkout_orders')).toBe(false)
    })

    it('releases the idempotency ledger when the order upsert 500s (Stripe can retry, not swallow)', async () => {
      const contexts = withDb((ctx) => {
        if (ctx.table === 'checkout_orders' && ctx.op === 'upsert') return { error: { message: 'boom' } }
        return undefined
      })
      constructEvent.mockReturnValue(piEvent(fullMeta))
      const res = await POST(post({ sig: 'good', body: '{}' }))
      expect(res.status).toBe(500)
      expect(contexts.some((c) => c.table === 'stripe_webhook_events' && c.op === 'delete')).toBe(true)
    })
  })
})
