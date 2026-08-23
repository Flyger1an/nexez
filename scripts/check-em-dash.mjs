#!/usr/bin/env node
/**
 * Em dash guard - fails if an em dash (U+2014) creeps back into the source.
 *
 * House style bans the em dash in code, comments, copy, and docs. Use a comma,
 * a colon, parentheses, or a spaced hyphen instead. The rule had drifted to
 * 950+ occurrences before this guard existed, because nothing enforced it.
 *
 * This file never contains a literal em dash: the character is built from its
 * code point below. That keeps the guard from flagging itself, and keeps a
 * find-and-replace sweep over the repo from silently rewriting its own pattern.
 *
 * Two deliberate exemptions:
 *
 *   1. A standalone quoted em dash is the empty-value glyph in dashboard tables
 *      ("no data yet"). That is a typographic data symbol, not prose, so it
 *      stays. Anything with text on either side of the dash is prose and fails.
 *
 *   2. AGENTS.md is rewritten by `next dev` (see
 *      node_modules/next/dist/server/lib/generate-agent-files.js). Its em dashes
 *      are regenerated upstream, so flagging them would make the tree
 *      permanently dirty and the guard permanently red.
 *
 * SQL is checked on `--` comment lines only. An em dash inside a SQL string
 * literal is stored database state (a COMMENT ON body), and rewriting the file
 * without also migrating production would create exactly the repo/production
 * drift this project works to avoid.
 *
 * Run: `npm run lint:em-dash`
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, basename } from 'node:path'

const EM_DASH = String.fromCharCode(0x2014)

const ROOTS = [
  'app', 'components', 'lib', 'e2e', 'scripts', 'docs', 'emails', 'utils',
  'supabase/migrations', 'apps', 'plugins', 'sdk', 'test',
]

const SCAN_EXT = /\.(tsx?|jsx?|mjs|cjs|sql|md|css)$/
const SKIP_DIR = new Set(['node_modules', '.next', 'dist', 'build', '.expo', 'coverage'])
const SKIP_FILE = new Set(['AGENTS.md'])

// A standalone em dash used as the "no value" placeholder in data cells, in the
// two forms the codebase uses: a quoted literal in TS/TSX, and a lone cell in a
// Markdown table. Both are typographic data symbols rather than prose.
const PLACEHOLDER_RE = new RegExp(`(['"\`])${EM_DASH}\\1`, 'g')
const TABLE_CELL_RE = new RegExp(`\\|(\\s*)${EM_DASH}(\\s*)(?=\\|)`, 'g')

const violations = []

function walk(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return // root not present in this checkout
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      if (SKIP_DIR.has(entry)) continue
      walk(full)
    } else if (SCAN_EXT.test(entry) && !SKIP_FILE.has(basename(full))) {
      scan(full)
    }
  }
}

function scan(file) {
  const isSql = extname(file) === '.sql'
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((raw, i) => {
    if (!raw.includes(EM_DASH)) return
    // In SQL only `--` comment prose is in scope; string literals are stored state.
    if (isSql && !raw.trimStart().startsWith('--')) return
    // Blank out the sanctioned placeholders before counting what is left.
    let line = raw.replace(PLACEHOLDER_RE, '$1$1')
    if (extname(file) === '.md') {
      // Run to a fixed point: adjacent cells share the pipe between them.
      let prev
      do {
        prev = line
        line = line.replace(TABLE_CELL_RE, '|$1$2')
      } while (line !== prev)
    }
    if (!line.includes(EM_DASH)) return
    violations.push({ file, line: i + 1, text: raw.trim().slice(0, 100) })
  })
}

for (const root of ROOTS) walk(root)

// Root-level markdown (README, ROADMAP, HANDOFF, and friends).
for (const entry of readdirSync('.')) {
  if (extname(entry) === '.md' && !SKIP_FILE.has(entry)) scan(entry)
}

if (violations.length) {
  console.error(`\n✗ em dash guard: ${violations.length} em dash(es) found.\n`)
  console.error('  House style bans the em dash. Use a comma, a colon, parentheses,')
  console.error('  or a spaced hyphen instead. A standalone quoted em dash used as')
  console.error('  the "no value" placeholder in a data cell is still allowed.\n')
  for (const v of violations) {
    console.error(`    ${v.file}:${v.line}  ${v.text}`)
  }
  console.error('')
  process.exit(1)
}

console.log('✓ em dash guard: no em dashes in source, docs, or migrations.')
