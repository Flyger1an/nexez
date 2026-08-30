import { describe, expect, it } from 'vitest'
import {
  normalizePublicIdentifier,
  PublicIdentifierRequestGuard,
  publicIdentifierDatabaseMessage,
  validatePublicIdentifier,
} from './public-identifier'

describe('mobile public identifier contract', () => {
  it.each([
    ['  Fresh Shop  ', 'fresh-shop'],
    ['UPPER_case', 'upper-case'],
    ['multiple---spaces', 'multiple-spaces'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizePublicIdentifier(input)).toBe(expected)
  })

  it('enforces length, format, and reserved-name rules', () => {
    expect(validatePublicIdentifier('abcd')).toMatchObject({ ok: false, issue: 'too_short' })
    expect(validatePublicIdentifier('a'.repeat(64))).toMatchObject({ ok: false, issue: 'too_long' })
    expect(validatePublicIdentifier('Fresh Shop')).toMatchObject({ ok: false, issue: 'invalid_format' })
    expect(validatePublicIdentifier('checkout')).toMatchObject({ ok: false, issue: 'reserved' })
    expect(validatePublicIdentifier('nexez-partner')).toMatchObject({ ok: false, issue: 'reserved' })
    expect(validatePublicIdentifier('fresh-shop')).toEqual({ ok: true, value: 'fresh-shop', grandfathered: false })
  })

  it('allows an unchanged legacy short identifier without making it reusable', () => {
    expect(validatePublicIdentifier('old', { current: 'old' })).toEqual({
      ok: true,
      value: 'old',
      grandfathered: true,
    })
    expect(validatePublicIdentifier('new')).toMatchObject({ ok: false, issue: 'too_short' })
  })

  it('maps database constraint failures to stable seller-facing messages', () => {
    expect(publicIdentifierDatabaseMessage({ message: 'PUBLIC_IDENTIFIER_RESERVED' })).toMatch(/reserved/i)
    expect(publicIdentifierDatabaseMessage({ message: 'PUBLIC_IDENTIFIER_TAKEN' })).toMatch(/already taken/i)
    expect(publicIdentifierDatabaseMessage({ code: '23505', message: 'pages_slug_key' })).toMatch(/already taken/i)
    expect(publicIdentifierDatabaseMessage({ code: '23505', message: 'unrelated_key' })).toBeNull()
  })

  it('rejects stale async responses after a newer check or invalidation', () => {
    const guard = new PublicIdentifierRequestGuard()
    const first = guard.begin()
    const second = guard.begin()
    expect(guard.accepts(first)).toBe(false)
    expect(guard.accepts(second)).toBe(true)
    guard.invalidate()
    expect(guard.accepts(second)).toBe(false)
  })
})
