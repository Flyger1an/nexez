import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

const refs = vi.hoisted(() => ({ createAdminClient: vi.fn(), captureEvent: vi.fn() }))
vi.mock('../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: refs.createAdminClient,
}))
vi.mock('../../../../lib/observability', () => ({ captureError: vi.fn(), captureEvent: refs.captureEvent }))

import { GET } from './route'

describe('GET /api/cron/scan-retention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', 'cron-secret')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('requires cron authorization', async () => {
    const response = await GET(new Request('https://nexez.ai/api/cron/scan-retention'))
    expect(response.status).toBe(401)
  })

  it('removes only expired contact rows and retains suppression records', async () => {
    const deletes: QueryContext[] = []
    refs.createAdminClient.mockReturnValue(createSupabaseMock((ctx) => {
      deletes.push({ ...ctx, calls: [...ctx.calls] })
      return { data: [{ id: ctx.calls.some((call) => call[0] === 'not') ? 'converted' : 'unconverted' }], error: null }
    }))

    const response = await GET(new Request('https://nexez.ai/api/cron/scan-retention', {
      headers: { authorization: 'Bearer cron-secret' },
    }))
    const body = await response.json()

    expect(body).toMatchObject({ ok: true, removedUnconverted: 1, removedConverted: 1, retainedSuppressions: true })
    expect(deletes).toHaveLength(2)
    expect(deletes.every((query) => query.table === 'scan_leads' && query.op === 'delete')).toBe(true)
    expect(deletes.some((query) => query.calls.some((call) => call[0] === 'or' && String(call[1]).includes('unsubscribed_at')))).toBe(true)
    expect(refs.captureEvent).toHaveBeenCalledWith('scan.retention', { removedUnconverted: 1, removedConverted: 1 })
  })
})
