import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const {
  constructEvent,
  retrieveSubscription,
  hasSupabaseAdminEnv,
  createAdminClient,
  adminFrom,
  adminUpsert,
} = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  retrieveSubscription: vi.fn(),
  hasSupabaseAdminEnv: vi.fn(),
  createAdminClient: vi.fn(),
  adminFrom: vi.fn(),
  adminUpsert: vi.fn(),
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
    adminFrom.mockReturnValue({ upsert: adminUpsert })
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
})
