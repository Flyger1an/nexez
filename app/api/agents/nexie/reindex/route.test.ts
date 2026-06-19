import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const { authRef, rateRef, adminFlagRef, embedFlagRef, isAdminRef, adminClientRef, embedRef } = vi.hoisted(() => ({
  authRef: { result: null as any },
  rateRef: { response: null as any },
  adminFlagRef: { value: true },
  embedFlagRef: { value: true },
  isAdminRef: { value: true },
  adminClientRef: { pages: [] as any[], updateError: null as any },
  embedRef: { vec: [0.1, 0.2] as number[] | null },
}))

vi.mock('../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => rateRef.response) }))
vi.mock('../../../../../lib/agents/nexie-auth', () => ({ authenticateNexieRequest: vi.fn(async () => authRef.result) }))
vi.mock('../../../../../lib/server/plan', () => ({ isPlatformAdmin: vi.fn(async () => isAdminRef.value) }))
vi.mock('../../../../../lib/agents/semantic-search', () => ({
  isEmbeddingsConfigured: () => embedFlagRef.value,
  embedText: vi.fn(async () => embedRef.vec),
  pageEmbeddingText: () => 'text',
}))
vi.mock('../../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => adminFlagRef.value,
  createAdminClient: () => {
    const chain: any = {}
    for (const m of ['select', 'eq', 'limit', 'update']) chain[m] = () => chain
    chain.returns = () => Promise.resolve({ data: adminClientRef.pages, error: null })
    chain.then = (resolve: any) => resolve({ error: adminClientRef.updateError })
    return { from: () => chain }
  },
}))

import { POST } from './route'

const req = () => new Request('https://nexez.test/api/agents/nexie/reindex', { method: 'POST' }) as any

beforeEach(() => {
  rateRef.response = null
  authRef.result = { ok: true, user: { id: 'admin-1' }, db: {} }
  isAdminRef.value = true
  embedFlagRef.value = true
  adminFlagRef.value = true
  adminClientRef.pages = [{ id: 'p1', slug: 'a' }, { id: 'p2', slug: 'b' }]
  adminClientRef.updateError = null
  embedRef.vec = [0.1, 0.2]
})

describe('POST /api/agents/nexie/reindex', () => {
  it('401s when unauthenticated', async () => {
    authRef.result = { ok: false, response: NextResponse.json({ code: 'auth_required' }, { status: 401 }) }
    expect((await POST(req())).status).toBe(401)
  })

  it('403s for a non-platform-admin', async () => {
    isAdminRef.value = false
    expect((await POST(req())).status).toBe(403)
  })

  it('503s when embeddings are not configured', async () => {
    embedFlagRef.value = false
    expect((await POST(req())).status).toBe(503)
  })

  it('embeds every published page on the happy path', async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, total: 2, embedded: 2, failed: 0 })
  })

  it('counts failures when an embedding can’t be produced', async () => {
    embedRef.vec = null
    expect(await (await POST(req())).json()).toMatchObject({ total: 2, embedded: 0, failed: 2 })
  })
})
