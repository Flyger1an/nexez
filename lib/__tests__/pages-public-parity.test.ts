import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PUBLIC_PAGE_SELECT } from '../agent-page'

// SEV1 GUARD: every public/agent surface reads the `pages_public` projection, but the
// route handlers select `PUBLIC_PAGE_SELECT` columns. If a column is added to
// PUBLIC_PAGE_SELECT without also being added to the projection, PostgREST errors and
// the ENTIRE public/agent surface 404s (this happened for ~33 min when `currency`
// was added). This test fails the build if the two ever drift, before deploy.

/** Output column names of the pages_public projection (handles `coalesce(...) as products`). */
function projectionOutputColumns(sql: string): string[] {
  const m = sql.match(/create\s+(?:or\s+replace\s+view|table)\s+public\.pages_public(?:\s+as)?\s+select([\s\S]*?)\sfrom\s+(?:public\.)?pages\b/i)
  if (!m) return []
  // Split the projection on TOP-LEVEL commas only - the rules-stripping jsonb
  // subqueries contain commas inside parens that must not split a column.
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of m[1]) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  parts.push(cur)
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const aliased = p.match(/\sas\s+"?(\w+)"?\s*$/i)
      if (aliased) return aliased[1]
      const bare = p.match(/(\w+)\s*$/)
      return bare ? bare[1] : p
    })
}

describe('pages_public projection ⊇ PUBLIC_PAGE_SELECT (the SEV1 coupling guard)', () => {
  it('every column the public/agent surface selects exists in the latest pages_public projection', () => {
    const dir = join(process.cwd(), 'supabase', 'migrations')
    const migrations = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort() // timestamp-prefixed → chronological
    const defining = migrations.filter((f) => /create\s+(?:or\s+replace\s+view|table)\s+public\.pages_public/i.test(readFileSync(join(dir, f), 'utf8')))
    expect(defining.length, 'no migration defines the pages_public projection').toBeGreaterThan(0)

    const latest = defining[defining.length - 1]
    const viewCols = new Set(projectionOutputColumns(readFileSync(join(dir, latest), 'utf8')))
    for (const migration of migrations.slice(migrations.indexOf(latest) + 1)) {
      const sql = readFileSync(join(dir, migration), 'utf8')
      for (const alter of sql.matchAll(/alter table public\.pages_public\s+add column (?:if not exists )?([a-z_]+)/gi)) {
        viewCols.add(alter[1])
      }
    }
    const selectCols = PUBLIC_PAGE_SELECT.split(',').map((c) => c.trim()).filter(Boolean)

    const missing = selectCols.filter((c) => !viewCols.has(c))
    expect(
      missing,
      `PUBLIC_PAGE_SELECT columns missing from the pages_public projection (${latest}): ${JSON.stringify(missing)}. ` +
        `Adding a column to PUBLIC_PAGE_SELECT without the projection 404s the entire public/agent surface. ` +
        `Update the latest pages_public migration with the column appended at the END.`,
    ).toEqual([])
  })

  it('keeps owner-only implementation identifiers out of the public select', () => {
    const selectCols = PUBLIC_PAGE_SELECT.split(',').map((c) => c.trim()).filter(Boolean)
    expect(selectCols).not.toContain('owner_id')
    expect(selectCols).not.toContain('google_calendar_id')
  })
})
