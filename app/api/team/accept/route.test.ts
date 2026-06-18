import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

const refs = vi.hoisted(() => ({
  user: { id: 'mate-2', email: 'Mate@Example.com', email_confirmed_at: '2026-01-01T00:00:00Z' } as any,
  hasAdmin: true,
  updateResult: { data: [{ id: 'inv1' }], error: null } as any,
  captured: null as QueryContext | null,
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => refs.hasAdmin),
  createAdminClient: vi.fn(() =>
    createSupabaseMock((ctx: QueryContext) => {
      if (ctx.table === 'team_invites') {
        refs.captured = ctx
        return refs.updateResult
      }
      return { data: null, error: null }
    }) as any,
  ),
}))

import { POST } from './route'
import { createClient } from '../../../../utils/supabase/server'

function wire(user: any = refs.user) {
  vi.mocked(createClient).mockReturnValue(
    createSupabaseMock(() => ({ data: null, error: null }), { user }) as any,
  )
}
const post = () => new Request('https://app.nexez.ai/api/team/accept', { method: 'POST' })

describe('POST /api/team/accept', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.hasAdmin = true
    refs.updateResult = { data: [{ id: 'inv1' }], error: null }
    refs.captured = null
  })

  it('401 when not authenticated', async () => {
    wire(null)
    expect((await POST(post())).status).toBe(401)
  })

  it('403 when the email is not confirmed (the grant joins on a confirmed address)', async () => {
    wire({ id: 'mate-2', email: 'mate@example.com', email_confirmed_at: null })
    expect((await POST(post())).status).toBe(403)
  })

  it('flips ONLY the caller-owned pending invites to accepted (scoped + lowercased)', async () => {
    refs.updateResult = { data: [{ id: 'a' }, { id: 'b' }], error: null }
    wire()
    const res = await POST(post())
    expect(res.status).toBe(200)
    expect((await res.json()).accepted).toBe(2)
    expect(refs.captured!.op).toBe('update')
    expect(refs.captured!.payload).toEqual({ status: 'accepted' })
    expect(refs.captured!.eqs.email).toBe('mate@example.com') // caller's own, lowercased
    expect(refs.captured!.eqs.status).toBe('pending') // never un-revokes
  })

  it('returns accepted=0 when there is nothing pending (idempotent)', async () => {
    refs.updateResult = { data: [], error: null }
    wire()
    const res = await POST(post())
    expect(res.status).toBe(200)
    expect((await res.json()).accepted).toBe(0)
  })

  it('503 when the service-role env is missing', async () => {
    refs.hasAdmin = false
    wire()
    expect((await POST(post())).status).toBe(503)
  })
})
