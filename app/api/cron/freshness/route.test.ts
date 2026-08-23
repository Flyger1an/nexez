import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSupabaseMock } from '../../../../test/supabase-mock'

vi.mock('../../../../utils/supabase/admin', () => ({ createAdminClient: vi.fn(), hasSupabaseAdminEnv: vi.fn() }))
// Never hit the network for drift-checks in tests.
const { analyzeSiteMock } = vi.hoisted(() => ({
  analyzeSiteMock: vi.fn(async () => ({ structuredOffers: [] })),
}))
vi.mock('../../../../lib/importer', () => ({ analyzeSite: analyzeSiteMock }))

const { sendEmailMock, ownerEmailMock, hasEmailEnvMock, buildMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(async (): Promise<{ ok: boolean; error?: string }> => ({ ok: true })),
  ownerEmailMock: vi.fn(async () => 'owner@example.com'),
  hasEmailEnvMock: vi.fn(() => true),
  buildMock: vi.fn(async () => ({ subject: 's', html: 'h', text: 't' })),
}))
vi.mock('../../../../lib/email', () => ({
  hasEmailEnv: hasEmailEnvMock,
  sendEmail: sendEmailMock,
  buildStaleListingEmail: buildMock,
}))
vi.mock('../../../../lib/server/owner-email', () => ({ resolveOwnerNotifyEmail: ownerEmailMock }))

import { GET } from './route'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

const OLD = new Date(Date.now() - 200 * 86400000).toISOString() // 200 days → stale (>90)
const stalePage = (over: Record<string, any> = {}) => ({
  id: 'pg1',
  owner_id: 'o1',
  contact_email: null,
  slug: 'acme',
  name: 'Acme',
  website_url: 'https://acme.example.com',
  is_published: true,
  updated_at: OLD,
  created_at: OLD,
  services: [],
  products: [],
  ...over,
})

function drive(pages: any[], ledger: any[] = []) {
  const upserts: any[] = []
  vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
  vi.mocked(createAdminClient).mockReturnValue(
    createSupabaseMock((ctx) => {
      if (ctx.table === 'pages' && ctx.op === 'select') return { data: pages, error: null }
      if (ctx.table === 'page_freshness_nudges' && ctx.op === 'select') return { data: ledger, error: null }
      if (ctx.table === 'page_freshness_nudges' && ctx.op === 'upsert') {
        upserts.push(ctx.payload)
        return { data: null, error: null }
      }
      return { data: null, error: null }
    }) as any,
  )
  return upserts
}

// No CRON_SECRET set + NODE_ENV=test → the auth gate passes (local-dev path).
const req = (auth?: string) =>
  new Request('https://nexez.test/api/cron/freshness', { headers: auth ? { authorization: auth } : {} })

describe('GET /api/cron/freshness - stale re-interview nudge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasEmailEnvMock.mockReturnValue(true)
    sendEmailMock.mockResolvedValue({ ok: true })
    ownerEmailMock.mockResolvedValue('owner@example.com')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('401 when the cron secret is set but not presented', async () => {
    vi.stubEnv('CRON_SECRET', 'shh')
    expect((await GET(req())).status).toBe(401)
  })

  it('nudges a stale, never-nudged page and stamps the cooldown ledger', async () => {
    const upserts = drive([stalePage()], [])
    const json = await (await GET(req())).json()
    expect(json.nudged).toBe(1)
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    expect(ownerEmailMock).toHaveBeenCalledWith({ contactEmail: null, ownerId: 'o1' })
    expect(upserts[0]).toMatchObject({ page_id: 'pg1', owner_id: 'o1', nudge_count: 1 })
    expect(analyzeSiteMock).toHaveBeenCalledWith('https://acme.example.com', null, { skipLlm: true })
  })

  it('does NOT nudge a page still inside its cooldown window', async () => {
    const recent = new Date(Date.now() - 5 * 86400000).toISOString()
    drive([stalePage()], [{ page_id: 'pg1', last_nudged_at: recent, nudge_count: 2 }])
    const json = await (await GET(req())).json()
    expect(json.nudged).toBe(0)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('increments nudge_count when the cooldown has elapsed', async () => {
    const old = new Date(Date.now() - 60 * 86400000).toISOString()
    const upserts = drive([stalePage()], [{ page_id: 'pg1', last_nudged_at: old, nudge_count: 2 }])
    await GET(req())
    expect(upserts[0]).toMatchObject({ page_id: 'pg1', nudge_count: 3 })
  })

  it('skips nudging entirely when email is not configured (still reports staleness)', async () => {
    hasEmailEnvMock.mockReturnValue(false)
    drive([stalePage()], [])
    const json = await (await GET(req())).json()
    expect(json.nudged).toBe(0)
    expect(json.stale_count).toBe(1)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('does not stamp the ledger when the send fails (retries next run)', async () => {
    sendEmailMock.mockResolvedValue({ ok: false, error: 'resend down' })
    const upserts = drive([stalePage()], [])
    const json = await (await GET(req())).json()
    expect(json.nudged).toBe(0)
    expect(json.nudge_errors).toEqual(['acme'])
    expect(upserts).toHaveLength(0)
  })

  it('does not nudge a fresh page (below the stale threshold)', async () => {
    const fresh = stalePage({ updated_at: new Date().toISOString(), created_at: new Date().toISOString() })
    drive([fresh], [])
    const json = await (await GET(req())).json()
    expect(json.stale_count).toBe(0)
    expect(json.nudged).toBe(0)
  })
})
