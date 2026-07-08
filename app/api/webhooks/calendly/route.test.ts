import crypto from 'crypto'
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

// Signature verification: the route must accept REAL Calendly deliveries
// (Calendly-Webhook-Signature: t=...,v1=HMAC(`${t}.${body}`)) with a freshness
// window, and keep the legacy bare-hex HMAC(body) form for manual integrations.
describe('POST /api/webhooks/calendly - signature verification', () => {
  const SECRET = 'per-page-secret'
  const body = JSON.stringify({ event: 'invitee.created', payload: { event: { name: 'Nope' }, invitee: { name: 'Ada' } } })

  function withSecretPage() {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock((ctx) => {
        if (ctx.table === 'pages' && ctx.op === 'select') {
          return { data: [{ id: 'pg1', owner_id: 'o1', slug: 'acme', name: 'Acme', contact_email: null, services: [], products: [] }], error: null }
        }
        if (ctx.table === 'page_secrets') return { data: { calendly_webhook_secret: SECRET, outbound_webhooks: null }, error: null }
        if (ctx.table === 'checkout_events' && ctx.op === 'select') return { count: 0, data: null, error: null }
        return { data: null, error: null }
      }) as any,
    )
  }
  const signed = (header: string, value: string) =>
    new Request('https://nexez.test/api/webhooks/calendly?slug=acme', {
      method: 'POST',
      headers: { [header]: value },
      body,
    }) as any
  const hmac = (payload: string) => crypto.createHmac('sha256', SECRET).update(payload, 'utf8').digest('hex')

  beforeEach(() => vi.clearAllMocks())

  it("accepts Calendly's real scheme: t + v1 over `${t}.${body}` on the real header name", async () => {
    withSecretPage()
    const t = String(Math.floor(Date.now() / 1000))
    const res = await POST(signed('Calendly-Webhook-Signature', `t=${t},v1=${hmac(`${t}.${body}`)}`))
    expect(res.status).toBe(200)
  })

  it('rejects a stale timestamp even with a valid HMAC (replay protection)', async () => {
    withSecretPage()
    const stale = String(Math.floor(Date.now() / 1000) - 10 * 60)
    const res = await POST(signed('Calendly-Webhook-Signature', `t=${stale},v1=${hmac(`${stale}.${body}`)}`))
    expect(res.status).toBe(401)
  })

  it('keeps the legacy bare-hex HMAC(body) form on the x- header', async () => {
    withSecretPage()
    const res = await POST(signed('x-calendly-webhook-signature', hmac(body)))
    expect(res.status).toBe(200)
  })

  it('rejects a wrong signature outright', async () => {
    withSecretPage()
    const res = await POST(signed('Calendly-Webhook-Signature', `t=${Math.floor(Date.now() / 1000)},v1=${'ab'.repeat(32)}`))
    expect(res.status).toBe(401)
  })
})

// Cancel-on-refund linkage: a booking that arrived via a negotiation-tagged
// Calendly link (utm_content=nz_neg_<id>) records the scheduled-event URI on that
// negotiation — scoped to THIS page so a signed webhook can only touch its own.
describe('POST /api/webhooks/calendly - negotiation link', () => {
  const EVENT_URI = 'https://api.calendly.com/scheduled_events/EVENTUUID12345678'
  function drive(capture: any[]) {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock((ctx) => {
        if (ctx.table === 'pages' && ctx.op === 'select') {
          return { data: [{ id: 'pg1', owner_id: 'o1', slug: 'acme', name: 'Acme', contact_email: null, services: [], products: [] }], error: null }
        }
        if (ctx.table === 'agent_negotiations' && ctx.op === 'update') {
          capture.push({ payload: ctx.payload, calls: ctx.calls })
          return { data: null, error: null }
        }
        return { data: null, error: null }
      }) as any,
    )
  }
  const bookingPost = (payload: Record<string, any>) =>
    new Request('https://nexez.test/api/webhooks/calendly?slug=acme', {
      method: 'POST',
      headers: { 'x-nexez-test-secret': 'shh' },
      body: JSON.stringify({ event: 'invitee.created', payload }),
    }) as any

  beforeEach(() => vi.clearAllMocks())

  it('records the event URI on the tagged negotiation, scoped to this page, first-booking-wins', async () => {
    const captured: any[] = []
    drive(captured)
    const res = await POST(bookingPost({ event: { name: 'Intro', uri: EVENT_URI }, invitee: { name: 'Ada' }, tracking: { utm_content: 'nz_neg_neg-9' } }))
    expect(res.status).toBe(200)
    expect(captured).toHaveLength(1)
    expect(captured[0].payload).toEqual({ calendly_event_uri: EVENT_URI })
    expect(captured[0].calls).toContainEqual(['eq', 'id', 'neg-9'])
    expect(captured[0].calls).toContainEqual(['eq', 'page_id', 'pg1']) // cross-page contamination blocked
    expect(captured[0].calls).toContainEqual(['is', 'calendly_event_uri', null]) // never overwrite
  })

  it('ignores bookings with no tag or a foreign utm_content', async () => {
    const captured: any[] = []
    drive(captured)
    await POST(bookingPost({ event: { name: 'Intro', uri: EVENT_URI }, invitee: { name: 'Ada' }, tracking: { utm_content: 'spring-sale' } }))
    await POST(bookingPost({ event: { name: 'Intro', uri: EVENT_URI }, invitee: { name: 'Ada' } }))
    expect(captured).toHaveLength(0)
  })

  it('does not link on invitee.canceled (only real bookings)', async () => {
    const captured: any[] = []
    drive(captured)
    await POST(new Request('https://nexez.test/api/webhooks/calendly?slug=acme', {
      method: 'POST',
      headers: { 'x-nexez-test-secret': 'shh' },
      body: JSON.stringify({ event: 'invitee.canceled', payload: { event: { name: 'Intro', uri: EVENT_URI }, invitee: { name: 'Ada' }, tracking: { utm_content: 'nz_neg_neg-9' } } }),
    }) as any)
    expect(captured).toHaveLength(0)
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
