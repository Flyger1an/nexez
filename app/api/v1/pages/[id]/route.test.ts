import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../../../../test/supabase-mock'

vi.mock('../../../../../lib/server/api-auth', () => ({ authenticateApiKey: vi.fn() }))
vi.mock('../../../../../utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { GET, PATCH } from './route'
import { authenticateApiKey } from '../../../../../lib/server/api-auth'
import { createAdminClient } from '../../../../../utils/supabase/admin'

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (body?: unknown) =>
  new Request('https://nexez.test/api/v1/pages/p1', {
    method: body ? 'PATCH' : 'GET',
    headers: { authorization: 'Bearer nxz_live_x', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

describe('/api/v1/pages/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('GET → 401 without a valid key', async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({ ok: false, error: 'x', status: 401 })
    expect((await GET(req(), ctx('p1'))).status).toBe(401)
  })

  it('GET → scopes by id AND owner_id, 404s a page the caller does not own', async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({ ok: true, ownerId: 'owner-A', keyId: 'k' })
    let eqs: Record<string, any> = {}
    vi.mocked(createAdminClient).mockReturnValue(createSupabaseMock((c) => ((eqs = c.eqs), { data: null })) as any)
    const res = await GET(req(), ctx('p1'))
    expect(res.status).toBe(404)
    expect(eqs.id).toBe('p1')
    expect(eqs.owner_id).toBe('owner-A')
  })

  it('GET → returns the owned page', async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({ ok: true, ownerId: 'owner-A', keyId: 'k' })
    vi.mocked(createAdminClient).mockReturnValue(createSupabaseMock(() => ({ data: { id: 'p1', owner_id: 'owner-A', slug: 'x' } })) as any)
    const res = await GET(req(), ctx('p1'))
    expect(res.status).toBe(200)
    expect((await res.json()).page.id).toBe('p1')
  })

  it('PATCH → 400 when no writable fields are supplied', async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({ ok: true, ownerId: 'owner-A', keyId: 'k' })
    vi.mocked(createAdminClient).mockReturnValue(createSupabaseMock(() => ({ data: null })) as any)
    expect((await PATCH(req({ not_a_field: 1 }), ctx('p1'))).status).toBe(400)
  })

  it('PATCH → scopes the update to the owner (cannot touch another tenant)', async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({ ok: true, ownerId: 'owner-A', keyId: 'k' })
    let eqs: Record<string, any> = {}
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock((c) => {
        if (c.op === 'update') {
          eqs = c.eqs
          return { data: { id: 'p1', owner_id: 'owner-A', slug: 'renamed' } }
        }
        return { data: null }
      }) as any,
    )
    const res = await PATCH(req({ name: 'Renamed' }), ctx('p1'))
    expect(res.status).toBe(200)
    expect(eqs.id).toBe('p1')
    expect(eqs.owner_id).toBe('owner-A')
  })
})
