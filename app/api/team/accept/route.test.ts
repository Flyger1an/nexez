import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

const refs = vi.hoisted(() => ({
  user: { id: 'mate-2', email: 'Mate@Example.com', email_confirmed_at: '2026-01-01T00:00:00Z' } as any,
  hasAdmin: true,
  pendingResult: { data: [{ id: 'inv1' }], error: null } as any,
  updateResult: { data: [{ id: 'inv1' }], error: null } as any,
  updateResults: {} as Record<string, any>,
  captured: [] as QueryContext[],
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => refs.hasAdmin),
  createAdminClient: vi.fn(() =>
    createSupabaseMock((ctx: QueryContext) => {
      if (ctx.table === 'team_invites') {
        refs.captured.push(ctx)
        if (ctx.op === 'select') return refs.pendingResult
        return refs.updateResults[String(ctx.eqs.id)] ?? refs.updateResult
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
    refs.pendingResult = { data: [{ id: 'inv1' }], error: null }
    refs.updateResult = { data: [{ id: 'inv1' }], error: null }
    refs.updateResults = {}
    refs.captured = []
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
    refs.pendingResult = { data: [{ id: 'a' }, { id: 'b' }], error: null }
    wire()
    const res = await POST(post())
    expect(res.status).toBe(200)
    expect((await res.json()).accepted).toBe(2)
    expect(refs.captured[0].op).toBe('select')
    expect(refs.captured[0].eqs.email).toBe('mate@example.com')
    expect(refs.captured[0].eqs.status).toBe('pending')

    const updates = refs.captured.slice(1)
    expect(updates).toHaveLength(2)
    expect(updates.map((ctx) => ctx.eqs.id)).toEqual(['a', 'b'])
    for (const update of updates) {
      expect(update.op).toBe('update')
      expect(update.payload).toEqual({ status: 'accepted' })
      expect(update.eqs.email).toBe('mate@example.com') // caller's own, lowercased
      expect(update.eqs.status).toBe('pending') // never un-revokes
    }
  })

  it('accepts a valid cross-owner invite even when another owner is ineligible', async () => {
    refs.pendingResult = { data: [{ id: 'blocked-owner' }, { id: 'valid-owner' }], error: null }
    refs.updateResults = {
      'blocked-owner': {
        data: null,
        error: { code: '23514', message: 'Team seat limit reached for your plan (3 seat(s)).' },
      },
      'valid-owner': { data: [{ id: 'valid-owner' }], error: null },
    }
    wire()

    const res = await POST(post())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, accepted: 1, skipped: 1 })
    expect(refs.captured.slice(1).map((ctx) => ctx.eqs.id)).toEqual([
      'blocked-owner',
      'valid-owner',
    ])
  })

  it('returns accepted=0 when there is nothing pending (idempotent)', async () => {
    refs.pendingResult = { data: [], error: null }
    wire()
    const res = await POST(post())
    expect(res.status).toBe(200)
    expect((await res.json()).accepted).toBe(0)
  })

  it('returns a retryable conflict when seat allocation is being reconciled', async () => {
    refs.updateResult = { data: null, error: { code: '40001', message: 'NEXEZ_ENTITLEMENT_ALLOCATION_RETRY' } }
    wire()
    const res = await POST(post())
    expect(res.status).toBe(409)
    expect(res.headers.get('retry-after')).toBe('1')
    expect(await res.json()).toMatchObject({ code: 'entitlement_allocation_retry', retryable: true })
  })

  it('503 when the service-role env is missing', async () => {
    refs.hasAdmin = false
    wire()
    expect((await POST(post())).status).toBe(503)
  })
})
