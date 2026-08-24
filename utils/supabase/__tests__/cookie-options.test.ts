import { describe, expect, it } from 'vitest'
import { ADMIN_AUTH_COOKIE_NAME, getSupabaseCookieOptions, isSupabaseAuthCookieForHost } from '../cookie-options'

describe('getSupabaseCookieOptions', () => {
  it('shares auth cookies across nexez.ai and app.nexez.ai', () => {
    expect(getSupabaseCookieOptions('nexez.ai')?.domain).toBe('.nexez.ai')
    expect(getSupabaseCookieOptions('app.nexez.ai')?.domain).toBe('.nexez.ai')
    expect(getSupabaseCookieOptions('www.nexez.ai')?.domain).toBe('.nexez.ai')
  })

  it('uses an isolated host-only cookie for platform administration', () => {
    expect(getSupabaseCookieOptions('admin.nexez.ai')).toMatchObject({
      name: ADMIN_AUTH_COOKIE_NAME,
      path: '/',
      sameSite: 'lax',
      secure: true,
    })
    expect(getSupabaseCookieOptions('admin.nexez.ai')).not.toHaveProperty('domain')
    expect(isSupabaseAuthCookieForHost(`${ADMIN_AUTH_COOKIE_NAME}.0`, 'admin.nexez.ai')).toBe(true)
    expect(isSupabaseAuthCookieForHost('sb-project-auth-token', 'admin.nexez.ai')).toBe(false)
  })

  it('does not apply the shared app cookie domain to the agent runtime', () => {
    expect(getSupabaseCookieOptions('nexez.app')).toBeUndefined()
    expect(getSupabaseCookieOptions('www.nexez.app')).toBeUndefined()
    expect(getSupabaseCookieOptions('localhost:3000')).toBeUndefined()
  })

  it('does not apply the shared cookie to Vercel preview hosts', () => {
    expect(getSupabaseCookieOptions('nexez-git-main-acme.vercel.app')).toBeUndefined()
    expect(getSupabaseCookieOptions('foo.vercel.app')).toBeUndefined()
  })

  it('sets the security-relevant cookie attributes (secure, lax, root path)', () => {
    expect(getSupabaseCookieOptions('app.nexez.ai')).toMatchObject({
      domain: '.nexez.ai',
      path: '/',
      sameSite: 'lax',
      secure: true,
    })
  })

  it('honors an explicit shared auth cookie domain', () => {
    const previous = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN
    process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = 'auth.example.com'

    expect(getSupabaseCookieOptions('app.auth.example.com')?.domain).toBe('.auth.example.com')
    expect(getSupabaseCookieOptions('nexez.ai')).toBeUndefined()

    if (previous === undefined) delete process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN
    else process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = previous
  })
})
