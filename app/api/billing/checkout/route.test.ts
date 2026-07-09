import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSupabaseMock } from '../../../../test/supabase-mock'

const { checkoutSessionsCreate, subscriptionsList, subscriptionsUpdate } = vi.hoisted(() => ({
  checkoutSessionsCreate: vi.fn(),
  subscriptionsList: vi.fn(),
  subscriptionsUpdate: vi.fn(),
}))
vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { create: checkoutSessionsCreate } }
    subscriptions = { list: subscriptionsList, update: subscriptionsUpdate }
  },
}))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('../../../../utils/supabase/admin', () => ({ hasSupabaseAdminEnv: vi.fn(() => false), createAdminClient: vi.fn() }))
vi.mock('../../../../lib/billing', () => ({
  getBillingPlan: vi.fn(),
  getPlanPriceId: vi.fn(),
  isStripePriceId: (value: string | null | undefined) => typeof value === 'string' && value.trim().startsWith('price_'),
}))

import { POST } from './route'
import { createClient } from '../../../../utils/supabase/server'
import { getBillingPlan, getPlanPriceId } from '../../../../lib/billing'

const form = (plan: string) =>
  new Request('https://nexez.test/api/billing/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ plan }).toString(),
  })

describe('POST /api/billing/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no live subscription -> a first purchase creates a Checkout Session.
    subscriptionsList.mockResolvedValue({ data: [] })
  })
  afterEach(() => vi.unstubAllEnvs())

  it('redirects with ?error=plan for an unknown plan', async () => {
    vi.mocked(getBillingPlan).mockReturnValue(null as any)
    const res = await POST(form('bogus'))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/dashboard/billing?error=plan')
  })

  it('redirects to login when not authenticated', async () => {
    vi.mocked(getBillingPlan).mockReturnValue({ id: 'pro', name: 'Pro' } as any)
    vi.mocked(createClient).mockReturnValue(createSupabaseMock(() => ({ data: null }), { user: null }) as any)
    const res = await POST(form('pro'))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('redirects to Stripe setup when Stripe / price ID is not configured', async () => {
    vi.mocked(getBillingPlan).mockReturnValue({ id: 'pro', name: 'Pro' } as any)
    vi.mocked(getPlanPriceId).mockReturnValue('' as any)
    vi.mocked(createClient).mockReturnValue(createSupabaseMock(() => ({ data: null }), { user: { id: 'u1', email: 'a@b.c' } }) as any)
    const res = await POST(form('pro'))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('setup=stripe')
  })

  it('redirects to bad_price_id before contacting Stripe when a product id is configured', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_ready')
    vi.mocked(getBillingPlan).mockReturnValue({ id: 'pro', name: 'Pro' } as any)
    vi.mocked(getPlanPriceId).mockReturnValue('prod_wrong' as any)
    vi.mocked(createClient).mockReturnValue(createSupabaseMock(() => ({ data: null }), { user: { id: 'u1', email: 'a@b.c' } }) as any)

    const res = await POST(form('pro'))

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('error=bad_price_id')
    expect(checkoutSessionsCreate).not.toHaveBeenCalled()
  })

  it('creates a Stripe subscription checkout session and reuses a stored customer', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_ready')
    vi.mocked(getBillingPlan).mockReturnValue({ id: 'pro', name: 'Pro' } as any)
    vi.mocked(getPlanPriceId).mockReturnValue('price_pro' as any)
    checkoutSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/session' })
    vi.mocked(createClient).mockReturnValue(
      createSupabaseMock(
        (ctx) => (
          ctx.table === 'billing_subscriptions'
            ? { data: { stripe_customer_id: 'cus_existing' } }
            : { data: null }
        ),
        { user: { id: 'u1', email: 'a@b.c' } },
      ) as any,
    )

    const res = await POST(form('pro'))

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://checkout.stripe.test/session')
    expect(checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        customer: 'cus_existing',
        client_reference_id: 'u1',
        allow_promotion_codes: true,
        line_items: [{ price: 'price_pro', quantity: 1 }],
        metadata: expect.objectContaining({
          nexez_user_id: 'u1',
          nexez_plan: 'pro',
          nexez_price_id: 'price_pro',
          nexez_source: 'billing_page',
        }),
        subscription_data: {
          metadata: expect.objectContaining({
            nexez_user_id: 'u1',
            nexez_plan: 'pro',
            nexez_price_id: 'price_pro',
          }),
        },
      }),
    )
  })

  it('a live subscription makes a plan change UPDATE the sub in place — no second Checkout Session', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_ready')
    vi.mocked(getBillingPlan).mockReturnValue({ id: 'pro', name: 'Pro' } as any)
    vi.mocked(getPlanPriceId).mockReturnValue('price_pro' as any)
    vi.mocked(createClient).mockReturnValue(
      createSupabaseMock(
        (ctx) => (ctx.table === 'billing_subscriptions' ? { data: { stripe_customer_id: 'cus_existing' } } : { data: null }),
        { user: { id: 'u1', email: 'a@b.c' } },
      ) as any,
    )
    subscriptionsList.mockResolvedValue({
      data: [{ id: 'sub_live', status: 'active', items: { data: [{ id: 'si_1', price: { id: 'price_launch' } }] } }],
    })
    subscriptionsUpdate.mockResolvedValue({ id: 'sub_live', status: 'active' })

    const res = await POST(form('pro'))

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('plan_changed=pro')
    expect(subscriptionsUpdate).toHaveBeenCalledWith('sub_live', expect.objectContaining({
      items: [{ id: 'si_1', price: 'price_pro' }],
      proration_behavior: 'create_prorations',
    }))
    expect(checkoutSessionsCreate).not.toHaveBeenCalled()
  })
})
