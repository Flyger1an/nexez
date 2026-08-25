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

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : []
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

  // The column guard above catches a MISSING column. It cannot catch a leaking KEY
  // inside a projected jsonb blob, which is how `agent_memory` and the offer `rules`
  // problems happened. The projection builds offers and verification_details from
  // named fields now, so this asserts the allowlists stay allowlists: every private
  // key must be absent, and the builders must not fall back to copying the input.
  describe('projected jsonb blobs are built from an allowlist', () => {
    const dir = join(process.cwd(), 'supabase', 'migrations')
    // Strip `--` comments first: these assertions are about what the SQL DOES, and a
    // migration that explains which keys it withholds would otherwise fail for
    // naming them in prose.
    const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '')
    const migrationSql = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .map(stripComments)
    const allowlistSql = migrationSql
      .filter((sql) => /create or replace function private\.nz_public_offer\b/i.test(sql))
      .pop()
    const verificationSql = migrationSql
      .filter((sql) => /create or replace function private\.nz_public_verification\b/i.test(sql))
      .pop()
    const metadataSql = migrationSql
      .filter((sql) => /create or replace function private\.nz_public_offer_metadata\b/i.test(sql))
      .pop()
    const offerRulesSql = migrationSql
      .filter((sql) => /create or replace function private\.nz_public_offer_rules\b/i.test(sql))
      .pop()

    it('defines the offer and verification allowlists', () => {
      expect(allowlistSql, 'no migration defines private.nz_public_offer').toBeTruthy()
      expect(verificationSql, 'no migration defines private.nz_public_verification').toBeTruthy()
      // The old denylist must be gone: `elem - 'rules'` copies everything else.
      expect(allowlistSql).not.toMatch(/elem\s*-\s*'rules'/)
    })

    // Seller pricing floors and auto-decision bands. Publishing any of these hands
    // an agent the merchant's negotiating position.
    it.each([
      'minPrice',
      'maxDiscountPercent',
      'autoAcceptWithinPercent',
      'autoAccept',
      'autoCounter',
      'autoSettleMax',
    ])('never projects the private offer rule %s', (key) => {
      expect(allowlistSql).not.toContain(`'${key}'`)
    })

    // Credential internals. `file_path` is a private bucket path; `verdict` is
    // free-text LLM review prose about a named person's license.
    it.each(['file_path', 'verdict', 'mime', 'uploaded_at', 'reviewed_at'])(
      'never projects the credential field %s',
      (key) => {
        expect(verificationSql).not.toContain(`'${key}'`)
      },
    )

    // Fields the public surface genuinely reads. Dropping one silently breaks
    // rendering or location filtering rather than leaking anything, so pin them.
    it.each(['name', 'price', 'availability', 'offerType'])(
      'still projects the public field %s',
      (key) => {
        expect(allowlistSql).toContain(`'${key}'`)
      },
    )

    it('still projects the public metadata and booking-rule contract', () => {
      expect(metadataSql).toContain("'service_area'")
      expect(offerRulesSql).toContain("'minNoticeHours'")
      for (const key of ['includedScope', 'excludedScope', 'maxRevisions', 'maxProjectWeeks']) {
        expect(offerRulesSql).toContain(`'${key}'`)
      }
    })

    it('still projects the public verification contract', () => {
      expect(verificationSql).toContain("'docs_provided'")
    })

    it.each([
      'customerInputs',
      'attributes',
      'recurringTerms',
      'fulfillmentRules',
      'stagedSettlementTerms',
      'reservableResourceTerms',
    ])('projects the configured commerce field %s', (key) => {
      expect(allowlistSql).toContain(`'${key}'`)
    })

    it.each([
      'nz_public_offer_customer_inputs',
      'nz_public_recurring_terms',
      'nz_public_staged_settlement_terms',
      'nz_public_reservable_resource_terms',
    ])('routes configured commerce through the nested allowlist %s', (helper) => {
      expect(allowlistSql).toContain(`private.${helper}`)
    })
  })

  it('keeps owner-only implementation identifiers out of the public select', () => {
    const selectCols = PUBLIC_PAGE_SELECT.split(',').map((c) => c.trim()).filter(Boolean)
    expect(selectCols).not.toContain('owner_id')
    expect(selectCols).not.toContain('google_calendar_id')
  })

  it('keeps the curation flag in every custom discovery projection', () => {
    const offenders: string[] = []
    for (const file of [...sourceFiles(join(process.cwd(), 'app')), ...sourceFiles(join(process.cwd(), 'lib'))]) {
      const source = readFileSync(file, 'utf8')
      if (!source.includes('publicLaunchVisiblePages') || !source.includes("from('pages_public')")) continue

      const projections = [...source.matchAll(/\.from\(['"]pages_public['"]\)[\s\S]{0,700}?\.select\(([\s\S]*?)\)\s*\./g)]
      if (projections.length === 0) {
        offenders.push(`${file}: no inspectable pages_public projection`)
        continue
      }
      for (const projection of projections) {
        const selected = projection[1]
        // The simulator has a backward-compatibility detail lookup that predates
        // marketplace curation. It never supplies the ranked discovery field.
        if (file.endsWith('/app/simulator/SimulatorClient.tsx') && selected.trim() === 'BASIC_OWNER_PAGE_SELECT') continue
        if (!selected.includes('PUBLIC_PAGE_SELECT') && !selected.includes('marketplace_discoverable')) {
          offenders.push(`${file}: ${selected.trim()}`)
        }
      }
    }

    expect(
      offenders,
      'A discovery surface calls publicLaunchVisiblePages() without selecting marketplace_discoverable. ' +
        'The helper then fails open for curated direct-only listings.',
    ).toEqual([])
  })
})
