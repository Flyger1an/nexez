import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { QueryContext } from '../../../../test/supabase-mock'
import { createSupabaseMock } from '../../../../test/supabase-mock'

vi.mock('../../../../utils/supabase/admin', () => ({
  createAdminClient: vi.fn(),
  hasSupabaseAdminEnv: vi.fn(() => true),
}))
vi.mock('../../../../lib/negotiation.service', () => ({
  negotiationService: { runDecision: vi.fn().mockResolvedValue(undefined) },
}))
vi.mock('../../../../lib/observability', () => ({ captureError: vi.fn() }))

import { GET } from './route'
import { createAdminClient } from '../../../../utils/supabase/admin'
import { negotiationService } from '../../../../lib/negotiation.service'
import { captureError } from '../../../../lib/observability'

const SECRET = 'cron-secret-xyz'
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const get = (auth?: string) =>
  new Request('https://nexez.test/api/cron/process-negotiations', auth ? { headers: { authorization: auth } } : undefined)

describe('GET /api/cron/process-negotiations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', SECRET)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('401s without the CRON_SECRET bearer token', async () => {
    vi.mocked(createAdminClient).mockReturnValue(createSupabaseMock(() => ({ data: [], error: null })) as any)
    expect((await GET(get())).status).toBe(401)
    expect((await GET(get('Bearer wrong'))).status).toBe(401)
  })

  it('scans only stale pending rows and re-drives each via runDecision', async () => {
    let scan: QueryContext | null = null
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock((ctx) => {
        scan = ctx
        return { data: [{ id: 'n1', decision_requested_at: minsAgo(3) }, { id: 'n2', decision_requested_at: minsAgo(4) }], error: null }
      }) as any,
    )

    const res = await GET(get(`Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, scanned: 2, processed: 2, stuck: 0 })

    // The scan targets pending rows past the grace window (the atomic claim then
    // makes each runDecision safe vs. a concurrent after()).
    expect(scan!.eqs.decision_pending).toBe(true)
    expect(scan!.calls.some(([m, col]) => m === 'lt' && col === 'decision_requested_at')).toBe(true)
    expect(negotiationService.runDecision).toHaveBeenCalledWith('n1')
    expect(negotiationService.runDecision).toHaveBeenCalledWith('n2')
    expect(captureError).not.toHaveBeenCalled()
  })

  it('alerts (captureError) on a row stuck pending far past the threshold', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock(() => ({ data: [{ id: 'stuck-1', decision_requested_at: minsAgo(30) }], error: null })) as any,
    )
    const body = await (await GET(get(`Bearer ${SECRET}`))).json()
    expect(body.stuck).toBe(1)
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ negotiationId: 'stuck-1' }))
    // Still re-driven (the alert doesn't skip the work).
    expect(negotiationService.runDecision).toHaveBeenCalledWith('stuck-1')
  })
})
