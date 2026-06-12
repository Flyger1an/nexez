#!/usr/bin/env node
/**
 * Palette guard — fails if off-palette accent colors creep back into the source.
 *
 * The Liquid Glass system has exactly three accent tokens (DESIGN_SYSTEM.md §3):
 *   --signal (periwinkle, interactive/primary), --ready (teal, positive/success),
 *   --amber (attention). Red/rose are allowed for error states. Everything else
 *   (cyan/emerald/green/teal/violet/purple/fuchsia/indigo/amber/orange/yellow/
 *   pink/blue/sky/lime Tailwind classes, and the legacy brand hexes used as
 *   arbitrary class values) must be a token instead.
 *
 * app/globals.css is the ONE allowed place to reference raw colors (it defines
 * the tokens + the neutral compatibility layer), so it is skipped.
 *
 * Run: `npm run lint:palette`
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['app', 'components']
const SKIP_FILE = /\.(test|spec)\.[tj]sx?$/
const SCAN_EXT = /\.(tsx|ts|jsx|js)$/

// 1) Off-palette named Tailwind color utilities (any shade). Red/rose excluded.
const PREFIX = 'text|bg|border|ring|from|via|to|accent|fill|stroke|divide|outline|decoration|caret|placeholder|ring-offset|shadow'
const FAMILY = 'cyan|emerald|green|teal|violet|purple|fuchsia|indigo|amber|orange|yellow|pink|blue|sky|lime'
const CLASS_RE = new RegExp(`(?:${PREFIX})-(?:${FAMILY})-\\d{2,3}\\b`, 'gi')

// 2) Legacy brand hexes used as arbitrary class values (bracketed). Quoted JS
//    hexes (Stripe appearance config, color-input placeholders) are intentionally
//    NOT matched — only Tailwind arbitrary values `[#...]`.
const LEGACY_HEX_RE = /\[#(?:7c3aed|6d28d9|00f5ff|7de3ff|00d4ff|10b981|34d399|c4b5fd|a78bfa|f59e0b)\]/gi

const violations = []

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue
      walk(full)
    } else if (SCAN_EXT.test(entry) && !SKIP_FILE.test(entry)) {
      scan(full)
    }
  }
}

function scan(file) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const re of [CLASS_RE, LEGACY_HEX_RE]) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(line)) !== null) {
        violations.push({ file, line: i + 1, match: m[0] })
      }
    }
  })
}

for (const root of ROOTS) {
  try {
    walk(root)
  } catch {
    /* root missing — skip */
  }
}

if (violations.length) {
  console.error(`\n✗ palette guard: ${violations.length} off-palette color use(s) found.\n`)
  console.error('  Use the design tokens instead:')
  console.error('    cyan/sky/blue/violet/purple/pink/indigo/fuchsia → text-[var(--signal)]  (interactive/primary)')
  console.error('    emerald/green/teal                              → text-[var(--ready)]   (positive/success)')
  console.error('    amber/orange/yellow                             → text-[var(--amber)]   (attention)')
  console.error('    solid brand-fill buttons (white text)           → bg-[var(--signal-solid)]')
  console.error('    (red/rose are allowed for error states)\n')
  for (const v of violations) {
    console.error(`    ${v.file}:${v.line}  ${v.match}`)
  }
  console.error('')
  process.exit(1)
}

console.log('✓ palette guard: no off-palette accent colors in app/ or components/.')
