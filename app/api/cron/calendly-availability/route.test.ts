import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSupabaseMock } from '../../../../test/supabase-mock'

vi.mock('../../../../utils/supabase/admin', () => ({ createAdminClient: vi.fn(), hasSupabaseAdminEnv: vi.fn() }))
const { credRef } = vi.hoisted(() => ({ credRef: { configured: true, pat: 'pat' as string | null, busy: [] as any } }))
vi.mock('../../../../lib/server/page-integration-credentials', () => ({
  integrationCredentialsConfigured: () => credRef.configured,
  getCalendlyPat: async () => credRef.pat,
}))
vi.mock('../../../../lib/server/calendly-write', () => ({
  fetchCalendlyBusy: async () => credRef.busy,
}))

import { GET } from './route'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

const req = (auth?: string) =>
  new Request('https://nexez.test/api/cron/calendly-availability', { headers: auth ? { authorization: auth } : {} })

const calOffer = (over: Record<string, any> = {}) => ({ name: 'Intro Call', description: '', price: 'Custom', url: '', source: 'calendly', ...over })

function drive(page: any | null) {
  const updates: any[] = []
  vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
  vi.mocked(createAdminClient).mockReturnValue(
    createSupabaseMock((ctx) => {
      if (ctx.table === 'page_secrets') return { data: page ? [{ page_id: page.id }] : [], error: null }
      if (ctx.table === 'pages' && ctx.op === 'select') return { data: page ? [page] : [], error: null }
      if (ctx.table === 'pages' && ctx.op === 'update') {
        updates.push({ id: ctx.eqs.id, payload: ctx.payload })
        return { data: null, error: null }
      }
      return { data: null, error: null }
    }) as any,
  )
  return updates
}

const pageWith = (over: Record<string, any> = {}) => ({ id: 'pg1', slug: 'acme', services: [calOffer()], products: [], next_available: null, ...over })

describe('GET /api/cron/calendly-availability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-08T12:00:00.000Z'))
    credRef.configured = true
    credRef.pat = 'pat'
    credRef.busy = []
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('401 without the cron secret', async () => {
    vi.stubEnv('CRON_SECRET', 'shh')
    expect((await GET(req())).status).toBe(401)
  })

  it('503 (dormant) when the credential store is not configured', async () => {
    credRef.configured = false
    drive(pageWith())
    expect((await GET(req())).status).toBe(503)
  })

  it('open calendar → publishes windows and keeps the offer available', async () => {
    // A busy block that leaves the rest of the week open.
    credRef.busy = [{ start: '2026-07-08T14:00:00Z', end: '2026-07-08T15:00:00Z' }]
    const updates = drive(pageWith())
    const json = await (await GET(req())).json()
    expect(json.ok).toBe(true)
    const upd = updates.find((u) => u.id === 'pg1')!
    expect(upd.payload.next_available).toContain('||WINDOWS||')
    expect(upd.payload.next_available).toContain('Next open slots')
    // offer stays available → not written into services (no change)
    expect(upd.payload.services).toBeUndefined()
  })

  it('a fully-booked calendar BLOCKS the Calendly offer (sold_out) + notes no slots', async () => {
    // Busy across the whole horizon → deriveAvailabilityWindows returns [].
    const busy: any[] = []
    for (let d = 0; d < 8; d++) busy.push({ start: `2026-07-${String(8 + d).padStart(2, '0')}T00:00:00Z`, end: `2026-07-${String(9 + d).padStart(2, '0')}T00:00:00Z` })
    credRef.busy = busy
    const updates = drive(pageWith())
    await GET(req())
    const upd = updates.find((u) => u.id === 'pg1')!
    expect(upd.payload.next_available).toContain('No open slots')
    expect(upd.payload.services[0].availability).toBe('sold_out')
    expect(upd.payload.services[0].metadata.last_calendly_sync).toBeTruthy()
  })

  it('only Calendly-sourced offers are blocked (manual offers untouched)', async () => {
    credRef.busy = Array.from({ length: 8 }, (_, d) => ({ start: `2026-07-${String(8 + d).padStart(2, '0')}T00:00:00Z`, end: `2026-07-${String(9 + d).padStart(2, '0')}T00:00:00Z` }))
    const updates = drive(pageWith({ services: [calOffer(), { name: 'Manual', description: '', price: '$10', url: '' }] }))
    await GET(req())
    const upd = updates.find((u) => u.id === 'pg1')!
    expect(upd.payload.services[0].availability).toBe('sold_out') // calendly
    expect(upd.payload.services[1].availability).toBeUndefined() // manual, untouched
  })

  it('rotates fairly: orders candidates by calendly_synced_at (oldest first) and stamps the batch', async () => {
    credRef.busy = [{ start: '2026-07-08T14:00:00Z', end: '2026-07-08T15:00:00Z' }]
    const calls: any[] = []
    const stamps: any[] = []
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock((ctx) => {
        if (ctx.table === 'page_secrets' && ctx.op === 'select') {
          calls.push(ctx.calls)
          return { data: [{ page_id: 'pg1' }], error: null }
        }
        if (ctx.table === 'page_secrets' && ctx.op === 'update') {
          stamps.push({ payload: ctx.payload, calls: ctx.calls })
          return { data: null, error: null }
        }
        if (ctx.table === 'pages' && ctx.op === 'select') return { data: [pageWith()], error: null }
        return { data: null, error: null }
      }) as any,
    )
    await GET(req())
    // candidate query ordered by the rotation cursor, oldest/never first
    expect(calls[0]).toContainEqual(['order', 'calendly_synced_at', { ascending: true, nullsFirst: true }])
    // the batch is stamped so it rotates to the back
    expect(stamps[0].payload.calendly_synced_at).toBeTruthy()
    expect(stamps[0].calls).toContainEqual(['in', 'page_id', ['pg1']])
  })

  it('a failed Calendly fetch leaves the listing untouched (no blank-out)', async () => {
    credRef.busy = null // fetchCalendlyBusy → null
    const updates = drive(pageWith())
    const json = await (await GET(req())).json()
    expect(json.failed).toBe(1)
    expect(updates).toHaveLength(0)
  })

  it('does not re-write when the open slots are unchanged (no churn)', async () => {
    credRef.busy = [{ start: '2026-07-08T14:00:00Z', end: '2026-07-08T15:00:00Z' }]
    // Seed next_available with the exact windows this run will compute.
    const { deriveAvailabilityWindows } = await import('../../../../lib/integrations')
    const windows = deriveAvailabilityWindows(credRef.busy, { days: 7 })
    const updates = drive(pageWith({ next_available: `x ||WINDOWS||${JSON.stringify(windows)}` }))
    await GET(req())
    expect(updates).toHaveLength(0)
  })
})
