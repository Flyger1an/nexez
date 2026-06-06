import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../../../test/supabase-mock'

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('../../../../utils/supabase/admin', () => ({ createAdminClient: vi.fn(), hasSupabaseAdminEnv: vi.fn() }))

import { POST } from './route'
import { createClient } from '../../../../utils/supabase/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

describe('POST /api/account/delete', () => {
  beforeEach(() => vi.clearAllMocks())

  it('503 when the service role is not configured', async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(false)
    expect((await POST()).status).toBe(503)
  })

  it('401 when not authenticated', async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
    vi.mocked(createClient).mockReturnValue(createSupabaseMock(() => ({ data: null }), { user: null }) as any)
    expect((await POST()).status).toBe(401)
  })

  it('deletes only the session user’s data + auth user (target is never client-supplied)', async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
    vi.mocked(createClient).mockReturnValue(
      createSupabaseMock(() => ({ data: null }), { user: { id: 'owner-Z', email: 'z@acme.com' } }) as any,
    )
    const deletedOwners: string[] = []
    const deleteUser = vi.fn(async () => ({ error: null }))
    vi.mocked(createAdminClient).mockReturnValue({
      ...createSupabaseMock((ctx) => {
        if (ctx.op === 'delete' && ctx.eqs.owner_id) deletedOwners.push(ctx.eqs.owner_id)
        return { data: null, error: null }
      }),
      auth: { admin: { deleteUser } },
    } as any)

    const res = await POST()
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    expect(deleteUser).toHaveBeenCalledWith('owner-Z')
    expect(deletedOwners.every((o) => o === 'owner-Z')).toBe(true)
  })
})
