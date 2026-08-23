import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../test/supabase-mock'

const refs = vi.hoisted(() => ({
  user: { id: 'owner-1', email: 'o@x.com' } as any,
  result: { data: { handle: 'acme' }, error: null } as any,
  captured: null as QueryContext | null,
  count: 0,
  plan: 'free' as 'free' | 'launch' | 'pro' | 'scale' | 'enterprise',
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('../../../lib/server/plan', () => ({ getOwnerPlanId: vi.fn(async () => refs.plan) }))

import { DELETE, POST, PATCH } from './route'
import { createClient } from '../../../utils/supabase/server'

function wire(user: any = refs.user) {
  vi.mocked(createClient).mockReturnValue(
    createSupabaseMock((ctx: QueryContext) => {
      // Capture the mutating call (insert/update on storefronts or pages); the cap-count
      // SELECT on storefronts is a head query we let pass through with no count.
      if ((ctx.table === 'storefronts' || ctx.table === 'pages') && ctx.op !== 'select') {
        refs.captured = ctx
      }
      if (ctx.table === 'storefronts' && ctx.op === 'select') return { data: null, error: null, count: refs.count }
      if (ctx.table === 'storefronts' || ctx.table === 'pages') return refs.result
      return { data: null, error: null }
    }, { user }) as any,
  )
}
const post = (body: unknown) =>
  new Request('https://app.nexez.ai/api/storefront', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const patch = (body: unknown) =>
  new Request('https://app.nexez.ai/api/storefront', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const del = (body: unknown) =>
  new Request('https://app.nexez.ai/api/storefront', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('POST /api/storefront', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.result = { data: { id: 'sf-1', handle: 'acme' }, error: null }
    refs.captured = null
    refs.count = 0
    refs.plan = 'free'
  })

  it('401 when not authenticated', async () => {
    wire(null)
    expect((await POST(post({ handle: 'acme' }))).status).toBe(401)
  })

  it('400 when the handle normalizes to empty', async () => {
    wire()
    expect((await POST(post({ handle: '!!!' }))).status).toBe(400)
  })

  it('creates a NEW storefront (no id): normalized handle, owner from auth, hex-only accent', async () => {
    wire()
    const res = await POST(post({ handle: 'My Store!!', display_name: 'Acme', accent_color: 'red' }))
    expect(res.status).toBe(200)
    expect(refs.captured!.op).toBe('insert')
    expect(refs.captured!.payload.handle).toBe('my-store')
    expect(refs.captured!.payload.owner_id).toBe('owner-1') // never client-supplied
    expect(refs.captured!.payload.accent_color).toBeNull() // non-hex rejected
  })

  it('updates an existing storefront by id (no owner_id in the patch)', async () => {
    wire()
    const res = await POST(post({ id: 'sf-1', handle: 'Renamed', display_name: 'Acme 2' }))
    expect(res.status).toBe(200)
    expect(refs.captured!.op).toBe('update')
    expect(refs.captured!.payload.handle).toBe('renamed')
    expect(refs.captured!.payload.owner_id).toBeUndefined() // RLS scopes it; never reassigned
  })

  it('rejects paid storefront branding below Launch while allowing explicit cleanup', async () => {
    wire()
    const blocked = await POST(post({ id: 'sf-1', handle: 'acme', logo_url: 'https://cdn.example/logo.svg' }))
    expect(blocked.status).toBe(402)
    expect(await blocked.json()).toMatchObject({ code: 'plan_feature_required', upgrade: 'launch' })
    expect(refs.captured).toBeNull()

    const cleared = await POST(post({ id: 'sf-1', handle: 'acme', logo_url: '', accent_color: '' }))
    expect(cleared.status).toBe(200)
    expect(refs.captured!.payload).toMatchObject({ logo_url: null, accent_color: null })
  })

  it('allows storefront logo and accent customization on Launch and above', async () => {
    refs.plan = 'launch'
    wire()
    const res = await POST(post({ id: 'sf-1', handle: 'acme', logo_url: 'https://cdn.example/logo.svg', accent_color: '#ff6a33' }))
    expect(res.status).toBe(200)
    expect(refs.captured!.payload).toMatchObject({
      logo_url: 'https://cdn.example/logo.svg',
      accent_color: '#ff6a33',
    })
  })

  it('409 when the handle is already taken (unique violation)', async () => {
    refs.result = { data: null, error: { code: '23505', message: 'duplicate key' } }
    wire()
    expect((await POST(post({ handle: 'taken' }))).status).toBe(409)
  })

  it('402s at the plan storefront limit and chooses the first plan with enough capacity', async () => {
    refs.count = 1
    refs.plan = 'free'
    wire()
    const res = await POST(post({ handle: 'second-store' }))
    expect(res.status).toBe(402)
    expect(await res.json()).toMatchObject({ code: 'plan_limit_reached', limit: 1, upgrade: 'pro' })

    refs.count = 3
    refs.plan = 'pro'
    wire()
    const proRes = await POST(post({ handle: 'fourth-store' }))
    expect(proRes.status).toBe(402)
    expect(await proRes.json()).toMatchObject({ limit: 3, upgrade: 'scale' })
  })

  it('maps the serialized database quota trigger to a plan-limit response', async () => {
    refs.result = { data: null, error: { code: '23514', message: 'Storefront limit reached for your plan.' } }
    wire()
    const res = await POST(post({ handle: 'racing-store' }))
    expect(res.status).toBe(402)
    expect(await res.json()).toMatchObject({ code: 'plan_limit_reached' })
  })

  it('maps allocation lock contention to a retryable conflict before plan-limit handling', async () => {
    refs.result = { data: null, error: { code: '40001', message: 'NEXEZ_ENTITLEMENT_ALLOCATION_RETRY' } }
    wire()
    const res = await POST(post({ handle: 'racing-store' }))
    expect(res.status).toBe(409)
    expect(res.headers.get('retry-after')).toBe('1')
    expect(await res.json()).toMatchObject({ code: 'entitlement_allocation_retry', retryable: true })
  })
})

describe('DELETE /api/storefront', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.result = { data: { id: 'sf-1' }, error: null }
    refs.captured = null
  })

  it('removes only an authenticated owner-scoped storefront', async () => {
    wire()
    const res = await DELETE(del({ id: 'sf-1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, id: 'sf-1' })
    expect(refs.captured).toMatchObject({ table: 'storefronts', op: 'delete' })
    expect(refs.captured!.eqs).toMatchObject({ owner_id: 'owner-1', id: 'sf-1' })
  })

  it('does not disclose or delete another owner’s storefront', async () => {
    refs.result = { data: null, error: null }
    wire()
    expect((await DELETE(del({ id: 'sf-other' }))).status).toBe(404)
  })
})

describe('PATCH /api/storefront (assign listing → storefront)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.result = { data: { id: 'page-1', storefront_id: 'sf-2' }, error: null }
    refs.captured = null
  })

  it('moves only the authenticated owner\'s listing to a storefront', async () => {
    wire()
    const res = await PATCH(patch({ pageId: 'page-1', storefrontId: 'sf-2' }))
    expect(res.status).toBe(200)
    expect(refs.captured!.table).toBe('pages')
    expect(refs.captured!.payload.storefront_id).toBe('sf-2')
    expect(refs.captured!.eqs).toMatchObject({ id: 'page-1', owner_id: 'owner-1' })
  })

  it('400 when pageId or storefrontId is missing', async () => {
    wire()
    expect((await PATCH(patch({ pageId: 'page-1' }))).status).toBe(400)
  })

  it('403 when the storefront isn’t the caller’s (trigger raises 42501)', async () => {
    refs.result = { data: null, error: { code: '42501', message: 'not owner' } }
    wire()
    expect((await PATCH(patch({ pageId: 'page-1', storefrontId: 'sf-x' }))).status).toBe(403)
  })
})
