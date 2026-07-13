import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  admin: true,
  credentials: true,
  run: { queued: 1, claimed: 1, synced: 1, failed: 0, skipped: 0 },
}))

vi.mock('../../../../utils/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({})),
  hasSupabaseAdminEnv: vi.fn(() => h.admin),
}))
vi.mock('../../../../lib/server/page-integration-credentials', () => ({
  integrationCredentialsConfigured: vi.fn(() => h.credentials),
}))
vi.mock('../../../../lib/server/shopify-catalog-sync', () => ({
  processPendingShopifyCatalogSyncs: vi.fn(async () => h.run),
}))

import { GET } from './route'
import { processPendingShopifyCatalogSyncs } from '../../../../lib/server/shopify-catalog-sync'

const request = (auth?: string) => new Request('https://app.nexez.ai/api/cron/shopify-catalog-sync', {
  headers: auth ? { authorization: auth } : undefined,
})

describe('GET /api/cron/shopify-catalog-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', 'cron-secret')
    h.admin = true
    h.credentials = true
  })

  it('rejects requests without the cron bearer secret', async () => {
    expect((await GET(request())).status).toBe(401)
    expect(processPendingShopifyCatalogSyncs).not.toHaveBeenCalled()
  })

  it('processes a bounded batch for an authorized cron request', async () => {
    const res = await GET(request('Bearer cron-secret'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, queued: 1, synced: 1 })
    expect(processPendingShopifyCatalogSyncs).toHaveBeenCalledWith(expect.anything(), 4)
  })

  it('fails closed when credential storage is unavailable', async () => {
    h.credentials = false
    expect((await GET(request('Bearer cron-secret'))).status).toBe(503)
  })
})
