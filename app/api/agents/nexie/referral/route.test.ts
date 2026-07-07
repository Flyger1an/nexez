import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const { authRef, rateRef, ref } = vi.hoisted(() => ({
  authRef: { result: null as any },
  rateRef: { response: null as any },
  ref: {
    hasAdmin: true,
    codesMaybe: { data: null as any, error: null as any },
    referralsCount: 0,
    codeInsert: { error: null as any },
    referralInsert: { error: null as any },
    inserts: [] as any[],
  },
}))

vi.mock('../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => rateRef.response) }))
vi.mock('../../../../../lib/agents/nexie-auth', () => ({ authenticateNexieRequest: vi.fn(async () => authRef.result) }))
vi.mock('../../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => ref.hasAdmin,
  createAdminClient: () => ({
    from: (table: string) => ({
      select: (_cols?: any, opts?: any) =>
        opts?.head
          ? { eq: () => Promise.resolve({ count: ref.referralsCount, error: null }) }
          : { eq: () => ({ maybeSingle: () => Promise.resolve(ref.codesMaybe) }) },
      insert: (row: any) => {
        ref.inserts.push({ table, row })
        return Promise.resolve(table === 'referrals' ? ref.referralInsert : ref.codeInsert)
      },
    }),
  }),
}))

import { GET, POST } from './route'

const req = (method = 'GET', body?: unknown) =>
  new Request('https://nexez.test/api/agents/nexie/referral', {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as any

beforeEach(() => {
  rateRef.response = null
  authRef.result = { ok: true, user: { id: 'u1' } }
  ref.hasAdmin = true
  ref.codesMaybe = { data: null, error: null }
  ref.referralsCount = 0
  ref.codeInsert = { error: null }
  ref.referralInsert = { error: null }
  ref.inserts = []
})

describe('referral endpoint - GET', () => {
  it('401s when unauthenticated', async () => {
    authRef.result = { ok: false, response: NextResponse.json({ code: 'auth_required' }, { status: 401 }) }
    expect((await GET(req())).status).toBe(401)
  })

  it('returns the existing code + referral count', async () => {
    ref.codesMaybe = { data: { code: 'ABC1234' }, error: null }
    ref.referralsCount = 3
    const body = await (await GET(req())).json()
    expect(body).toEqual({ ok: true, code: 'ABC1234', referralCount: 3 })
    expect(ref.inserts).toHaveLength(0) // did not create a new code
  })

  it('creates a code on first call (7 chars, safe alphabet)', async () => {
    ref.codesMaybe = { data: null, error: null }
    const body = await (await GET(req())).json()
    expect(body.ok).toBe(true)
    expect(body.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{7}$/)
    expect(ref.inserts.some((i) => i.table === 'referral_codes')).toBe(true)
  })
})

describe('referral endpoint - POST claim', () => {
  it('400s on a malformed code (before touching the db)', async () => {
    expect((await POST(req('POST', { code: 'x' }))).status).toBe(400)
    expect(ref.inserts).toHaveLength(0)
  })

  it('404s when the code does not exist', async () => {
    ref.codesMaybe = { data: null, error: null }
    expect((await POST(req('POST', { code: 'ZZZZ999' }))).status).toBe(404)
  })

  it('400s on a self-referral', async () => {
    ref.codesMaybe = { data: { user_id: 'u1' }, error: null }
    expect((await POST(req('POST', { code: 'ABC1234' }))).status).toBe(400)
  })

  it('records the attribution on a valid claim', async () => {
    ref.codesMaybe = { data: { user_id: 'owner1' }, error: null }
    const res = await POST(req('POST', { code: 'abc1234' })) // lower-case tolerated
    expect(res.status).toBe(200)
    expect(ref.inserts).toContainEqual({ table: 'referrals', row: { referrer_user_id: 'owner1', referred_user_id: 'u1', code: 'ABC1234' } })
  })

  it('409s when the account already used a code', async () => {
    ref.codesMaybe = { data: { user_id: 'owner1' }, error: null }
    ref.referralInsert = { error: { code: '23505' } }
    expect((await POST(req('POST', { code: 'ABC1234' }))).status).toBe(409)
  })
})
