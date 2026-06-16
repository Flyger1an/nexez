import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PUBLIC_PAGE_SELECT } from '../agent-page'

// SEV1 GUARD: every public/agent surface reads the `pages_public` VIEW, but the
// route handlers select `PUBLIC_PAGE_SELECT` columns. If a column is added to
// PUBLIC_PAGE_SELECT without also being added to the view, PostgREST errors and
// the ENTIRE public/agent surface 404s (this happened for ~33 min when `currency`
// was added). This test fails the build if the two ever drift, before deploy.

/** Output column names of the pages_public view (handles `coalesce(...) as products`). */
function viewOutputColumns(sql: string): string[] {
  const m = sql.match(/create\s+or\s+replace\s+view\s+public\.pages_public\s+as\s+select([\s\S]*?)\sfrom\s+pages\b/i)
  if (!m) return []
  // Split the projection on TOP-LEVEL commas only — the rules-stripping jsonb
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

describe('pages_public view ⊇ PUBLIC_PAGE_SELECT (the SEV1 coupling guard)', () => {
  it('every column the public/agent surface selects exists in the latest pages_public view', () => {
    const dir = join(process.cwd(), 'supabase', 'migrations')
    const defining = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort() // timestamp-prefixed → chronological
      .filter((f) => /create\s+or\s+replace\s+view\s+public\.pages_public/i.test(readFileSync(join(dir, f), 'utf8')))
    expect(defining.length, 'no migration defines the pages_public view').toBeGreaterThan(0)

    const latest = defining[defining.length - 1]
    const viewCols = new Set(viewOutputColumns(readFileSync(join(dir, latest), 'utf8')))
    const selectCols = PUBLIC_PAGE_SELECT.split(',').map((c) => c.trim()).filter(Boolean)

    const missing = selectCols.filter((c) => !viewCols.has(c))
    expect(
      missing,
      `PUBLIC_PAGE_SELECT columns missing from the pages_public view (${latest}): ${JSON.stringify(missing)}. ` +
        `Adding a column to PUBLIC_PAGE_SELECT without the view 404s the entire public/agent surface. ` +
        `Recreate the view with the column appended at the END (CREATE OR REPLACE).`,
    ).toEqual([])
  })
})
