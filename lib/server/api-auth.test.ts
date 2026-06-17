import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../test/supabase-mock'

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: vi.fn(),
}))

import { authenticateApiKey } from './api-auth'
import { hasSupabaseAdminEnv, createAdminClient } from '../../utils/supabase/admin'
import { hashApiKey } from '../api-keys'

const req = (authorization?: string) =>
  new Request('https://nexez.test/api/v1/pages', {
    headers: authorization ? { authorization } : {},
  })

describe('authenticateApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
  })

  it('503 when the programmatic API is not configured (no service role)', async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(false)
    expect(await authenticateApiKey(req('Bearer nxz_live_x'))).toMatchObject({ ok: false, status: 503 })
  })

  it('401 when the bearer token is missing or malformed', async () => {
    expect(await authenticateApiKey(req())).toMatchObject({ ok: false, status: 401 })
    expect(await authenticateApiKey(req('Token abc'))).toMatchObject({ ok: false, status: 401 })
  })

  it('401 on an unknown key', async () => {
    vi.mocked(createAdminClient).mockReturnValue(createSupabaseMock(() => ({ data: null, error: null })) as any)
    expect(await authenticateApiKey(req('Bearer nxz_live_bad'))).toMatchObject({ ok: false, status: 401 })
  })

  it('401 on a revoked key', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock(() => ({ data: { id: 'k1', owner_id: 'o1', revoked_at: '2026-01-01T00:00:00Z' } })) as any,
    )
    expect(await authenticateApiKey(req('Bearer nxz_live_rev'))).toMatchObject({ ok: false, status: 401 })
  })

  it('returns ownerId for a valid key (on a Pro plan) and looks it up by the hashed token', async () => {
    let lookedUpHash: unknown
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock((ctx) => {
        if (ctx.table === 'platform_admins') return { data: null } // not an admin
        if (ctx.table === 'billing_subscriptions') return { data: { plan_id: 'pro', status: 'active' } }
        if (ctx.op === 'select') {
          lookedUpHash = ctx.eqs.key_hash
          return { data: { id: 'k1', owner_id: 'owner-123', revoked_at: null } }
        }
        return { data: null } // best-effort last_used_at update
      }) as any,
    )
    const result = await authenticateApiKey(req('Bearer nxz_live_good'))
    expect(result).toEqual({ ok: true, ownerId: 'owner-123', keyId: 'k1' })
    expect(lookedUpHash).toBe(hashApiKey('nxz_live_good')) // never queries the raw token
  })

  it('402 when the key is valid but the owner is below Pro (apiAccess revoked on downgrade)', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock((ctx) => {
        if (ctx.table === 'platform_admins') return { data: null } // not an admin
        if (ctx.table === 'billing_subscriptions') return { data: { plan_id: 'free', status: 'active' } }
        if (ctx.op === 'select') return { data: { id: 'k1', owner_id: 'owner-123', revoked_at: null } }
        return { data: null }
      }) as any,
    )
    expect(await authenticateApiKey(req('Bearer nxz_live_good'))).toMatchObject({ ok: false, status: 402 })
  })
})
