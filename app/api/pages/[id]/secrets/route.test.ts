import { describe, it, expect, vi, beforeEach } from 'vitest'

const refs = vi.hoisted(() => ({
  user: { id: 'editor-2', email: 'mate@x.com' } as any,
  access: { pageId: 'p1', ownerId: 'owner-1', role: 'editor' } as any,
  upsertArg: null as any,
  upsertError: null as any,
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../../utils/supabase/server', () => ({
  createClient: vi.fn(() => ({ auth: { getUser: async () => ({ data: { user: refs.user } }) } })),
}))
vi.mock('../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../../lib/server/page-access', () => ({ resolvePageAccess: vi.fn(async () => refs.access) }))
vi.mock('../../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: vi.fn(() => ({
    from: () => ({ upsert: (arg: any) => { refs.upsertArg = arg; return Promise.resolve({ error: refs.upsertError }) } }),
  })),
}))

import { POST } from './route'

const post = (body: unknown) =>
  new Request('https://app.nexez.ai/api/pages/p1/secrets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
const params = Promise.resolve({ id: 'p1' })

describe('POST /api/pages/[id]/secrets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.user = { id: 'editor-2', email: 'mate@x.com' }
    refs.access = { pageId: 'p1', ownerId: 'owner-1', role: 'editor' }
    refs.upsertArg = null
    refs.upsertError = null
  })

  it('401 unauth / 403 stranger', async () => {
    refs.user = null
    expect((await POST(post({ domain_verification_token: 't' }), { params })).status).toBe(401)
    refs.user = { id: 'x', email: 'x@x.com' }
    const { resolvePageAccess } = await import('../../../../../lib/server/page-access')
    vi.mocked(resolvePageAccess).mockResolvedValueOnce(null)
    expect((await POST(post({ domain_verification_token: 't' }), { params })).status).toBe(403)
  })

  it('400 when no whitelisted fields are present', async () => {
    expect((await POST(post({ nonsense: 1 }), { params })).status).toBe(400)
  })

  it('upserts ONLY whitelisted keys, under the PAGE OWNER, ignoring client owner_id/page_id', async () => {
    const res = await POST(
      post({ domain_verification_token: 'tok', outbound_webhooks: [{ url: 'u' }], owner_id: 'attacker', page_id: 'evil', evil: 'x' }),
      { params },
    )
    expect(res.status).toBe(200)
    expect(refs.upsertArg).toMatchObject({ page_id: 'p1', owner_id: 'owner-1', domain_verification_token: 'tok', outbound_webhooks: [{ url: 'u' }] })
    expect(refs.upsertArg.owner_id).toBe('owner-1') // NOT the client-supplied 'attacker'
    expect(refs.upsertArg.page_id).toBe('p1') // NOT 'evil'
    expect('evil' in refs.upsertArg).toBe(false)
  })

  it('500 when the upsert fails', async () => {
    refs.upsertError = { message: 'boom' }
    expect((await POST(post({ domain_verification_token: 't' }), { params })).status).toBe(500)
  })
})
