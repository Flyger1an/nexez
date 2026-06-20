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

import { POST } from './route'
import { createClient } from '../../../utils/supabase/server'

function wire(user: any = refs.user) {
  vi.mocked(createClient).mockReturnValue(
    createSupabaseMock((ctx: QueryContext) => {
      if (ctx.table === 'storefronts') {
        refs.captured = ctx
        return refs.result
      }
      return { data: null, error: null }
    }, { user }) as any,
  )
}
const post = (body: unknown) =>
  new Request('https://app.nexez.ai/api/storefront', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('POST /api/storefront', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.result = { data: { handle: 'acme' }, error: null }
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

  it('normalizes the handle + scopes the upsert to the auth user', async () => {
    wire()
    const res = await POST(post({ handle: 'My Store!!', display_name: 'Acme', accent_color: 'red' }))
    expect(res.status).toBe(200)
    expect(refs.captured!.op).toBe('upsert')
    expect(refs.captured!.payload.handle).toBe('my-store')
    expect(refs.captured!.payload.owner_id).toBe('owner-1') // never client-supplied
    expect(refs.captured!.payload.accent_color).toBeNull() // non-hex rejected
  })

  it('409 when the handle is already taken (unique violation)', async () => {
    refs.result = { data: null, error: { code: '23505', message: 'duplicate key' } }
    wire()
    expect((await POST(post({ handle: 'taken' }))).status).toBe(409)
  })
})
