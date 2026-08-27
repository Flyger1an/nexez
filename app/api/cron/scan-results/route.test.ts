import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

const refs = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  sendEmail: vi.fn(),
  buildScanResultsEmail: vi.fn(),
}))

vi.mock('../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: refs.createAdminClient,
}))
vi.mock('../../../../lib/email', () => ({
  hasEmailEnv: vi.fn(() => true),
  sendEmail: refs.sendEmail,
  buildScanResultsEmail: refs.buildScanResultsEmail,
}))

import { GET } from './route'

const cronRequest = (authorization = 'Bearer cron-secret') =>
  new Request('https://nexez.ai/api/cron/scan-results', { headers: { authorization } })

const lead = {
  id: '5c2f5f8a-0c39-4a2e-9a51-2f1c9d3b7e10',
  email: 'owner@example.com',
  domain: 'axleplumbing.com',
  score: 34,
  findings: [['Prices', 'Missing']],
  delivery_attempts: 0,
  delivery_claimed_at: null,
}

function mockDb(opts: { leads?: unknown[]; claim?: unknown; onQuery?: (ctx: QueryContext) => void }) {
  return createSupabaseMock((ctx) => {
    opts.onQuery?.(ctx)
    if (ctx.table !== 'scan_leads') return { data: [], error: null }
    if (ctx.op === 'select') return { data: opts.leads ?? [], error: null }
    // The claim is an update...select().maybeSingle(); 'claim' controls whether it wins.
    return { data: opts.claim === undefined ? { id: lead.id } : opts.claim, error: null }
  })
}

describe('GET /api/cron/scan-results', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', 'cron-secret')
    refs.buildScanResultsEmail.mockResolvedValue({ subject: 's', html: 'h', text: 't' })
    refs.sendEmail.mockResolvedValue({ ok: true })
  })
  afterEach(() => vi.unstubAllEnvs())

  it('rejects a call without the cron bearer', async () => {
    expect((await GET(cronRequest('Bearer wrong'))).status).toBe(401)
  })

  it('sends a queued result and carries a one-click unsubscribe', async () => {
    refs.createAdminClient.mockReturnValue(mockDb({ leads: [lead] }))

    const body = await (await GET(cronRequest())).json()

    expect(body.sent).toBe(1)
    const sent = refs.sendEmail.mock.calls[0]![0]
    expect(sent.to).toBe('owner@example.com')
    expect(sent.idempotencyKey).toBe(`scan-result-${lead.id}`)
    expect(sent.messageHeaders['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(sent.messageHeaders['List-Unsubscribe']).toMatch(/^<https:\/\/[^>]+\/api\/scan\/unsubscribe\?t=[A-Za-z0-9_-]+>$/)
  })

  it('mails the same unsubscribe link the email body shows', async () => {
    // A header link and a body link that differ means one of them is wrong, and the
    // one people click is the body.
    refs.createAdminClient.mockReturnValue(mockDb({ leads: [lead] }))

    await GET(cronRequest())

    const built = refs.buildScanResultsEmail.mock.calls[0]![0]
    const sent = refs.sendEmail.mock.calls[0]![0]
    expect(sent.messageHeaders['List-Unsubscribe']).toBe(`<${built.unsubscribeUrl}>`)
  })

  it('skips a row another run already claimed', async () => {
    // Two overlapping runs must not both send. The conditional update decides.
    refs.createAdminClient.mockReturnValue(mockDb({ leads: [lead], claim: null }))

    const body = await (await GET(cronRequest())).json()

    expect(body.sent).toBe(0)
    expect(refs.sendEmail).not.toHaveBeenCalled()
  })

  it('releases the claim when a send fails so the next run retries', async () => {
    refs.sendEmail.mockResolvedValue({ ok: false, error: 'resend 500' })
    const writes: QueryContext[] = []
    refs.createAdminClient.mockReturnValue(mockDb({
      leads: [lead],
      onQuery: (ctx) => { if (ctx.op === 'update') writes.push({ ...ctx, calls: [...ctx.calls] }) },
    }))

    const body = await (await GET(cronRequest())).json()

    expect(body.sent).toBe(0)
    expect(body.errors).toContain(`scan_result_send:${lead.id}`)
    const release = writes.at(-1)!
    expect(release.payload.delivery_claimed_at).toBeNull()
    expect(release.payload.last_error).toContain('resend 500')
  })

  it('retires a row once its attempts are spent instead of retrying forever', async () => {
    refs.sendEmail.mockResolvedValue({ ok: false, error: 'mailbox unavailable' })
    const writes: QueryContext[] = []
    refs.createAdminClient.mockReturnValue(mockDb({
      leads: [{ ...lead, delivery_attempts: 2 }],
      onQuery: (ctx) => { if (ctx.op === 'update') writes.push({ ...ctx, calls: [...ctx.calls] }) },
    }))

    const body = await (await GET(cronRequest())).json()

    expect(body.abandoned).toBe(1)
    expect(writes.at(-1)!.payload.abandoned_at).toBeTruthy()
  })

  it('never queues an unsubscribed or exhausted row', async () => {
    const selects: QueryContext[] = []
    refs.createAdminClient.mockReturnValue(mockDb({
      onQuery: (ctx) => { if (ctx.table === 'scan_leads' && ctx.op === 'select') selects.push({ ...ctx, calls: [...ctx.calls] }) },
    }))

    await GET(cronRequest())

    const calls = selects[0]!.calls
    expect(calls).toContainEqual(['is', 'delivered_at', null])
    expect(calls).toContainEqual(['is', 'abandoned_at', null])
    expect(calls).toContainEqual(['is', 'unsubscribed_at', null])
    expect(calls.some(([method, filter]) => method === 'or' && String(filter).includes('delivery_claimed_at.lt.'))).toBe(true)
    expect(calls.some(([m, k]) => m === 'lt' && k === 'delivery_attempts')).toBe(true)
  })

  it('drops a malformed finding rather than rendering it', async () => {
    refs.createAdminClient.mockReturnValue(mockDb({
      leads: [{ ...lead, findings: [['ok', 'Missing'], 'junk', { a: 1 }, ['only-one']] }],
    }))

    await GET(cronRequest())

    expect(refs.buildScanResultsEmail.mock.calls[0]![0].findings).toEqual([['ok', 'Missing']])
  })

  it('no-ops quietly when email is not configured', async () => {
    const email = await import('../../../../lib/email')
    vi.mocked(email.hasEmailEnv).mockReturnValue(false)
    refs.createAdminClient.mockReturnValue(mockDb({ leads: [lead] }))

    const body = await (await GET(cronRequest())).json()

    expect(body).toMatchObject({ ok: true, sent: 0, skipped: 'email_disabled' })
    vi.mocked(email.hasEmailEnv).mockReturnValue(true)
  })
})
