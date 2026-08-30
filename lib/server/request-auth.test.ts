import { beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({
  tokenUser: { id: 'mobile-owner', email: 'owner@nexez.test' } as { id: string; email?: string } | null,
  tokenError: null as Error | null,
  cookieUser: { id: 'web-owner' } as { id: string } | null,
  tokenGetUser: vi.fn(),
  cookieGetUser: vi.fn(),
  tokenClient: null as unknown,
  cookieClient: null as unknown,
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ kind: 'cookie-store' })),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => refs.tokenClient),
}))

vi.mock('../../utils/supabase/server', () => ({
  createClient: vi.fn(() => refs.cookieClient),
}))

import { createClient as createTokenClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createClient as createCookieClient } from '../../utils/supabase/server'
import { resolveRequestAuth } from './request-auth'

describe('resolveRequestAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.tokenUser = { id: 'mobile-owner', email: 'owner@nexez.test' }
    refs.tokenError = null
    refs.cookieUser = { id: 'web-owner' }
    refs.tokenGetUser = vi.fn(async () => ({
      data: { user: refs.tokenUser },
      error: refs.tokenError,
    }))
    refs.cookieGetUser = vi.fn(async () => ({ data: { user: refs.cookieUser } }))
    refs.tokenClient = { auth: { getUser: refs.tokenGetUser } }
    refs.cookieClient = { auth: { getUser: refs.cookieGetUser } }
  })

  it('verifies a bearer token and returns an RLS-scoped token client', async () => {
    const request = new Request('https://nexez.test/api/test', {
      headers: { authorization: 'Bearer mobile-access-token' },
    })

    const result = await resolveRequestAuth(request)

    expect(result).toEqual({ supabase: refs.tokenClient, user: refs.tokenUser })
    expect(refs.tokenGetUser).toHaveBeenCalledWith('mobile-access-token')
    expect(createTokenClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'sb_publishable_test',
      {
        global: { headers: { Authorization: 'Bearer mobile-access-token' } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      },
    )
    expect(cookies).not.toHaveBeenCalled()
    expect(createCookieClient).not.toHaveBeenCalled()
  })

  it('accepts a case-insensitive bearer scheme and trims the token', async () => {
    await resolveRequestAuth(new Request('https://nexez.test/api/test', {
      headers: { authorization: 'bEaReR   mobile-access-token  ' },
    }))

    expect(refs.tokenGetUser).toHaveBeenCalledWith('mobile-access-token')
  })

  it('rejects invalid or expired bearer tokens without falling back to cookies', async () => {
    refs.tokenError = new Error('expired')
    const result = await resolveRequestAuth(new Request('https://nexez.test/api/test', {
      headers: { authorization: 'Bearer expired-token' },
    }))

    expect(result).toEqual({ supabase: refs.tokenClient, user: null })
    expect(cookies).not.toHaveBeenCalled()
  })

  it('uses the cookie session when no usable bearer token is supplied', async () => {
    const result = await resolveRequestAuth(new Request('https://nexez.test/api/test', {
      headers: { authorization: 'Basic not-a-bearer-token' },
    }))

    expect(result).toEqual({ supabase: refs.cookieClient, user: refs.cookieUser })
    expect(cookies).toHaveBeenCalledOnce()
    expect(createCookieClient).toHaveBeenCalledWith({ kind: 'cookie-store' })
    expect(refs.cookieGetUser).toHaveBeenCalledWith()
    expect(createTokenClient).not.toHaveBeenCalled()
  })

  it('normalizes a missing cookie user to null', async () => {
    refs.cookieUser = null
    const result = await resolveRequestAuth(new Request('https://nexez.test/api/test'))
    expect(result.user).toBeNull()
  })
})
