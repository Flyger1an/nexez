import { describe, it, expect, vi, beforeEach } from 'vitest'

const { serverUserRef, adminRef, adminWrites, accessRef, pageRef, tokenRef, safeFetchRef } = vi.hoisted(() => ({
  serverUserRef: { user: { id: 'user_1', email: 'owner@acme.com' } as any },
  adminRef: { handler: (_ctx: any): { data: any; error: any } => ({ data: null, error: null }) },
  adminWrites: [] as Array<{ table: string; op: string; payload: any; eqs: Record<string, any> }>,
  accessRef: { value: { pageId: 'page_1', ownerId: 'owner_1', role: 'owner' } as any },
  pageRef: { value: { id: 'page_1', owner_id: 'owner_1', website_url: 'https://acme.com' } as any },
  tokenRef: { value: 'nexez-site-verify-abcdef0123456789' as string | null },
  safeFetchRef: { html: '' as string | null },
}))

vi.mock('dns', () => ({ default: { resolveTxt: vi.fn() } }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: () => [] })),
  headers: vi.fn(async () => new Headers({ host: 'app.nexez.ai' })),
}))
vi.mock('../../../../../utils/supabase/server', async () => {
  const { createSupabaseMock } = await import('../../../../../test/supabase-mock')
  return { createClient: vi.fn(() => createSupabaseMock(() => ({ data: null, error: null }), { user: serverUserRef.user })) }
})
vi.mock('../../../../../utils/supabase/admin', async () => {
  const { createSupabaseMock } = await import('../../../../../test/supabase-mock')
  return {
    hasSupabaseAdminEnv: vi.fn(() => true),
    createAdminClient: vi.fn(() =>
      createSupabaseMock((ctx: any) => {
        if (ctx.op !== 'select') adminWrites.push({ table: ctx.table, op: ctx.op, payload: ctx.payload, eqs: { ...ctx.eqs } })
        return adminRef.handler(ctx)
      }),
    ),
  }
})
vi.mock('../../../../../lib/server/page-access', () => ({ resolvePageAccess: vi.fn(async () => accessRef.value) }))
vi.mock('../../../../../lib/importer', () => ({
  getImportUrlError: () => null,
  getResolvedImportUrlError: async () => null,
  safeFetch: async () => (safeFetchRef.html == null ? null : ({ ok: true, status: 200, body: null, text: async () => safeFetchRef.html })),
}))
vi.mock('../../../../../lib/observability', () => ({ captureEvent: vi.fn() }))

import dns from 'dns'
import { POST } from './route'

const ctx = { params: Promise.resolve({ id: 'page_1' }) }
const post = (body: unknown) =>
  new Request('https://nexez.test/api/pages/page_1/verify-website', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any

const setTxt = (records: string[][] | null, err?: Error) =>
  vi.mocked(dns.resolveTxt).mockImplementation(((_host: string, cb: any) => (err ? cb(err) : cb(null, records))) as any)

// Default admin handler: page load returns pageRef, token load returns tokenRef, writes ok.
function defaultAdmin(citCtx: any) {
  if (citCtx.table === 'pages' && citCtx.op === 'select') return { data: pageRef.value, error: null }
  if (citCtx.table === 'page_secrets' && citCtx.op === 'select') return { data: { website_verification_token: tokenRef.value }, error: null }
  return { data: null, error: null }
}

describe('POST /api/pages/[id]/verify-website', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    adminWrites.length = 0
    accessRef.value = { pageId: 'page_1', ownerId: 'owner_1', role: 'owner' }
    pageRef.value = { id: 'page_1', owner_id: 'owner_1', website_url: 'https://acme.com' }
    tokenRef.value = 'nexez-site-verify-abcdef0123456789'
    safeFetchRef.html = ''
    adminRef.handler = defaultAdmin
  })

  it('401 when unauthenticated', async () => {
    serverUserRef.user = null
    const res = await POST(post({ method: 'dns' }), ctx)
    expect(res.status).toBe(401)
    serverUserRef.user = { id: 'user_1', email: 'owner@acme.com' }
  })

  it('403 when the caller has no edit access', async () => {
    accessRef.value = null
    expect((await POST(post({ method: 'dns' }), ctx)).status).toBe(403)
  })

  it('400 on an unknown method', async () => {
    expect((await POST(post({ method: 'carrier-pigeon' }), ctx)).status).toBe(400)
  })

  it('400 when the listing has no website_url', async () => {
    pageRef.value = { id: 'page_1', owner_id: 'owner_1', website_url: null }
    expect((await POST(post({ method: 'dns' }), ctx)).status).toBe(400)
  })

  it('400 when no verification token has been generated', async () => {
    tokenRef.value = null
    expect((await POST(post({ method: 'dns' }), ctx)).status).toBe(400)
  })

  it('does NOT plan-gate: a free-plan owner can verify (no 402, ownerAllows never consulted)', async () => {
    setTxt([['nexez-site-verify-abcdef0123456789']])
    const res = await POST(post({ method: 'dns' }), ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).verified).toBe(true)
  })

  it('DNS match writes website_verified_at (owner-scoped) + clears the token', async () => {
    setTxt([['nexez-site-verify-abcdef0123456789']])
    const res = await POST(post({ method: 'dns' }), ctx)
    const json = await res.json()
    expect(json).toMatchObject({ verified: true, method: 'dns', host: 'acme.com' })
    const pageWrite = adminWrites.find((w) => w.table === 'pages' && w.op === 'update')
    expect(pageWrite?.payload).toMatchObject({ website_verified_method: 'dns' })
    expect(pageWrite?.payload.website_verified_at).toBeTruthy()
    expect(pageWrite?.eqs).toMatchObject({ id: 'page_1', owner_id: 'owner_1' }) // owner-scoped
    const tokenWrite = adminWrites.find((w) => w.table === 'page_secrets' && w.op === 'update')
    expect(tokenWrite?.payload.website_verification_token).toBeNull()
  })

  it('meta match verifies via the fetched homepage', async () => {
    safeFetchRef.html = '<html><head><meta name="nexez-site-verification" content="nexez-site-verify-abcdef0123456789"></head></html>'
    const res = await POST(post({ method: 'meta' }), ctx)
    expect((await res.json()).verified).toBe(true)
  })

  it('mismatch → 200 verified:false and ZERO writes', async () => {
    setTxt([['some-other-value']])
    const res = await POST(post({ method: 'dns' }), ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).verified).toBe(false)
    expect(adminWrites.filter((w) => w.op === 'update')).toHaveLength(0)
  })

  it('rejects verifying a Nexez first-party host', async () => {
    pageRef.value = { id: 'page_1', owner_id: 'owner_1', website_url: 'https://app.nexez.ai' }
    expect((await POST(post({ method: 'dns' }), ctx)).status).toBe(400)
  })
})
