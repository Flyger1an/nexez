import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASIC_OWNER_PAGE_SELECT, OWNER_PAGE_SELECT, SERVER_PAGE_SELECT } from '../agent-page'

// SEV1 GUARD (inverse of pages-public-parity): owner/server surfaces select
// OWNER_PAGE_SELECT / SERVER_PAGE_SELECT against the BASE `pages` table under
// RLS. If a column lands in those selects without a migration adding it to
// `public.pages`, PostgREST 42703s and every owner read fails - dashboard,
// listings, PagesManager degrade to the basic select and dashboard/settings
// rendered EMPTY for ~11 days when `marketplace_discoverable` was added to
// PUBLIC_PAGE_COLUMNS but only migrated onto pages_public (20260721160006,
// fixed by 20260805225300). This test fails the build if selects and the
// pages schema ever drift again.

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase', 'migrations')

/** All column names ever defined on public.pages across every migration. */
function pagesColumnsFromMigrations(): Set<string> {
  const cols = new Set<string>()
  for (const file of readdirSync(MIGRATIONS_DIR)) {
    if (!file.endsWith('.sql')) continue
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')

    // 1) create table [if not exists] [public.]pages ( ... )
    const create = sql.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?pages\s*\(([\s\S]*?)\)\s*;/i)
    if (create) {
      for (const rawLine of create[1].split('\n')) {
        const line = rawLine.trim()
        const m = line.match(/^"?([a-z_][a-z0-9_]*)"?\s+(?:text|boolean|jsonb|json|uuid|timestamptz|timestamp|integer|int|bigint|numeric|date|serial)/i)
        if (m && !['primary', 'foreign', 'constraint', 'unique', 'check'].includes(m[1])) cols.add(m[1])
      }
    }

    // 2) alter table [public.]pages ... add column [if not exists] <name>
    //    (handles multi-add statements and statements split across lines)
    const alterBlocks = sql.match(/alter\s+table\s+(?:only\s+)?(?:public\.)?pages\b[\s\S]*?;/gi) ?? []
    for (const block of alterBlocks) {
      for (const m of block.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
        cols.add(m[1])
      }
    }
  }
  return cols
}

function selectColumns(select: string): string[] {
  return select
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
}

describe('owner/server selects vs pages schema', () => {
  const schemaCols = pagesColumnsFromMigrations()

  it('parses a sane pages schema from migrations', () => {
    // Guard the guard: if the migration parser breaks, fail loudly instead of
    // vacuously passing with an empty set.
    expect(schemaCols.size).toBeGreaterThan(20)
    expect(schemaCols.has('slug')).toBe(true)
    expect(schemaCols.has('is_published')).toBe(true)
  })

  for (const [name, select] of [
    ['SERVER_PAGE_SELECT', SERVER_PAGE_SELECT],
    ['OWNER_PAGE_SELECT', OWNER_PAGE_SELECT],
    ['BASIC_OWNER_PAGE_SELECT', BASIC_OWNER_PAGE_SELECT],
  ] as const) {
    it(`${name} only selects columns migrated onto public.pages`, () => {
      const missing = selectColumns(select).filter((c) => !schemaCols.has(c))
      expect(
        missing,
        `${name} selects column(s) [${missing.join(', ')}] that no migration adds to public.pages. ` +
          'Owner reads run this select against the base pages table under RLS; a missing column ' +
          '42703s every owner surface. Add a migration (see 20260805225300) or remove the column.',
      ).toEqual([])
    })
  }

  it('regression: marketplace_discoverable exists on base pages', () => {
    expect(schemaCols.has('marketplace_discoverable')).toBe(true)
  })
})
