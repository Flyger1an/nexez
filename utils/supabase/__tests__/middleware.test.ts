import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const getUser = vi.hoisted(() => vi.fn())

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser } })),
}))

import { isStaleSessionError, updateSession } from '../middleware'

describe('Supabase session middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable-test-key')
  })

  it('recognizes current and legacy invalid-refresh responses', () => {
    expect(isStaleSessionError({ code: 'refresh_token_not_found', message: 'nope' })).toBe(true)
    expect(isStaleSessionError({ code: 'refresh_token_already_used' })).toBe(true)
    expect(isStaleSessionError({ message: 'Invalid Refresh Token: Refresh Token Not Found' })).toBe(true)
    expect(isStaleSessionError({ code: 'request_timeout', message: 'network timeout' })).toBe(false)
  })

  it('clears every stale auth cookie chunk and redirects protected routes quietly', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'refresh_token_not_found', message: 'Invalid Refresh Token' },
    })
    const request = new NextRequest('https://app.nexez.ai/dashboard/settings', {
      headers: {
        host: 'app.nexez.ai',
        cookie: 'sb-project-auth-token.0=old-a; sb-project-auth-token.1=old-b; unrelated=keep',
      },
    })

    const response = await updateSession(request)
    const setCookie = response.headers.get('set-cookie') ?? ''

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login?next=%2Fdashboard%2Fsettings')
    expect(setCookie).toContain('sb-project-auth-token.0=')
    expect(setCookie).toContain('sb-project-auth-token.1=')
    expect(setCookie).toContain('Max-Age=0')
    expect(setCookie).toContain('Domain=.nexez.ai')
    expect(setCookie).not.toContain('unrelated=')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('does not destroy cookies for a transient auth failure', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'request_timeout', message: 'Auth service unavailable' },
    })
    const request = new NextRequest('https://app.nexez.ai/dashboard', {
      headers: { cookie: 'sb-project-auth-token=retry-me' },
    })

    const response = await updateSession(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('clears only the isolated admin session on the admin host', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'refresh_token_not_found', message: 'Invalid Refresh Token' },
    })
    const request = new NextRequest('https://admin.nexez.ai/admin/support', {
      headers: {
        host: 'admin.nexez.ai',
        cookie: 'nexez-admin-auth-token.0=stale-admin; sb-project-auth-token=keep-seller',
      },
    })

    const response = await updateSession(request)
    const setCookie = response.headers.get('set-cookie') ?? ''

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login?next=%2Fadmin%2Fsupport')
    expect(setCookie).toContain('nexez-admin-auth-token.0=')
    expect(setCookie).not.toContain('sb-project-auth-token=')
    expect(setCookie).not.toContain('Domain=.nexez.ai')
  })

  it('passes an authenticated dashboard request through', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })

    const response = await updateSession(new NextRequest('https://app.nexez.ai/dashboard'))

    expect(response.status).toBe(200)
  })
})
