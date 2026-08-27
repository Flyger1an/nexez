import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

const refs = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  gatherSiteSignals: vi.fn(),
  evaluateCrawlability: vi.fn(),
  enforceRateLimit: vi.fn(),
}))

vi.mock('../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: refs.createAdminClient,
}))
vi.mock('../../../../lib/rate-limit', () => ({ enforceRateLimit: refs.enforceRateLimit }))
vi.mock('../../../../lib/server/site-scan', () => ({
  gatherSiteSignals: refs.gatherSiteSignals,
  normalizeScanUrl: (input: string) => {
    try {
      const url = new URL(/^https?:\/\//.test(input) ? input : `https://${input}`)
      return url.hostname.includes('.') ? url.toString() : null
    } catch {
      return null
    }
  },
}))
vi.mock('../../../../lib/crawlability', () => ({ evaluateCrawlability: refs.evaluateCrawlability }))
vi.mock('../../../../lib/observability', () => ({ captureError: vi.fn(), captureEvent: vi.fn() }))

import { POST } from './route'

const post = (body: unknown) => new Request('https://nexez.ai/api/scan/subscribe', {
  method: 'POST',
  body: JSON.stringify(body),
})

const report = {
  score: 34,
  checks: [
    { id: 'a', dimension: 'discovery', label: 'Prices', status: 'fail', detail: '' },
    { id: 'b', dimension: 'discovery', label: 'Contact', status: 'pass', detail: '' },
  ],
}

function mockDb(opts: { existing?: unknown; onQuery?: (ctx: QueryContext) => void; error?: unknown }) {
  return createSupabaseMock((ctx) => {
    opts.onQuery?.(ctx)
    if (ctx.table === 'scan_lead_suppressions') return { data: null, error: null }
    if (ctx.table === 'scan_leads' && ctx.op === 'select') return { data: opts.existing ?? null, error: null }
    return { data: null, error: opts.error ?? null }
  })
}

describe('POST /api/scan/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.enforceRateLimit.mockResolvedValue(null)
    refs.gatherSiteSignals.mockResolvedValue({
      url: 'https://axleplumbing.com/',
      origin: 'https://axleplumbing.com',
      elapsedMs: 120,
      signals: {},
      robots: {},
    })
    refs.evaluateCrawlability.mockReturnValue(report)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('rejects an address that cannot be an address', async () => {
    refs.createAdminClient.mockReturnValue(mockDb({}))
    for (const email of ['', 'nope', 'a@b', 'a b@c.com']) {
      expect((await POST(post({ url: 'axleplumbing.com', email }))).status).toBe(400)
    }
  })

  it('rejects a url that is not a website', async () => {
    refs.createAdminClient.mockReturnValue(mockDb({}))
    expect((await POST(post({ url: 'not a url', email: 'a@b.com' }))).status).toBe(400)
  })

  it('stores the score it computed, never one supplied by the caller', async () => {
    // Accepting a posted score would let anyone mail an arbitrary verdict about
    // someone else's business from our sending domain.
    const writes: QueryContext[] = []
    refs.createAdminClient.mockReturnValue(mockDb({
      onQuery: (ctx) => { if (ctx.op === 'insert') writes.push({ ...ctx }) },
    }))

    const res = await POST(post({ url: 'axleplumbing.com', email: 'Owner@Example.COM', score: 99 }))

    expect(res.status).toBe(200)
    expect(writes).toHaveLength(1)
    expect(writes[0]!.payload.score).toBe(34)
  })

  it('normalises the address so the unique key actually dedupes', async () => {
    const writes: QueryContext[] = []
    refs.createAdminClient.mockReturnValue(mockDb({
      onQuery: (ctx) => { if (ctx.op === 'insert') writes.push({ ...ctx }) },
    }))

    await POST(post({ url: 'https://AxlePlumbing.com/pricing', email: '  Owner@Example.COM ' }))

    expect(writes[0]!.payload.email).toBe('owner@example.com')
    expect(writes[0]!.payload.domain).toBe('axleplumbing.com')
  })

  it('writes an unsubscribe hash on the row that creates the obligation', async () => {
    // No row may exist in a sendable state without a working unsubscribe.
    const writes: QueryContext[] = []
    refs.createAdminClient.mockReturnValue(mockDb({
      onQuery: (ctx) => { if (ctx.op === 'insert') writes.push({ ...ctx }) },
    }))

    await POST(post({ url: 'axleplumbing.com', email: 'owner@example.com' }))

    expect(writes[0]!.payload.unsubscribe_token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(writes[0]!.payload.consented_at).toBeTruthy()
    expect(writes[0]!.payload.consent_source).toBe('scan_page')
  })

  it('refreshes an existing pending row instead of inserting a duplicate', async () => {
    const ops: string[] = []
    refs.createAdminClient.mockReturnValue(mockDb({
      existing: { id: 'lead-1', unsubscribed_at: null, delivered_at: null, abandoned_at: null },
      onQuery: (ctx) => { if (ctx.op !== 'select') ops.push(ctx.op) },
    }))

    const body = await (await POST(post({ url: 'axleplumbing.com', email: 'owner@example.com' }))).json()

    expect(ops).toEqual(['update'])
    expect(body.queued).toBe(true)
  })

  it('does not turn a repeat request into another email after delivery', async () => {
    const ops: string[] = []
    refs.createAdminClient.mockReturnValue(mockDb({
      existing: {
        id: 'lead-1', unsubscribed_at: null,
        delivered_at: '2026-08-27T12:00:00Z', abandoned_at: null,
      },
      onQuery: (ctx) => { if (ctx.op !== 'select') ops.push(ctx.op) },
    }))

    const body = await (await POST(post({ url: 'axleplumbing.com', email: 'owner@example.com' }))).json()

    expect(body).toEqual({ ok: true, queued: false })
    expect(ops).toEqual([])
  })

  it('will not resurrect an unsubscribed address, and does not admit it', async () => {
    // Reporting the suppression would turn this into a way to test whether a given
    // address has unsubscribed.
    const ops: string[] = []
    refs.createAdminClient.mockReturnValue(mockDb({
      existing: {
        id: 'lead-1', unsubscribed_at: '2026-08-01T00:00:00Z',
        delivered_at: null, abandoned_at: null,
      },
      onQuery: (ctx) => { if (ctx.op !== 'select') ops.push(ctx.op) },
    }))

    const res = await POST(post({ url: 'axleplumbing.com', email: 'owner@example.com' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, queued: false })
    expect(ops).toEqual([])
  })

  it('applies the per-target ceiling fail-closed', async () => {
    // This route makes us fetch a third party's site, so it must not be a cheaper
    // path to that than /api/scan itself.
    refs.createAdminClient.mockReturnValue(mockDb({}))

    await POST(post({ url: 'axleplumbing.com', email: 'owner@example.com' }))

    expect(refs.enforceRateLimit).toHaveBeenCalledWith(
      expect.anything(), 'scan-target', 30, 60_000,
      { subject: 'target:axleplumbing.com', failClosed: true },
    )
  })

  it('applies an address-wide daily ceiling without exposing the address in the key', async () => {
    refs.createAdminClient.mockReturnValue(mockDb({}))

    await POST(post({ url: 'axleplumbing.com', email: 'owner@example.com' }))

    expect(refs.enforceRateLimit).toHaveBeenCalledWith(
      expect.anything(), 'scan-recipient', 5, 86_400_000,
      expect.objectContaining({ subject: expect.stringMatching(/^recipient:[0-9a-f]{64}$/), failClosed: true }),
    )
    expect(JSON.stringify(refs.enforceRateLimit.mock.calls)).not.toContain('owner@example.com')
  })

  it('surfaces a write failure rather than reporting a queued send', async () => {
    refs.createAdminClient.mockReturnValue(mockDb({ error: { message: 'boom' } }))
    expect((await POST(post({ url: 'axleplumbing.com', email: 'owner@example.com' }))).status).toBe(500)
  })
})
