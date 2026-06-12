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

/**
 * The cron issues three agent_negotiations reads: the stale-pending SCAN
 * (select 'id, decision_requested_at'), the backlog COUNT (head:true), and the
 * OLDEST pending lookup (select 'decision_requested_at'). Route each here.
 */
function adminMock(opts: {
  scanRows?: Array<{ id: string; decision_requested_at: string }>
  backlog?: number
  oldestPendingAt?: string | null
  onScan?: (ctx: QueryContext) => void
}) {
  return createSupabaseMock((ctx: QueryContext) => {
    const sel = ctx.calls.find((c) => c[0] === 'select') as [string, string, any?] | undefined
    const proj = sel?.[1]
    const selOpts = sel?.[2]
    if (selOpts?.head) return { count: opts.backlog ?? 0, error: null }
    if (proj === 'decision_requested_at') {
      return { data: opts.oldestPendingAt ? { decision_requested_at: opts.oldestPendingAt } : null, error: null }
    }
    opts.onScan?.(ctx)
    return { data: opts.scanRows ?? [], error: null }
  })
}

describe('GET /api/cron/process-negotiations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', SECRET)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('401s without the CRON_SECRET bearer token', async () => {
    vi.mocked(createAdminClient).mockReturnValue(adminMock({}) as any)
    expect((await GET(get())).status).toBe(401)
    expect((await GET(get('Bearer wrong'))).status).toBe(401)
  })

  it('scans only stale pending rows and re-drives each via runDecision', async () => {
    let scan: QueryContext | null = null
    vi.mocked(createAdminClient).mockReturnValue(
      adminMock({
        scanRows: [{ id: 'n1', decision_requested_at: minsAgo(3) }, { id: 'n2', decision_requested_at: minsAgo(4) }],
        backlog: 2,
        oldestPendingAt: minsAgo(4),
        onScan: (ctx) => (scan = ctx),
      }) as any,
    )

    const res = await GET(get(`Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, scanned: 2, processed: 2, stuck: 0, backlog: 2 })

    expect(scan!.eqs.decision_pending).toBe(true)
    expect(scan!.calls.some(([m, col]) => m === 'lt' && col === 'decision_requested_at')).toBe(true)
    expect(negotiationService.runDecision).toHaveBeenCalledWith('n1')
    expect(negotiationService.runDecision).toHaveBeenCalledWith('n2')
    expect(captureError).not.toHaveBeenCalled()
  })

  it('alerts (captureError) on a row stuck pending far past the threshold', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      adminMock({ scanRows: [{ id: 'stuck-1', decision_requested_at: minsAgo(30) }], backlog: 1, oldestPendingAt: minsAgo(3) }) as any,
    )
    const body = await (await GET(get(`Bearer ${SECRET}`))).json()
    expect(body.stuck).toBe(1)
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ negotiationId: 'stuck-1' }))
    expect(negotiationService.runDecision).toHaveBeenCalledWith('stuck-1')
  })

  it('emits an aggregate backlog alert when the pending count exceeds the threshold', async () => {
    // Nothing stale to process this run, but a large backlog across all owners.
    vi.mocked(createAdminClient).mockReturnValue(adminMock({ scanRows: [], backlog: 40, oldestPendingAt: minsAgo(1) }) as any)
    const body = await (await GET(get(`Bearer ${SECRET}`))).json()
    expect(body.backlog).toBe(40)
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ backlog: 40 }))
  })

  it('does NOT alert when the backlog is under the threshold and nothing is stuck', async () => {
    vi.mocked(createAdminClient).mockReturnValue(adminMock({ scanRows: [], backlog: 5, oldestPendingAt: minsAgo(1) }) as any)
    const body = await (await GET(get(`Bearer ${SECRET}`))).json()
    expect(body.backlog).toBe(5)
    expect(captureError).not.toHaveBeenCalled()
  })
})
