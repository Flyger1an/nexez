import { describe, it, expect, vi, beforeEach } from 'vitest'

const { hostRef, dbRef } = vi.hoisted(() => ({
  hostRef: { host: 'nexez.test' },
  dbRef: { handler: (_c: any) => ({ data: [] as any[], error: null }) as { data?: any; error?: any } },
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: hostRef.host }),
}))
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabase-mock')
  return { supabase: createSupabaseMock((c) => dbRef.handler(c)) }
})

import sitemap from './sitemap'
import { AGENT_RUNTIME_HOST, APP_HOST, MARKETING_HOST } from '../lib/site'

const pages = [
  { slug: 'demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
  { slug: 'solo', created_at: '2026-02-01T00:00:00Z', updated_at: null },
  // Internal QA seed - must stay out of discovery surfaces.
  { slug: 'qa-gauntlet-63', created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-02T00:00:00Z' },
]

describe('sitemap()', () => {
  beforeEach(() => {
    hostRef.host = AGENT_RUNTIME_HOST
    dbRef.handler = (ctx: any) => (ctx.table === 'pages_public' ? { data: pages, error: null } : { data: null, error: null })
  })

  it('marketing host: marketing URLs only, with NO lastModified (always-now is distrusted by Google)', async () => {
    hostRef.host = MARKETING_HOST
    const entries = await sitemap()
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(entry.url.startsWith(`https://${MARKETING_HOST}/`)).toBe(true)
      expect(entry.lastModified).toBeUndefined()
    }
    expect(entries.map((e) => e.url)).toContain(`https://${MARKETING_HOST}/pricing`)
  })

  it('app host: empty (the authenticated app is kept out of search)', async () => {
    hostRef.host = APP_HOST
    expect(await sitemap()).toEqual([])
  })

  it('agent runtime host: ONLY indexable HTML listing pages - no checkout URLs, no JSON/API artifacts', async () => {
    const entries = await sitemap()
    const urls = entries.map((e) => e.url)

    expect(urls).toContain(`https://${AGENT_RUNTIME_HOST}/demo`)
    expect(urls).toContain(`https://${AGENT_RUNTIME_HOST}/solo`)
    // Agents discover artifacts via .well-known + <link rel=alternate> +
    // /agent-pages.json, never via the Google sitemap.
    for (const url of urls) {
      expect(url).not.toContain('/checkout/')
      expect(url).not.toContain('.json')
      expect(url).not.toContain('/api/')
      expect(url).not.toContain('/.well-known/')
    }
  })

  it('listing entries keep their REAL lastmod (updated_at, falling back to created_at)', async () => {
    const entries = await sitemap()
    const demo = entries.find((e) => e.url.endsWith('/demo'))
    const solo = entries.find((e) => e.url.endsWith('/solo'))
    expect(demo?.lastModified).toEqual(new Date('2026-01-02T00:00:00Z'))
    expect(solo?.lastModified).toEqual(new Date('2026-02-01T00:00:00Z'))
  })

  it('filters internal QA seed pages out of the runtime sitemap', async () => {
    const entries = await sitemap()
    expect(entries.map((e) => e.url).some((u) => u.includes('qa-gauntlet'))).toBe(false)
  })
})
