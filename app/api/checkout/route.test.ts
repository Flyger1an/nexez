import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QueryContext } from '../../../test/supabase-mock'

const { dbRef, adminRef } = vi.hoisted(() => ({
  dbRef: { handler: (_c: any) => ({ data: null, error: null }) as { data?: any; error?: any; count?: number | null } },
  adminRef: { handler: (_c: any) => ({ data: null, error: null }) as { data?: any; error?: any; count?: number | null } },
}))

vi.mock('../../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../../test/supabase-mock')
  return { supabase: createSupabaseMock((c) => dbRef.handler(c)) }
})
vi.mock('../../../utils/supabase/admin', async () => {
  const { createSupabaseMock } = await import('../../../test/supabase-mock')
  return {
    hasSupabaseAdminEnv: vi.fn(() => true),
    createAdminClient: vi.fn(() => createSupabaseMock((c) => adminRef.handler(c))),
  }
})
vi.mock('../../../lib/server/log-checkout-event', () => ({
  logCheckoutEvent: vi.fn(async () => ({ ok: true })),
}))

import { POST } from './route'

const fixedPage = (rules?: Record<string, unknown>) => ({
  id: 'p1',
  owner_id: 'o1',
  slug: 'demo',
  name: 'Demo Co',
  services: [
    {
      name: 'Deep Clean',
      price: '$150',
      description: '',
      url: 'https://book.example.com/deep-clean',
      ...(rules ? { rules } : {}),
    },
  ],
  products: [],
  is_published: true,
})

const post = (body: unknown) =>
  new Request('https://nexez.test/api/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/checkout — Smart Rules calendar protection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbRef.handler = () => ({ data: null, error: null })
    adminRef.handler = () => ({ data: null, error: null, count: 0 })
  })

  it('409 when the weekly booking cap is reached (count from checkout_events)', async () => {
    dbRef.handler = (c: QueryContext) => (c.table === 'pages' ? { data: fixedPage({ maxBookingsPerWeek: 2 }), error: null } : { data: null })
    adminRef.handler = () => ({ data: null, error: null, count: 2 })
    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('booking_rules')
    expect(body.error).toMatch(/booking limit/i)
  })

  it('proceeds to the provider redirect when under the cap', async () => {
    dbRef.handler = (c: QueryContext) => (c.table === 'pages' ? { data: fixedPage({ maxBookingsPerWeek: 2 }), error: null } : { data: null })
    adminRef.handler = () => ({ data: null, error: null, count: 1 })
    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect(res.status).toBe(200)
    expect((await res.json()).url).toBe('https://book.example.com/deep-clean')
  })

  it('409 on a blackout date even without the service role', async () => {
    const { hasSupabaseAdminEnv } = await import('../../../utils/supabase/admin')
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(false)
    const today = new Date().toISOString().slice(0, 10)
    dbRef.handler = (c: QueryContext) => (c.table === 'pages' ? { data: fixedPage({ blackoutDates: [today] }), error: null } : { data: null })
    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/blackout/i)
  })

  it('offers without rules are unaffected (no admin count query)', async () => {
    const { createAdminClient } = await import('../../../utils/supabase/admin')
    dbRef.handler = (c: QueryContext) => (c.table === 'pages' ? { data: fixedPage(), error: null } : { data: null })
    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect(res.status).toBe(200)
    expect(vi.mocked(createAdminClient)).not.toHaveBeenCalled()
  })
})
