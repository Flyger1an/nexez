import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RESERVED_SLUGS, isReservedSlug, normalizeSlug } from '../agent-page'
import { buildDuplicatePayload } from '../duplicate-page'
import type { AgentPage } from '../agent-page'

describe('isReservedSlug', () => {
  it('reserves platform route segments', () => {
    for (const slug of ['learn', 'store', 'scan', 'orders', 'acp', 'checkout', 'dashboard']) {
      expect(isReservedSlug(slug), slug).toBe(true)
    }
  })

  it('leaves normal business slugs alone', () => {
    for (const slug of ['acme-studio', 'kismetpros', 'learn-piano-with-sam', 'store-front-cafe']) {
      expect(isReservedSlug(slug), slug).toBe(false)
    }
  })
})

describe('route-sync guard', () => {
  it('every top-level app/ route segment is in RESERVED_SLUGS (add new routes there too)', () => {
    const appDir = join(__dirname, '../../app')
    const missing: string[] = []
    for (const entry of readdirSync(appDir)) {
      if (entry.startsWith('[') || entry.startsWith('.') || entry.startsWith('_')) continue
      if (!statSync(join(appDir, entry)).isDirectory()) continue // page.tsx, globals.css, dotted artifact files
      // Dotted segments (agent-pages.json, .well-known, llms.txt) can't collide:
      // normalizeSlug strips dots, so a slug can never equal them.
      if (entry.includes('.')) continue
      if (!RESERVED_SLUGS.has(entry)) missing.push(entry)
    }
    expect(missing, `Add these new route segments to RESERVED_SLUGS in lib/agent-page.ts: ${missing.join(', ')}`).toEqual([])
  })

  it('reserved entries are themselves normalized (the check compares post-normalizeSlug values)', () => {
    for (const slug of RESERVED_SLUGS) {
      expect(normalizeSlug(slug), slug).toBe(slug)
    }
  })
})

describe('buildDuplicatePayload slug minting', () => {
  it('normal names are unaffected and collisions suffix deterministically', () => {
    const page = { name: 'Learn', slug: 'learn-x' } as AgentPage
    // base = 'learn-copy' - the '-copy' suffix means a duplicate base can never
    // itself BE a reserved word; the isReservedSlug guard in the mint loop is
    // defense-in-depth for future base changes.
    expect(buildDuplicatePayload(page, 'owner-1', []).slug).toBe('learn-copy')
    expect(buildDuplicatePayload(page, 'owner-1', ['learn-copy']).slug).toBe('learn-copy-2')
  })
})
