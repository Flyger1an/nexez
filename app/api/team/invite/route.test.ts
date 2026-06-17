import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

const refs = vi.hoisted(() => ({
  user: { id: 'owner-1', email: 'owner@example.com' } as any,
  existing: { data: null, error: null } as any, // the dedup SELECT result
  insert: { data: { id: 'inv1', email: 'mate@example.com', role: 'editor', status: 'pending', created_at: 'now' }, error: null } as any,
  sent: [] as any[],
}))

vi.mock('next/server', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return { ...actual, after: (fn: () => Promise<void>) => { void fn() } }
})
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../lib/site', () => ({ appUrl: (p: string) => `https://app.nexez.ai${p}` }))
vi.mock('../../../../lib/email', () => ({
  hasEmailEnv: vi.fn(() => true),
  sendEmail: vi.fn(async (m: any) => { refs.sent.push(m); return { ok: true } }),
  buildTeamInviteEmail: vi.fn((o: any) => ({ subject: `invite ${o.inviteeEmail}`, html: 'h', text: 't' })),
}))

import { POST } from './route'
import { createClient } from '../../../../utils/supabase/server'

function wire() {
  vi.mocked(createClient).mockReturnValue(
    createSupabaseMock((ctx: QueryContext) => {
      if (ctx.table === 'team_invites') return ctx.op === 'insert' ? refs.insert : refs.existing
      return { data: null, error: null }
    }, { user: refs.user }) as any,
  )
}
const post = (body: unknown) =>
  new Request('https://app.nexez.ai/api/team/invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('POST /api/team/invite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.user = { id: 'owner-1', email: 'owner@example.com' }
    refs.existing = { data: null, error: null }
    refs.insert = { data: { id: 'inv1', email: 'mate@example.com', role: 'editor', status: 'pending', created_at: 'now' }, error: null }
    refs.sent = []
    wire()
  })

  it('401 when not authenticated', async () => {
    refs.user = null
    wire()
    expect((await POST(post({ email: 'mate@example.com', role: 'editor' }))).status).toBe(401)
  })

  it('400 on an invalid email', async () => {
    expect((await POST(post({ email: 'nope', role: 'editor' }))).status).toBe(400)
  })

  it('400 on an invalid role', async () => {
    expect((await POST(post({ email: 'mate@example.com', role: 'superadmin' }))).status).toBe(400)
  })

  it('400 when inviting yourself', async () => {
    expect((await POST(post({ email: 'owner@example.com', role: 'editor' }))).status).toBe(400)
  })

  it('402 when the plan gate trigger rejects (under Scale)', async () => {
    refs.insert = { data: null, error: { message: 'Team collaboration is a Scale plan feature.' } }
    wire()
    const res = await POST(post({ email: 'mate@example.com', role: 'editor' }))
    expect(res.status).toBe(402)
  })

  it('creates the invite and emails the invitee', async () => {
    const res = await POST(post({ email: 'Mate@Example.com', role: 'editor' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, invite: { id: 'inv1' }, emailed: true })
    await flush()
    expect(refs.sent).toHaveLength(1)
    expect(refs.sent[0].to).toBe('mate@example.com') // lowercased
  })

  it('does NOT re-email when a live invite already exists (anti email-bomb dedup)', async () => {
    refs.existing = { data: { id: 'inv0', email: 'mate@example.com', role: 'editor', status: 'pending', created_at: 'earlier' }, error: null }
    wire()
    const res = await POST(post({ email: 'mate@example.com', role: 'editor' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, alreadyInvited: true, emailed: false })
    await flush()
    expect(refs.sent).toHaveLength(0)
  })

  it('does not send email when RESEND is unconfigured', async () => {
    const { hasEmailEnv } = await import('../../../../lib/email')
    vi.mocked(hasEmailEnv).mockReturnValue(false)
    await POST(post({ email: 'mate@example.com', role: 'editor' }))
    await flush()
    expect(refs.sent).toHaveLength(0)
  })
})
