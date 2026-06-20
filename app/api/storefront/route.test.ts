import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../test/supabase-mock'

const refs = vi.hoisted(() => ({
  user: { id: 'owner-1', email: 'o@x.com' } as any,
  result: { data: { handle: 'acme' }, error: null } as any,
  captured: null as QueryContext | null,
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../utils/supabase/server', () => ({ createClient: vi.fn() }))

import { POST, PATCH } from './route'
import { createClient } from '../../../utils/supabase/server'

function wire(user: any = refs.user) {
  vi.mocked(createClient).mockReturnValue(
    createSupabaseMock((ctx: QueryContext) => {
      // Capture the mutating call (insert/update on storefronts or pages); the cap-count
      // SELECT on storefronts is a head query we let pass through with no count.
      if ((ctx.table === 'storefronts' || ctx.table === 'pages') && ctx.op !== 'select') {
        refs.captured = ctx
      }
      if (ctx.table === 'storefronts' || ctx.table === 'pages') return refs.result
      return { data: null, error: null }
    }, { user }) as any,
  )
}
const post = (body: unknown) =>
  new Request('https://app.nexez.ai/api/storefront', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const patch = (body: unknown) =>
  new Request('https://app.nexez.ai/api/storefront', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('POST /api/storefront', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.result = { data: { id: 'sf-1', handle: 'acme' }, error: null }
    refs.captured = null
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

  it('409 when the handle is already taken (unique violation)', async () => {
    refs.result = { data: null, error: { code: '23505', message: 'duplicate key' } }
    wire()
    expect((await POST(post({ handle: 'taken' }))).status).toBe(409)
  })
})

describe('PATCH /api/storefront (assign listing → storefront)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.result = { data: { id: 'page-1', storefront_id: 'sf-2' }, error: null }
    refs.captured = null
  })

  it('moves a listing to a storefront', async () => {
    wire()
    const res = await PATCH(patch({ pageId: 'page-1', storefrontId: 'sf-2' }))
    expect(res.status).toBe(200)
    expect(refs.captured!.table).toBe('pages')
    expect(refs.captured!.payload.storefront_id).toBe('sf-2')
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
