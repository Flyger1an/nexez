import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: null as null | { id: string; email: string },
  isAdmin: false,
}))
const redirect = vi.hoisted(() => vi.fn((location: string) => {
  throw new Error(`NEXT_REDIRECT:${location}`)
}))
const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
}))
const isPlatformAdmin = vi.hoisted(() => vi.fn(async () => state.isAdmin))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({})),
  headers: vi.fn(async () => new Headers({ host: 'admin.nexez.ai' })),
}))
vi.mock('next/navigation', () => ({ redirect, notFound }))
vi.mock('../../utils/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
  }),
}))
vi.mock('./plan', () => ({ isPlatformAdmin }))

import { requirePlatformAdmin } from './admin-access'

describe('requirePlatformAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = { id: 'admin-1', email: 'admin@nexez.ai' }
    state.isAdmin = true
  })

  it('redirects a signed-out viewer to login with the intended return path', async () => {
    state.user = null

    await expect(requirePlatformAdmin('/admin/growth?tab=controls')).rejects.toThrow(
      'NEXT_REDIRECT:/login?next=%2Fadmin%2Fgrowth%3Ftab%3Dcontrols',
    )
    expect(isPlatformAdmin).not.toHaveBeenCalled()
  })

  it('returns not found without exposing the surface to a signed-in non-admin', async () => {
    state.isAdmin = false

    await expect(requirePlatformAdmin('/admin')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(isPlatformAdmin).toHaveBeenCalledWith(expect.anything(), 'admin-1')
  })

  it('returns only the authenticated platform-admin viewer', async () => {
    await expect(requirePlatformAdmin('/admin')).resolves.toEqual(state.user)
  })
})
