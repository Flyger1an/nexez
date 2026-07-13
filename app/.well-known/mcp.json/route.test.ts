import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbRef } = vi.hoisted(() => ({
  dbRef: { handler: (_c: any) => ({ data: [] as any[], error: null }) as { data?: any; error?: any } },
}))

vi.mock('../../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../../test/supabase-mock')
  return { supabase: createSupabaseMock((c) => dbRef.handler(c)) }
})
vi.mock('../../../lib/server/storefront', () => ({
  loadPublicStorefronts: vi.fn(async () => []),
}))

import { GET } from './route'

describe('GET /.well-known/mcp.json', () => {
  beforeEach(() => {
    dbRef.handler = () => ({ data: [], error: null })
  })

  it('serves the discovery catalog cached + noindexed (agents still fetch it; Google never indexes it)', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('public')
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    const body = await res.json()
    expect(Array.isArray(body.pages)).toBe(true)
  })
})
