import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({
  configured: true,
  result: { selected: 4, refreshed: 3, failed: 1 },
}))

vi.mock('../../../../utils/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ marker: 'admin' })),
  hasSupabaseAdminEnv: vi.fn(() => refs.configured),
}))
vi.mock('../../../../lib/server/merchant-connectors', () => ({
  merchantConnectorStorageConfigured: vi.fn(() => refs.configured),
  refreshDueMerchantConnectorCredentials: vi.fn(async () => refs.result),
}))

import { GET } from './route'
import { refreshDueMerchantConnectorCredentials } from '../../../../lib/server/merchant-connectors'

describe('merchant connector credential cron', () => {
  afterEach(() => vi.unstubAllEnvs())

  beforeEach(() => {
    vi.clearAllMocks()
    refs.configured = true
    refs.result = { selected: 4, refreshed: 3, failed: 1 }
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CRON_SECRET', 'cron-secret')
  })

  it('rejects requests without the configured cron authorization', async () => {
    const response = await GET(new Request('https://nexez.test/api/cron/merchant-connector-credentials'))
    expect(response.status).toBe(401)
    expect(refreshDueMerchantConnectorCredentials).not.toHaveBeenCalled()
  })

  it('fails closed when encrypted credential storage is unavailable', async () => {
    refs.configured = false
    const response = await GET(new Request('https://nexez.test/api/cron/merchant-connector-credentials', {
      headers: { authorization: 'Bearer cron-secret' },
    }))
    expect(response.status).toBe(503)
  })

  it('runs the bounded refresh batch and exposes failures to monitoring', async () => {
    const response = await GET(new Request('https://nexez.test/api/cron/merchant-connector-credentials', {
      headers: { authorization: 'Bearer cron-secret' },
    }))
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ ok: false, selected: 4, refreshed: 3, failed: 1 })
    expect(refreshDueMerchantConnectorCredentials).toHaveBeenCalledWith({ marker: 'admin' })
  })

  it('returns success only when every selected credential refresh succeeds', async () => {
    refs.result = { selected: 3, refreshed: 3, failed: 0 }
    const response = await GET(new Request('https://nexez.test/api/cron/merchant-connector-credentials', {
      headers: { authorization: 'Bearer cron-secret' },
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, selected: 3, refreshed: 3, failed: 0 })
  })
})
