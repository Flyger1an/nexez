import { describe, expect, it } from 'vitest'
import { isProtectedPath, resolveAuthGate } from '../auth-gate'

describe('isProtectedPath', () => {
  it('protects /dashboard and everything under it', () => {
    expect(isProtectedPath('/dashboard')).toBe(true)
    expect(isProtectedPath('/dashboard/abc-123')).toBe(true)
    expect(isProtectedPath('/dashboard/abc/settings')).toBe(true)
  })

  it('leaves public surfaces open', () => {
    for (const p of ['/', '/create', '/marketplace', '/directory', '/leaderboard', '/simulator', '/support', '/login', '/some-public-slug']) {
      expect(isProtectedPath(p)).toBe(false)
    }
  })

  it('does not treat a /dashboard-prefixed sibling as protected', () => {
    // guards against `startsWith('/dashboard')` false positives
    expect(isProtectedPath('/dashboardfoo')).toBe(false)
    expect(isProtectedPath('/dashboards')).toBe(false)
  })
})

describe('resolveAuthGate', () => {
  it('redirects an unauthenticated user off a protected route, preserving the path as next', () => {
    expect(resolveAuthGate('/dashboard', '', false)).toEqual({ next: '/dashboard' })
    expect(resolveAuthGate('/dashboard/4b6f000e', '', false)).toEqual({ next: '/dashboard/4b6f000e' })
  })

  it('preserves the query string in next', () => {
    expect(resolveAuthGate('/dashboard/abc', '?tab=offers', false)).toEqual({ next: '/dashboard/abc?tab=offers' })
  })

  it('lets an authenticated user through to a protected route', () => {
    expect(resolveAuthGate('/dashboard', '', true)).toBeNull()
    expect(resolveAuthGate('/dashboard/abc', '?x=1', true)).toBeNull()
  })

  it('lets anyone through to public routes regardless of auth', () => {
    expect(resolveAuthGate('/', '', false)).toBeNull()
    expect(resolveAuthGate('/create', '?from=home', false)).toBeNull()
    expect(resolveAuthGate('/login', '?next=/dashboard', false)).toBeNull()
    expect(resolveAuthGate('/dashboardfoo', '', false)).toBeNull()
  })
})
