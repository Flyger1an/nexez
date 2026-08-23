import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSupabaseMock } from '../../../../test/supabase-mock'

vi.mock('../../../../utils/supabase/admin', () => ({ createAdminClient: vi.fn(), hasSupabaseAdminEnv: vi.fn() }))
const { planRef } = vi.hoisted(() => ({ planRef: { deniedOwners: new Set<string>() } }))
vi.mock('../../../../lib/server/plan', () => ({
  getOwnerPlanIds: vi.fn(async (_admin: unknown, ownerIds: string[]) => Object.fromEntries(
    ownerIds.map((ownerId) => [ownerId, planRef.deniedOwners.has(ownerId) ? 'free' : 'pro']),
  )),
}))

import { GET } from './route'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

const req = (auth?: string) =>
  new Request('https://nexez.test/api/cron/availability-refresh', {
    headers: auth ? { authorization: auth } : {},
  })

const managedOffer = (over: Record<string, any> = {}) => ({
  name: 'Deep Tissue Massage',
  description: '',
  price: '$90',
  url: '',
  source: 'calendly',
  rules: { maxBookingsPerWeek: 2 },
  availability: 'sold_out',
  metadata: { last_calendly_sync: '2026-06-30T00:00:00.000Z' },
  ...over,
})

function drive(pages: any[], counts: { checkout?: number; created?: number; canceled?: number } = {}) {
  const updates: any[] = []
  vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
  vi.mocked(createAdminClient).mockReturnValue(
    createSupabaseMock((ctx) => {
      if (ctx.table === 'pages' && ctx.op === 'select') return { data: pages, error: null }
      if (ctx.table === 'pages' && ctx.op === 'update') {
        updates.push({ id: ctx.eqs.id, payload: ctx.payload })
        return { data: null, error: null }
      }
      if (ctx.table === 'checkout_events') {
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

describe('GET /api/cron/availability-refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    planRef.deniedOwners.clear()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('401 without the cron secret', async () => {
    vi.stubEnv('CRON_SECRET', 'topsecret')
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('Bearer wrong'))).status).toBe(401)
  })

  it('relaxes a stale sold_out back to available when the rolling week frees up', async () => {
    vi.stubEnv('CRON_SECRET', 'topsecret')
    const updates = drive(
      [{ id: 'pg1', owner_id: 'owner-1', slug: 'acme', services: [managedOffer()], products: [] }],
      { created: 0 }, // the sold-out week rolled past the window
    )
    const res = await GET(req('Bearer topsecret'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, offersChecked: 1, columnsUpdated: 1 })
    expect(updates[0].id).toBe('pg1')
    expect(updates[0].payload.services[0].availability).toBe('available')
  })

  it('skips unmanaged offers: no cap, or no last_calendly_sync stamp (manual availability preserved)', async () => {
    vi.stubEnv('CRON_SECRET', 'topsecret')
    const updates = drive([
      {
        id: 'pg1',
        owner_id: 'owner-1',
        slug: 'acme',
        services: [
          managedOffer({ metadata: {} }), // capped but never webhook-synced -> owner's value
          managedOffer({ rules: {} }), // stamped but cap removed -> opt-out
        ],
        products: [],
      },
    ])
    const res = await GET(req('Bearer topsecret'))
    expect(await res.json()).toMatchObject({ ok: true, offersChecked: 0, columnsUpdated: 0 })
    expect(updates).toHaveLength(0)
  })

  it('leaves already-correct offers unwritten', async () => {
    vi.stubEnv('CRON_SECRET', 'topsecret')
    const updates = drive(
      [{ id: 'pg1', owner_id: 'owner-1', slug: 'acme', services: [managedOffer()], products: [] }],
      { created: 3 }, // still at/over cap -> stays sold_out, nothing to write
    )
    const res = await GET(req('Bearer topsecret'))
    expect(await res.json()).toMatchObject({ ok: true, offersChecked: 1, columnsUpdated: 0 })
    expect(updates).toHaveLength(0)
  })

  it('skips managed availability mutation after an integrations downgrade', async () => {
    vi.stubEnv('CRON_SECRET', 'topsecret')
    planRef.deniedOwners.add('owner-1')
    const updates = drive(
      [{ id: 'pg1', owner_id: 'owner-1', slug: 'acme', services: [managedOffer()], products: [] }],
      { created: 0 },
    )

    const res = await GET(req('Bearer topsecret'))

    expect(await res.json()).toMatchObject({
      ok: true,
      offersChecked: 0,
      columnsUpdated: 0,
      entitlementSkipped: 1,
    })
    expect(updates).toHaveLength(0)
  })

  it('does not count an unmanaged downgraded page as suspended automation', async () => {
    vi.stubEnv('CRON_SECRET', 'topsecret')
    planRef.deniedOwners.add('owner-1')
    const updates = drive([{
      id: 'pg1',
      owner_id: 'owner-1',
      slug: 'acme',
      services: [managedOffer({ metadata: {} })],
      products: [],
    }])

    const res = await GET(req('Bearer topsecret'))

    expect(await res.json()).toMatchObject({ entitlementSkipped: 0, offersChecked: 0 })
    expect(updates).toHaveLength(0)
  })
})
