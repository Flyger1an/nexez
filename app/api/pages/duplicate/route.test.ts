import { describe, it, expect, vi, beforeEach } from 'vitest'

const refs = vi.hoisted(() => ({
  user: { id: 'editor-2', email: 'mate@x.com' } as any,
  access: { pageId: 'p1', ownerId: 'owner-1', role: 'editor' } as any,
  source: { id: 'p1', name: 'Acme', slug: 'acme' } as any,
  owned: [{ slug: 'acme' }] as any[],
  inserted: { data: { id: 'p2', slug: 'acme-copy' }, error: null } as any,
  insertPayload: null as any,
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
  buildDuplicatePayload: (page: any, ownerId: string) => ({ owner_id: ownerId, name: `${page.name} (Copy)` }),
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
        refs.insertPayload = payload
        return { select: () => ({ single: async () => refs.inserted }) }
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
    refs.inserted = { data: { id: 'p2', slug: 'acme-copy' }, error: null }
    refs.insertPayload = null
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
    expect(refs.insertPayload.owner_id).toBe('owner-1') // owner, NOT editor-2
  })

  it('requires editor role (passes requireEditor to the resolver)', async () => {
    const { resolvePageAccess } = await import('../../../../lib/server/page-access')
    await POST(post({ pageId: 'p1' }))
    expect(vi.mocked(resolvePageAccess).mock.calls[0][0]).toMatchObject({ requireEditor: true })
  })
})
