import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../../../../../test/supabase-mock'

const h = vi.hoisted(() => ({
  user: { id: 'u1', email: 'o@x.com', email_confirmed_at: 't' } as any,
  gate: { ok: true } as any,
  configured: true,
  pat: 'pat' as string | null,
  imported: { ok: true, offers: [] as any[], note: 'n' } as any,
  busy: [] as any,
  page: { id: 'pg1', slug: 'acme', services: [] as any[], next_available: null } as any,
  pagesUpdate: null as any,
  secretsUpdate: null as any,
}))

vi.mock('next/headers', () => ({ cookies: async () => ({}) }))
vi.mock('../../../../../../lib/rate-limit', () => ({ enforceRateLimit: async () => null }))
vi.mock('../../../../../../utils/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}))
vi.mock('../../../../../../lib/server/integration-importers', () => ({
  gateIntegrationImport: async () => h.gate,
  importCalendlyOffers: async () => h.imported,
}))
vi.mock('../../../../../../lib/server/page-integration-credentials', () => ({
  integrationCredentialsConfigured: () => h.configured,
  getCalendlyPat: async () => h.pat,
}))
vi.mock('../../../../../../lib/server/calendly-write', () => ({ fetchCalendlyBusy: async () => h.busy }))
vi.mock('../../../../../../lib/observability', () => ({ captureEvent: vi.fn() }))
vi.mock('../../../../../../utils/supabase/admin', () => ({
  createAdminClient: () =>
    createSupabaseMock((ctx: any) => {
      if (ctx.table === 'pages' && ctx.op === 'select') return { data: h.page, error: null }
      if (ctx.table === 'pages' && ctx.op === 'update') {
        h.pagesUpdate = ctx.payload
        return { data: null, error: null }
      }
      if (ctx.table === 'page_secrets' && ctx.op === 'update') {
        h.secretsUpdate = ctx.payload
        return { data: null, error: null }
      }
      return { data: null, error: null }
    }),
}))

import { POST } from './route'

const req = () => new Request('https://nexez.test/api/pages/pg1/calendly/sync', { method: 'POST' })
const ctx = { params: Promise.resolve({ id: 'pg1' }) }
const calOffer = () => ({
  name: 'Intro Call', description: '', price: 'Custom', url: 'https://calendly.com/acme/intro',
  duration: '30 min', source: 'calendly', confidence: 0.92,
  metadata: { calendly_event_type: 'https://api.calendly.com/event_types/GB' },
})

describe('POST /api/pages/[id]/calendly/sync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-08T12:00:00.000Z'))
    h.user = { id: 'u1', email: 'o@x.com', email_confirmed_at: 't' }
    h.gate = { ok: true }
    h.configured = true
    h.pat = 'pat'
    h.imported = { ok: true, offers: [calOffer()], note: 'Imported 1' }
    h.busy = [{ start: '2026-07-08T14:00:00Z', end: '2026-07-08T15:00:00Z' }]
    h.page = { id: 'pg1', slug: 'acme', services: [{ name: 'Existing Service', price: '$10', description: '', url: '' }], next_available: null }
    h.pagesUpdate = null
    h.secretsUpdate = null
  })
  afterEach(() => vi.useRealTimers())

  it('401 when not authenticated', async () => {
    h.user = null
    expect((await POST(req(), ctx)).status).toBe(401)
  })

  it('propagates the gate failure status (access / Pro)', async () => {
    h.gate = { ok: false, status: 402, error: 'Upgrade to Pro' }
    const res = await POST(req(), ctx)
    expect(res.status).toBe(402)
    expect((await res.json()).error).toBe('Upgrade to Pro')
  })

  it('503 when the credential store is not configured (dormant)', async () => {
    h.configured = false
    expect((await POST(req(), ctx)).status).toBe(503)
  })

  it('400 when no PAT is connected yet', async () => {
    h.pat = null
    const res = await POST(req(), ctx)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/connect calendly/i)
  })

  it('502 when the live import fails (never partial)', async () => {
    h.imported = { ok: false, status: 502, error: 'Calendly rejected the request' }
    expect((await POST(req(), ctx)).status).toBe(502)
  })

  it('imports Calendly offers (preserving existing), stamps event-type URIs + availability windows', async () => {
    const res = await POST(req(), ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, imported: 1, availability_synced: true })
    expect(body.windows).toBeGreaterThan(0)

    // Existing offer preserved + Calendly offer added with its event-type URI.
    const services = h.pagesUpdate.services
    expect(services.find((o: any) => o.name === 'Existing Service')).toBeTruthy()
    const cal = services.find((o: any) => o.name === 'Intro Call')
    expect(cal.metadata.calendly_event_type).toBe('https://api.calendly.com/event_types/GB')
    expect(cal.availability).not.toBe('sold_out') // open calendar → available (undefined = available, no-op set)

    // Windows written to next_available + rotation cursor stamped.
    expect(h.pagesUpdate.next_available).toContain('||WINDOWS||')
    expect(h.secretsUpdate.calendly_synced_at).toBeTruthy()
  })

  it('a fully-booked calendar blocks the Calendly offer (sold_out)', async () => {
    h.busy = Array.from({ length: 8 }, (_, d) => ({ start: `2026-07-${String(8 + d).padStart(2, '0')}T00:00:00Z`, end: `2026-07-${String(9 + d).padStart(2, '0')}T00:00:00Z` }))
    await POST(req(), ctx)
    const cal = h.pagesUpdate.services.find((o: any) => o.name === 'Intro Call')
    expect(cal.availability).toBe('sold_out')
    expect(h.pagesUpdate.next_available).toContain('No open slots')
  })

  it('a failed availability fetch still imports offers but leaves next_available untouched', async () => {
    h.busy = null // fetchCalendlyBusy → null
    const res = await POST(req(), ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).availability_synced).toBe(false)
    expect(h.pagesUpdate.services.find((o: any) => o.name === 'Intro Call')).toBeTruthy()
    expect('next_available' in h.pagesUpdate).toBe(false) // never blanked
  })

  it('NEVER clobbers a same-named manual offer — preserves it and adds the Calendly one separately', async () => {
    // A real paid offer with the SAME name as an incoming Calendly event type.
    h.page.services = [{ name: 'Intro Call', price: '$199', description: 'hand-written booking copy', url: 'https://mysite.com/book' }]
    await POST(req(), ctx)
    const intros = h.pagesUpdate.services.filter((o: any) => o.name === 'Intro Call')
    expect(intros).toHaveLength(2) // manual preserved + Calendly added
    const manual = intros.find((o: any) => o.source !== 'calendly')
    expect(manual.price).toBe('$199') // price NOT overwritten to 'Custom'
    expect(manual.url).toBe('https://mysite.com/book') // url NOT overwritten
    const cal = intros.find((o: any) => o.source === 'calendly')
    expect(cal.metadata.calendly_event_type).toBe('https://api.calendly.com/event_types/GB')
  })

  it('preserves a hand-written availability note (does not stomp it with Calendly windows)', async () => {
    h.page.next_available = 'Booking paused until August — email us'
    await POST(req(), ctx)
    expect('next_available' in h.pagesUpdate).toBe(false) // manual note untouched
    // ...but Calendly offers still get imported.
    expect(h.pagesUpdate.services.find((o: any) => o.source === 'calendly')).toBeTruthy()
  })

  it('refreshes next_available when the prior value is already Calendly-managed (has the marker)', async () => {
    h.page.next_available = 'stale windows ||WINDOWS||[]'
    await POST(req(), ctx)
    expect(h.pagesUpdate.next_available).toContain('||WINDOWS||')
    expect(h.pagesUpdate.next_available).not.toBe('stale windows ||WINDOWS||[]')
  })
})
