import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../../../test/supabase-mock'

vi.mock('../../../../utils/supabase/admin', () => ({ createAdminClient: vi.fn(), hasSupabaseAdminEnv: vi.fn() }))

import { POST } from './route'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

const post = (opts: { slug?: string; headers?: Record<string, string> } = {}) => {
  const u = new URL('https://nexez.test/api/webhooks/calendly')
  if (opts.slug) u.searchParams.set('slug', opts.slug)
  return new Request(u, { method: 'POST', headers: opts.headers || {}, body: '{}' }) as any
}

describe('POST /api/webhooks/calendly', () => {
  beforeEach(() => vi.clearAllMocks())

  it('412 when the service role is not configured', async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(false)
    expect((await POST(post({ slug: 'demo' }))).status).toBe(412)
  })

  it('400 when no page slug is provided', async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
    vi.mocked(createAdminClient).mockReturnValue(createSupabaseMock(() => ({ data: [] })) as any)
    expect((await POST(post())).status).toBe(400)
  })

  it('404 when no page matches the slug', async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
    vi.mocked(createAdminClient).mockReturnValue(createSupabaseMock(() => ({ data: [] })) as any)
    expect((await POST(post({ slug: 'missing' }))).status).toBe(404)
  })
})

// Bi-directional sync: real Calendly bookings drive the offer's advertised
// availability (only for offers with the maxBookingsPerWeek opt-in).
describe('POST /api/webhooks/calendly - availability sync', () => {
  const offer = (over: Record<string, any> = {}) => ({
    name: 'Deep Tissue Massage',
    description: '',
    price: '$90',
    url: 'https://calendly.com/acme/deep-tissue',
    source: 'calendly',
    rules: { maxBookingsPerWeek: 2 },
    ...over,
  })
  const pageRow = (over: Record<string, any> = {}) => ({
    id: 'pg1',
    owner_id: 'o1',
    slug: 'acme',
    name: 'Acme Massage',
    contact_email: null,
    services: [offer()],
    products: [],
    ...over,
  })

  type Counts = { checkout?: number; created?: number; canceled?: number }
  // Full-flow harness: page lookup, dev header-secret path (page_secrets null),
  // event insert, the 3 booking-count legs, and the pages update capture.
  function drive(page: Record<string, any>, counts: Counts) {
    const updates: any[] = []
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock((ctx) => {
        if (ctx.table === 'pages' && ctx.op === 'select') return { data: [page], error: null }
        if (ctx.table === 'pages' && ctx.op === 'update') {
          updates.push(ctx.payload)
          return { data: null, error: null }
        }
        if (ctx.table === 'checkout_events' && ctx.op === 'select') {
          const leg = ctx.eqs['metadata->>calendly_event_type']
          if (leg === 'invitee.created') return { count: counts.created ?? 0, data: null, error: null }
          if (leg === 'invitee.canceled') return { count: counts.canceled ?? 0, data: null, error: null }
          return { count: counts.checkout ?? 0, data: null, error: null }
        }
        return { data: null, error: null }
      }) as any,
    )
    return updates
  }

  const bookingPost = (event: string, eventName: string) =>
    new Request('https://nexez.test/api/webhooks/calendly?slug=acme', {
      method: 'POST',
      headers: { 'x-nexez-test-secret': 'shh' }, // dev header-secret path (non-prod)
      body: JSON.stringify({ event, payload: { event: { name: eventName }, invitee: { name: 'Ada' } } }),
    }) as any

  beforeEach(() => vi.clearAllMocks())

  it('invitee.created at the cap flips the offer to sold_out (agents see it before checkout refuses)', async () => {
    const updates = drive(pageRow(), { created: 2 })
    const res = await POST(bookingPost('invitee.created', 'Deep Tissue Massage'))
    expect(res.status).toBe(200)
    expect((await res.json()).availability_sync).toEqual({ offer_key: 'services-0', availability: 'sold_out' })
    const availabilityUpdate = updates.find((u) => u.services)
    expect(availabilityUpdate.services[0].availability).toBe('sold_out')
    expect(availabilityUpdate.services[0].metadata.last_calendly_sync).toBeTruthy()
  })

  it('invitee.canceled recomputes back down - and never stamps last_booking', async () => {
    const updates = drive(pageRow({ services: [offer({ availability: 'sold_out' })] }), { created: 2, canceled: 2 })
    const res = await POST(bookingPost('invitee.canceled', 'Deep Tissue Massage'))
    expect((await res.json()).availability_sync).toEqual({ offer_key: 'services-0', availability: 'available' })
    expect(updates.find((u) => u.services).services[0].availability).toBe('available')
    expect(updates.find((u) => u.last_booking)).toBeUndefined()
  })

  it('counts direct checkout bookings toward the same cap (shared counter)', async () => {
    const updates = drive(pageRow(), { checkout: 1, created: 1 })
    const res = await POST(bookingPost('invitee.created', 'Deep Tissue Massage'))
    // 1 checkout + 1 calendly = 2 of 2 -> sold_out
    expect((await res.json()).availability_sync).toEqual({ offer_key: 'services-0', availability: 'sold_out' })
    expect(updates.find((u) => u.services)).toBeTruthy()
  })

  it('no matching offer name -> acknowledged, availability untouched', async () => {
    const updates = drive(pageRow(), { created: 5 })
    const res = await POST(bookingPost('invitee.created', 'Some Other Event'))
    expect(res.status).toBe(200)
    expect((await res.json()).availability_sync).toBeNull()
    expect(updates.find((u) => u.services || u.products)).toBeUndefined()
  })

  it('offers without the booking-cap opt-in are never managed', async () => {
    const updates = drive(pageRow({ services: [offer({ rules: {} })] }), { created: 5 })
    const res = await POST(bookingPost('invitee.created', 'Deep Tissue Massage'))
    expect((await res.json()).availability_sync).toBeNull()
    expect(updates.find((u) => u.services)).toBeUndefined()
  })

  it('already-correct availability -> no page write (webhook redeliveries no-op)', async () => {
    const updates = drive(pageRow({ services: [offer({ availability: 'sold_out' })] }), { created: 3 })
    const res = await POST(bookingPost('invitee.created', 'Deep Tissue Massage'))
    expect((await res.json()).availability_sync).toBeNull()
    expect(updates.find((u) => u.services)).toBeUndefined()
  })
})
