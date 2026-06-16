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
})
