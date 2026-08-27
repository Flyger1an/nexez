import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

const refs = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  enforceRateLimit: vi.fn(),
}))

vi.mock('../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: refs.createAdminClient,
}))
vi.mock('../../../../lib/rate-limit', () => ({ enforceRateLimit: refs.enforceRateLimit }))
vi.mock('../../../../lib/observability', () => ({ captureError: vi.fn(), captureEvent: vi.fn() }))

import { GET, POST } from './route'
import { deriveScanLeadToken } from '../../../../lib/server/scan-lead-token'

const LEAD_ID = '5c2f5f8a-0c39-4a2e-9a51-2f1c9d3b7e10'
const TOKEN = deriveScanLeadToken(LEAD_ID)

const url = (token: string) => `https://nexez.ai/api/scan/unsubscribe?t=${token}`

function mockDb(opts: { row?: unknown; onQuery?: (ctx: QueryContext) => void }) {
  return createSupabaseMock((ctx) => {
    opts.onQuery?.(ctx)
    return { data: opts.row ?? null, error: null }
  })
}

describe('/api/scan/unsubscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.enforceRateLimit.mockResolvedValue(null)
  })

  it('GET changes nothing, because mail clients prefetch links', async () => {
    // A GET that unsubscribed would silently suppress people who never clicked.
    const ops: string[] = []
    refs.createAdminClient.mockReturnValue(mockDb({ onQuery: (ctx) => ops.push(ctx.op) }))

    const res = await GET(new Request(url(TOKEN)))
    const html = await res.text()

    expect(res.status).toBe(200)
    expect(ops).toEqual([])
    expect(html).toContain('method="post"')
  })

  it('GET reflects the token into the form without letting markup through', async () => {
    refs.createAdminClient.mockReturnValue(mockDb({}))
    const res = await GET(new Request(`https://nexez.ai/api/scan/unsubscribe?t=${'a'.repeat(44)}"><script>x</script>`))
    const html = await res.text()
    expect(html).not.toContain('<script>')
  })

  it('POST suppresses the address the token points at', async () => {
    const writes: QueryContext[] = []
    refs.createAdminClient.mockReturnValue(mockDb({
      row: { id: LEAD_ID, email: 'owner@example.com' },
      onQuery: (ctx) => { if (ctx.op === 'insert') writes.push({ ...ctx, calls: [...ctx.calls] }) },
    }))

    const res = await POST(new Request(url(TOKEN), { method: 'POST' }))

    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Done')
    expect(writes[0]!.table).toBe('scan_lead_suppressions')
    expect(writes[0]!.payload).toEqual({ email: 'owner@example.com', source_lead_id: LEAD_ID })
    const lookup = vi.mocked(refs.createAdminClient).mock.results[0]!.value.from.mock.calls
    expect(lookup[0]).toEqual(['scan_leads'])
  })

  it('reports success for an unknown token, so it cannot be used as an oracle', async () => {
    refs.createAdminClient.mockReturnValue(mockDb({ row: null }))
    const res = await POST(new Request(url(TOKEN), { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Done')
  })

  it('rejects a malformed token before touching the database', async () => {
    const ops: string[] = []
    refs.createAdminClient.mockReturnValue(mockDb({ onQuery: (ctx) => ops.push(ctx.op) }))
    const res = await POST(new Request(url('short'), { method: 'POST' }))
    expect(res.status).toBe(400)
    expect(ops).toEqual([])
  })

  it('derives a stable token, so an old email keeps working', async () => {
    // Rotating per send would invalidate every message already delivered.
    expect(deriveScanLeadToken(LEAD_ID)).toBe(deriveScanLeadToken(LEAD_ID))
    expect(deriveScanLeadToken(LEAD_ID)).not.toBe(deriveScanLeadToken(`${LEAD_ID}x`))
    expect(deriveScanLeadToken(LEAD_ID)).toMatch(/^[A-Za-z0-9_-]{40,64}$/)
  })

  it('requires the server secret as well as the database row id', () => {
    vi.stubEnv('SCAN_LEAD_TOKEN_SECRET', 'first-secret')
    const first = deriveScanLeadToken(LEAD_ID)
    vi.stubEnv('SCAN_LEAD_TOKEN_SECRET', 'second-secret')
    expect(deriveScanLeadToken(LEAD_ID)).not.toBe(first)
    vi.unstubAllEnvs()
  })
})
