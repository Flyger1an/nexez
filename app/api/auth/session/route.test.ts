import { beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  resolveRequestAuth: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: refs.enforceRateLimit }))
vi.mock('@/lib/server/request-auth', () => ({ resolveRequestAuth: refs.resolveRequestAuth }))

import { GET } from './route'

function request() {
  return new Request('https://app.nexez.ai/api/auth/session')
}

beforeEach(() => {
  vi.clearAllMocks()
  refs.enforceRateLimit.mockResolvedValue(null)
  refs.resolveRequestAuth.mockResolvedValue({ user: { id: 'user-1' }, supabase: {} })
})

describe('GET /api/auth/session', () => {
  it('returns an empty no-store response only after the server verifies the session', async () => {
    const response = await GET(request())

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('vary')).toBe('Cookie, Authorization')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('returns 401 without exposing identity when no verified user is present', async () => {
    refs.resolveRequestAuth.mockResolvedValue({ user: null, supabase: {} })

    const response = await GET(request())

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ authenticated: false })
  })

  it('preserves the shared rate-limit response without attempting auth resolution', async () => {
    refs.enforceRateLimit.mockResolvedValue(new Response('limited', { status: 429 }))

    const response = await GET(request())

    expect(response.status).toBe(429)
    expect(refs.resolveRequestAuth).not.toHaveBeenCalled()
  })
})
