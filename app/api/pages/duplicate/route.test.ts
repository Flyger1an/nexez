import { describe, it, expect, vi, beforeEach } from 'vitest'

const refs = vi.hoisted(() => ({
  user: { id: 'editor-2', email: 'mate@x.com' } as any,
  access: { pageId: 'p1', ownerId: 'owner-1', role: 'editor' } as any,
  source: { id: 'p1', name: 'Acme', slug: 'acme' } as any,
  owned: [{ slug: 'acme' }] as any[],
  // Queue of insert outcomes - the route retries on 23505, so tests can seed a
  // conflict followed by a success. The LAST entry repeats when the queue drains.
  insertResults: [{ data: { id: 'p2', slug: 'acme-copy' }, error: null }] as any[],
  insertPayloads: [] as any[],
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../utils/supabase/server', () => ({
  createClient: vi.fn(() => ({ auth: { getUser: async () => ({ data: { user: refs.user } }) } })),
}))
const rl = vi.hoisted(() => ({ ownerOk: true }))
vi.mock('../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => null),
  rateLimitShared: vi.fn(async () => ({ ok: rl.ownerOk, remaining: 0, retryAfter: 0, limit: 30 })),
}))
vi.mock('../../../../lib/server/page-access', () => ({ resolvePageAccess: vi.fn(async () => refs.access) }))
vi.mock('../../../../lib/duplicate-page', () => ({
  // Slug-aware stand-in mirroring the real deterministic walk (the real payload
  // builder is covered by lib/__tests__/reserved-slugs.test.ts) so this file can
  // prove the ROUTE's conflict-retry consumes the growing exclusion list.
  buildDuplicatePayload: (page: any, ownerId: string, existingSlugs: string[]) => {
    const base = 'acme-copy'
    let slug = base
    let i = 2
    while (existingSlugs.includes(slug)) {
      slug = `${base}-${i}`
      i++
    }
    return { owner_id: ownerId, name: `${page.name} (Copy)`, slug }
  },
}))
vi.mock('../../../../lib/agent-page', () => ({ OWNER_PAGE_SELECT: 'id, name, slug' }))
vi.mock('../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: refs.source, error: null }), // source page load
          returns: async () => ({ data: refs.owned, error: null }), // owner's existing slugs
        }),
      }),
      insert: (payload: any) => {
        refs.insertPayloads.push(payload)
        const result = refs.insertResults.length > 1 ? refs.insertResults.shift() : refs.insertResults[0]
        return { select: () => ({ single: async () => result }) }
      },
    }),
  })),
}))

import { POST } from './route'

const post = (body: unknown) =>
  new Request('https://app.nexez.ai/api/pages/duplicate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/pages/duplicate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.user = { id: 'editor-2', email: 'mate@x.com' }
    refs.access = { pageId: 'p1', ownerId: 'owner-1', role: 'editor' }
    refs.source = { id: 'p1', name: 'Acme', slug: 'acme' }
    refs.insertResults = [{ data: { id: 'p2', slug: 'acme-copy' }, error: null }]
    refs.insertPayloads = []
    rl.ownerOk = true
  })

  it('429 when the per-owner duplicate cap is hit', async () => {
    rl.ownerOk = false
    expect((await POST(post({ pageId: 'p1' }))).status).toBe(429)
  })

  it('401 when not authenticated', async () => {
    refs.user = null
    expect((await POST(post({ pageId: 'p1' }))).status).toBe(401)
  })

  it('400 when pageId is missing', async () => {
    expect((await POST(post({}))).status).toBe(400)
  })

  it('403 when the caller is neither owner nor editor', async () => {
    const { resolvePageAccess } = await import('../../../../lib/server/page-access')
    vi.mocked(resolvePageAccess).mockResolvedValueOnce(null)
    expect((await POST(post({ pageId: 'p1' }))).status).toBe(403)
  })

  it('clones under the PAGE OWNER (not the editor) and returns the new page', async () => {
    const res = await POST(post({ pageId: 'p1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, id: 'p2' })
    expect(refs.insertPayloads[0].owner_id).toBe('owner-1') // owner, NOT editor-2
  })

  it('retries past a CROSS-owner slug collision (23505) instead of returning 500', async () => {
    // 'acme-copy' is free within the owner's slugs but held globally by another
    // owner → the unique index rejects it; the route must suffix and retry.
    refs.insertResults = [
      { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "pages_slug_key"' } },
      { data: { id: 'p3', slug: 'acme-copy-2' }, error: null },
    ]
    const res = await POST(post({ pageId: 'p1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, id: 'p3', slug: 'acme-copy-2' })
    expect(refs.insertPayloads.map((p) => p.slug)).toEqual(['acme-copy', 'acme-copy-2'])
  })

  it('gives up with 409 (not 500) when every candidate collides', async () => {
    refs.insertResults = [{ data: null, error: { code: '23505', message: 'duplicate key' } }]
    const res = await POST(post({ pageId: 'p1' }))
    expect(res.status).toBe(409)
    expect(refs.insertPayloads.length).toBe(5) // bounded retry walk
  })

  it('non-collision insert errors still return 500 immediately (no retry)', async () => {
    refs.insertResults = [{ data: null, error: { code: '23514', message: 'check constraint violated' } }]
    const res = await POST(post({ pageId: 'p1' }))
    expect(res.status).toBe(500)
    expect(refs.insertPayloads.length).toBe(1)
  })

  it('requires editor role (passes requireEditor to the resolver)', async () => {
    const { resolvePageAccess } = await import('../../../../lib/server/page-access')
    await POST(post({ pageId: 'p1' }))
    expect(vi.mocked(resolvePageAccess).mock.calls[0][0]).toMatchObject({ requireEditor: true })
  })
})
