import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSupabaseMock } from '../../../../test/supabase-mock'

const { customersCreate, subscriptionsCreate } = vi.hoisted(() => ({
  customersCreate: vi.fn(),
  subscriptionsCreate: vi.fn(),
}))

vi.mock('stripe', () => ({
  default: class {
    customers = { create: customersCreate }
    subscriptions = { create: subscriptionsCreate }
  },
}))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => false),
  createAdminClient: vi.fn(),
}))
vi.mock('../../../../lib/billing', () => ({
  getBillingPlan: vi.fn(),
  getPlanPriceId: vi.fn(),
  isStripePriceId: (value: string | null | undefined) => typeof value === 'string' && value.trim().startsWith('price_'),
}))

import { POST } from './route'
import { createClient } from '../../../../utils/supabase/server'
import { getBillingPlan, getPlanPriceId } from '../../../../lib/billing'

const jsonRequest = (body: Record<string, unknown>) =>
  new Request('https://nexez.test/api/billing/create-subscription', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/billing/create-subscription', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllEnvs())

  it('rejects unsupported plans', async () => {
    vi.mocked(getBillingPlan).mockReturnValue(null as any)

    const res = await POST(jsonRequest({ plan: 'bogus' }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('Invalid')
  })

  it('requires authentication', async () => {
    vi.mocked(getBillingPlan).mockReturnValue({ id: 'pro', name: 'Pro' } as any)
    vi.mocked(createClient).mockReturnValue(createSupabaseMock(() => ({ data: null }), { user: null }) as any)

    const res = await POST(jsonRequest({ plan: 'pro' }))

    expect(res.status).toBe(401)
  })

  it('returns setup guidance when Stripe or the plan price is missing', async () => {
    vi.mocked(getBillingPlan).mockReturnValue({ id: 'pro', name: 'Pro' } as any)
    vi.mocked(getPlanPriceId).mockReturnValue('')
    vi.mocked(createClient).mockReturnValue(createSupabaseMock(() => ({ data: null }), { user: { id: 'u1', email: 'a@b.c' } }) as any)

    const res = await POST(jsonRequest({ plan: 'pro' }))
    const body = await res.json()

    expect(res.status).toBe(412)
    expect(body.error).toContain('not configured')
  })

  it('rejects product ids before contacting Stripe', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_ready')
    vi.mocked(getBillingPlan).mockReturnValue({ id: 'pro', name: 'Pro' } as any)
    vi.mocked(getPlanPriceId).mockReturnValue('prod_wrong')
    vi.mocked(createClient).mockReturnValue(createSupabaseMock(() => ({ data: null }), { user: { id: 'u1', email: 'a@b.c' } }) as any)

    const res = await POST(jsonRequest({ plan: 'pro' }))
    const body = await res.json()

    expect(res.status).toBe(412)
    expect(body.error).toContain('Price ID')
    expect(subscriptionsCreate).not.toHaveBeenCalled()
  })

  it('creates an incomplete subscription and returns a client secret', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_ready')
    vi.mocked(getBillingPlan).mockReturnValue({ id: 'pro', name: 'Pro' } as any)
    vi.mocked(getPlanPriceId).mockReturnValue('price_pro')
    vi.mocked(createClient).mockReturnValue(
      createSupabaseMock(
        (ctx) => (ctx.table === 'billing_subscriptions' ? { data: { stripe_customer_id: 'cus_existing' } } : { data: null }),
        { user: { id: 'u1', email: 'a@b.c' } },
      ) as any,
    )
    subscriptionsCreate.mockResolvedValue({
      id: 'sub_1',
      latest_invoice: { payment_intent: { client_secret: 'pi_secret_123' } },
    })

    const res = await POST(jsonRequest({ plan: 'pro' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.clientSecret).toBe('pi_secret_123')
    expect(subscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_existing',
        items: [{ price: 'price_pro' }],
        payment_behavior: 'default_incomplete',
        metadata: expect.objectContaining({
          nexez_user_id: 'u1',
          nexez_plan: 'pro',
          nexez_price_id: 'price_pro',
          nexez_source: 'embedded_billing',
        }),
      }),
    )
  })

  it('returns setup guidance instead of a 500 when Stripe cannot find the configured price', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_ready')
    vi.mocked(getBillingPlan).mockReturnValue({ id: 'pro', name: 'Pro' } as any)
    vi.mocked(getPlanPriceId).mockReturnValue('price_missing')
    vi.mocked(createClient).mockReturnValue(
      createSupabaseMock(
        (ctx) => (ctx.table === 'billing_subscriptions' ? { data: { stripe_customer_id: 'cus_existing' } } : { data: null }),
        { user: { id: 'u1', email: 'a@b.c' } },
      ) as any,
    )
    subscriptionsCreate.mockRejectedValue({ message: 'No such price: price_missing', code: 'resource_missing', param: 'items[0][price]' })

    const res = await POST(jsonRequest({ plan: 'pro' }))
    const body = await res.json()

    expect(res.status).toBe(412)
    expect(body.error).toContain('misconfigured')
  })
})
