import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: { id: 'admin-1', email: 'operator@nexez.ai' } as any,
  admin: true,
  signOut: vi.fn(),
}))

const createClient = vi.hoisted(() => vi.fn(() => ({
  auth: {
    getUser: async () => ({ data: { user: state.user } }),
    signOut: state.signOut,
  },
})))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({})) }))
vi.mock('../../../../utils/supabase/server', () => ({ createClient }))
vi.mock('../../../../lib/server/plan', () => ({ isPlatformAdmin: vi.fn(async () => state.admin) }))

import { GET } from './route'

describe('GET /api/admin/session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = { id: 'admin-1', email: 'operator@nexez.ai' }
    state.admin = true
  })

  it('verifies an approved operator using the admin host session', async () => {
    const response = await GET(new Request('https://admin.nexez.ai/api/admin/session'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, email: 'operator@nexez.ai' })
    expect(createClient).toHaveBeenCalledWith(expect.anything(), 'admin.nexez.ai')
  })

  it('clears a signed-in account without platform-admin access', async () => {
    state.admin = false
    const response = await GET(new Request('https://admin.nexez.ai/api/admin/session'))
    expect(response.status).toBe(403)
    expect(state.signOut).toHaveBeenCalledOnce()
  })

  it('rejects an anonymous request', async () => {
    state.user = null
    const response = await GET(new Request('https://admin.nexez.ai/api/admin/session'))
    expect(response.status).toBe(401)
  })
})
