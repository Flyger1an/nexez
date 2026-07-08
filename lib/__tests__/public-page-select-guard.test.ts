import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PUBLIC_PAGE_SELECT } from '../agent-page'

/**
 * The SEV1 coupling guard: every column in PUBLIC_PAGE_SELECT must exist on the
 * `pages_public` projection, or every anon/agent read (public pages, agent.json,
 * llms.txt, search, the proxy's custom-domain lookup) starts erroring at once.
 * This happened live when `currency` was added to the select but not the
 * projection. The projection is schema-as-code: the CREATE TABLE in the
 * launch-hardening migration plus any later ALTER ... ADD COLUMN - parse those
 * and require the select to be a subset.
 */
describe('PUBLIC_PAGE_SELECT ⊆ pages_public (SEV1 coupling)', () => {
  it('every selected column exists on the projection', () => {
    const dir = join(process.cwd(), 'supabase', 'migrations')
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

    const projectionColumns = new Set<string>()
    for (const file of files) {
      const sql = readFileSync(join(dir, file), 'utf8')

      // The projection CREATE: `create table public.pages_public as select ... from public.pages`
      const createMatch = sql.match(/create table public\.pages_public as\s+select([\s\S]*?)from public\.pages/i)
      if (createMatch) {
        projectionColumns.clear() // a later full re-create supersedes earlier definitions
        for (const rawLine of createMatch[1]!.split('\n')) {
          const line = rawLine.trim().replace(/,$/, '')
          if (!line) continue
          // `p.col` or `fn(...) as col` - the exposed name is the last identifier.
          const named = line.match(/\bas\s+([a-z_]+)$/i)?.[1] ?? line.match(/^p\.([a-z_]+)$/i)?.[1]
          if (named) projectionColumns.add(named.toLowerCase())
        }
      }

      // Later additive columns: `alter table public.pages_public add column [if not exists] <name>`
      for (const alter of sql.matchAll(/alter table public\.pages_public\s+add column (?:if not exists )?([a-z_]+)/gi)) {
        projectionColumns.add(alter[1]!.toLowerCase())
      }
    }

    expect(projectionColumns.size).toBeGreaterThan(10) // the parse found the projection at all

    const selected = PUBLIC_PAGE_SELECT.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean)
    const missing = selected.filter((column) => !projectionColumns.has(column))
    expect(missing, `PUBLIC_PAGE_SELECT columns missing from the pages_public projection: ${missing.join(', ')} - add them to the projection migration AND the sync trigger before shipping`).toEqual([])
  })
})
