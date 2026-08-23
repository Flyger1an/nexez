import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../../../test/supabase-mock'

vi.mock('../../../../lib/server/api-auth', () => ({ authenticateApiKey: vi.fn() }))
vi.mock('../../../../utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { GET, POST } from './route'
import { authenticateApiKey } from '../../../../lib/server/api-auth'
import { createAdminClient } from '../../../../utils/supabase/admin'

const getReq = () =>
  new Request('https://nexez.test/api/v1/pages', { headers: { authorization: 'Bearer nxz_live_x' } })
const postReq = (body: unknown) =>
  new Request('https://nexez.test/api/v1/pages', {
    method: 'POST',
    headers: { authorization: 'Bearer nxz_live_x', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('/api/v1/pages', () => {
  beforeEach(() => vi.clearAllMocks())

  it('GET → 401 without a valid API key', async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({ ok: false, error: 'no key', status: 401 })
    expect((await GET(getReq())).status).toBe(401)
  })

  it('GET → returns only the caller’s pages (tenancy: filters by owner_id)', async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({ ok: true, ownerId: 'owner-A', keyId: 'k1' })
    let filteredOwner: unknown
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock((ctx) => {
        filteredOwner = ctx.eqs.owner_id
        return { data: [{ id: 'p1', owner_id: 'owner-A' }] }
      }) as any,
    )
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    expect((await res.json()).pages).toHaveLength(1)
    expect(filteredOwner).toBe('owner-A') // scoped to the authenticated owner
  })

  it('POST → 400 when name is missing', async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({ ok: true, ownerId: 'o1', keyId: 'k1' })
    vi.mocked(createAdminClient).mockReturnValue(createSupabaseMock(() => ({ data: null })) as any)
    expect((await POST(postReq({}))).status).toBe(400)
  })

  it('POST → creates a draft owned by the caller (owner_id forced, is_published defaults false)', async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({ ok: true, ownerId: 'owner-A', keyId: 'k1' })
    let insertPayload: any
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock((ctx) => {
        if (ctx.op === 'select') return { data: null } // uniqueSlug: slug is free
        if (ctx.op === 'insert') {
          insertPayload = ctx.payload
          return { data: { id: 'p1', ...ctx.payload } }
        }
        return { data: null }
      }) as any,
    )
    const res = await POST(postReq({ name: 'My Page', is_published: true && false }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(insertPayload.owner_id).toBe('owner-A')
    expect(insertPayload.is_published).toBe(false)
    expect(body.page.owner_id).toBe('owner-A')
    expect(body.url).toContain('/')
  })

  it('POST → caller cannot create a page for another owner', async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({ ok: true, ownerId: 'owner-A', keyId: 'k1' })
    let insertPayload: any
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock((ctx) => {
        if (ctx.op === 'select') return { data: null }
        if (ctx.op === 'insert') {
          insertPayload = ctx.payload
          return { data: { id: 'p1', ...ctx.payload } }
        }
        return { data: null }
      }) as any,
    )
    await POST(postReq({ name: 'Sneaky', owner_id: 'owner-B' }))
    expect(insertPayload.owner_id).toBe('owner-A') // body owner_id ignored
  })

  it('POST → exposes a contended entitlement allocation as retryable, not as a plan limit', async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({ ok: true, ownerId: 'owner-A', keyId: 'k1' })
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock((ctx) => ctx.op === 'insert'
        ? { data: null, error: { code: '40001', message: 'NEXEZ_ENTITLEMENT_ALLOCATION_RETRY' } }
        : { data: null, error: null }) as any,
    )

    const res = await POST(postReq({ name: 'Racing page', is_published: true }))
    expect(res.status).toBe(409)
    expect(res.headers.get('retry-after')).toBe('1')
    expect(await res.json()).toMatchObject({ code: 'entitlement_allocation_retry', retryable: true })
  })
})
