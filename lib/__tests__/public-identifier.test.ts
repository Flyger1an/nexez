import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PUBLIC_IDENTIFIER_MAX,
  PUBLIC_IDENTIFIER_MIN,
  RESERVED_PUBLIC_IDENTIFIERS,
  isReservedPublicIdentifier,
  normalizePublicIdentifier,
  publicIdentifierDatabaseMessage,
  publicIdentifierSuggestions,
  validatePublicIdentifier,
} from '../public-identifier'

describe('public identifier policy', () => {
  it('normalizes to lowercase ASCII words separated by single hyphens', () => {
    expect(normalizePublicIdentifier('  My Cakery & Café  ')).toBe('my-cakery-caf')
    expect(normalizePublicIdentifier('--Acme---Studio--')).toBe('acme-studio')
  })

  it('enforces the shared five to sixty-three character boundary', () => {
    expect(PUBLIC_IDENTIFIER_MIN).toBe(5)
    expect(PUBLIC_IDENTIFIER_MAX).toBe(63)
    expect(validatePublicIdentifier('abcd')).toMatchObject({ ok: false, issue: 'too_short' })
    expect(validatePublicIdentifier('abcde')).toMatchObject({ ok: true })
    expect(validatePublicIdentifier('a'.repeat(64))).toMatchObject({ ok: false, issue: 'too_long' })
    expect(normalizePublicIdentifier('a'.repeat(64))).toHaveLength(64)
  })

  it('rejects route, trust, punycode, and Nexez impersonation names', () => {
    for (const identifier of ['checkout', 'verified', 'xn--store', 'nexez-shop', 'shop-nexez']) {
      expect(isReservedPublicIdentifier(identifier), identifier).toBe(true)
      expect(validatePublicIdentifier(identifier), identifier).toMatchObject({ ok: false, issue: 'reserved' })
    }
  })

  it('grandfathers only an unchanged saved short identifier', () => {
    expect(validatePublicIdentifier('a', { current: 'a' })).toEqual({
      ok: true,
      value: 'a',
      grandfathered: true,
    })
    expect(validatePublicIdentifier('b', { current: 'a' })).toMatchObject({ ok: false, issue: 'too_short' })
  })

  it('returns readable, valid fallback suggestions', () => {
    for (const input of ['app', 'nexez-support', 'a'.repeat(100)]) {
      const suggestions = publicIdentifierSuggestions(input)
      expect(suggestions.length, input).toBeGreaterThan(0)
      for (const suggestion of suggestions) expect(validatePublicIdentifier(suggestion).ok).toBe(true)
    }
  })

  it('does not mislabel an unrelated database conflict as a public-name collision', () => {
    expect(publicIdentifierDatabaseMessage({
      code: '23514',
      message: 'public_identifier_required',
    })).toBe('Choose a public name before publishing.')
    expect(publicIdentifierDatabaseMessage({
      code: '23505',
      message: 'duplicate key value violates unique constraint "pages_slug_key"',
    })).toBe('That public name is already taken. Try another.')
    expect(publicIdentifierDatabaseMessage({
      code: '23505',
      message: 'This listing no longer owns the custom-domain claim.',
    })).toBeNull()
  })
})

describe('database reservation drift guard', () => {
  it('seeds every shared reserved identifier in the identifier migration', () => {
    const migrationsDirectory = join(__dirname, '../../supabase/migrations')
    const migration = readFileSync(join(migrationsDirectory, '20260825200808_secure_public_identifiers.sql'), 'utf8')
    const seed = migration.match(/select unnest\(array\[([\s\S]*?)\]::text\[\]\)/)?.[1] ?? ''
    const seeded = new Set([...seed.matchAll(/'([^']+)'/g)].map((match) => match[1]))

    // New product routes are reserved in their own forward-only migrations.
    // Fold those explicit system claims into the drift check without rewriting
    // an applied migration.
    for (const file of readdirSync(migrationsDirectory).filter((name) => name.endsWith('.sql'))) {
      const sql = readFileSync(join(migrationsDirectory, file), 'utf8')
      for (const match of sql.matchAll(/\('(?:page_slug|storefront_handle)',\s*'([^']+)',\s*'system'\)/g)) {
        seeded.add(match[1])
      }
    }
    expect(seeded).toEqual(RESERVED_PUBLIC_IDENTIFIERS)
  })

  it('preserves unnamed drafts without weakening published listing identity', () => {
    const migration = readFileSync(
      join(__dirname, '../../supabase/migrations/20260825200808_secure_public_identifiers.sql'),
      'utf8',
    )
    expect(migration).toMatch(/from public\.pages as page\s+where page\.slug is not null\s+on conflict/i)
    expect(migration).toContain("raise exception 'public_identifier_required'")
    expect(migration).toMatch(/pages_published_slug_required[\s\S]*is_published is not true or slug is not null/i)
  })
})
