import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../../../test/supabase-mock'

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('../../../../lib/billing', () => ({ getBillingPlan: vi.fn(), getPlanPriceId: vi.fn() }))

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
  beforeEach(() => vi.clearAllMocks())

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
})
