import { describe, it, expect, vi, beforeEach } from 'vitest'

const { serverUserRef, adminRef, adminUpdates } = vi.hoisted(() => ({
  serverUserRef: { user: { id: 'user_1' } as any },
  adminRef: {
    handler: (_ctx: any): { data: any; error: any } => ({ data: null, error: null }),
  },
  adminUpdates: [] as Array<{ table: string; payload: any; eqs: Record<string, any> }>,
}))

vi.mock('dns', () => ({ default: { resolveTxt: vi.fn() } }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: () => [] })),
  headers: vi.fn(async () => new Headers({ host: 'app.nexez.ai' })),
}))
vi.mock('../../../utils/supabase/server', async () => {
  const { createSupabaseMock } = await import('../../../test/supabase-mock')
  return {
    createClient: vi.fn(() =>
      createSupabaseMock(
        (ctx: { table?: string }) =>
          ctx.table === 'billing_subscriptions'
            ? { data: { plan_id: 'launch', status: 'active' }, error: null }
            : { data: null, error: null },
        { user: serverUserRef.user },
      )
    ),
  }
})
vi.mock('../../../utils/supabase/admin', async () => {
  const { createSupabaseMock } = await import('../../../test/supabase-mock')
  return {
    hasSupabaseAdminEnv: vi.fn(() => true),
    createAdminClient: vi.fn(() => createSupabaseMock((ctx) => adminRef.handler(ctx))),
  }
})

import dns from 'dns'
import { POST } from './route'

const post = (body: unknown) =>
  new Request('https://nexez.test/api/verify-custom-domain', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any

// resolveTxt is callback-style; promisify(dns.resolveTxt) wraps the mock.
const setTxt = (records: string[][] | null, err?: Error) =>
  vi.mocked(dns.resolveTxt).mockImplementation(((_host: string, cb: any) =>
    err ? cb(err) : cb(null, records)) as any)

function mockOwnedPage(domain = 'agents.acme.com', token = 'nexez-verify-abc123') {
  adminUpdates.length = 0
  adminRef.handler = (ctx) => {
    if (ctx.table === 'pages' && ctx.op === 'select') {
      const ownsRequestedPage =
        ctx.eqs.id === 'page_1' &&
        ctx.eqs.owner_id === 'user_1' &&
        ctx.eqs.custom_domain === domain

      return {
        data: ownsRequestedPage
          ? { id: 'page_1', owner_id: 'user_1', custom_domain: domain }
          : null,
        error: null,
      }
    }

    if (ctx.table === 'page_secrets' && ctx.op === 'select') {
      return { data: { domain_verification_token: token }, error: null }
    }

    if (ctx.op === 'update') {
      adminUpdates.push({ table: ctx.table, payload: ctx.payload, eqs: ctx.eqs })
      return { data: null, error: null }
    }

    return { data: null, error: null }
  }
}

describe('POST /api/verify-custom-domain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serverUserRef.user = { id: 'user_1' }
    mockOwnedPage()
  })

  it('400 when customDomain or pageId is missing', async () => {
    expect((await POST(post({}))).status).toBe(400)
    expect((await POST(post({ customDomain: 'agents.acme.com' }))).status).toBe(400)
  })

  it('verified:true when the TXT record exactly matches the saved token', async () => {
    setTxt([['nexez-verify-abc123']])
    const body = await (await POST(post({
      pageId: 'page_1',
      customDomain: 'agents.acme.com',
      token: 'nexez-verify-abc123',
    }))).json()

    expect(body).toMatchObject({ verified: true, domain: 'agents.acme.com' })
    expect(adminUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'pages',
          payload: expect.objectContaining({ custom_domain_verified: expect.any(String) }),
          eqs: expect.objectContaining({ id: 'page_1', owner_id: 'user_1', custom_domain: 'agents.acme.com' }),
        }),
        expect.objectContaining({
          table: 'page_secrets',
          payload: expect.objectContaining({ domain_verification_token: null }),
          eqs: expect.objectContaining({ page_id: 'page_1', owner_id: 'user_1' }),
        }),
      ])
    )
  })

  it('verified:false (200) when the TXT record does not match', async () => {
    setTxt([['some-other-value']])
    const res = await POST(post({
      pageId: 'page_1',
      customDomain: 'agents.acme.com',
      token: 'nexez-verify-abc123',
    }))

    expect(res.status).toBe(200)
    expect((await res.json()).verified).toBe(false)
    expect(adminUpdates).toHaveLength(0)
  })

  it('verified:false (200) with a graceful error when DNS lookup fails', async () => {
    setTxt(null, Object.assign(new Error('not found'), { code: 'ENOTFOUND' }))
    const res = await POST(post({
      pageId: 'page_1',
      customDomain: 'agents.acme.com',
      token: 'nexez-verify-abc123',
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.verified).toBe(false)
    expect(body.error).toBeTruthy()
    expect(adminUpdates).toHaveLength(0)
  })

  it('strips protocol and rejects too-short domains', async () => {
    setTxt([['nexez-verify-abc123']])
    const body = await (await POST(post({
      pageId: 'page_1',
      customDomain: 'https://agents.acme.com',
      token: 'nexez-verify-abc123',
    }))).json()

    expect(body.domain).toBe('agents.acme.com')
    expect((await POST(post({ pageId: 'page_1', customDomain: 'ab', token: 'x' }))).status).toBe(400)
  })

  it('401 when the user is not signed in', async () => {
    serverUserRef.user = null

    expect((await POST(post({ pageId: 'page_1', customDomain: 'agents.acme.com' }))).status).toBe(401)
  })

  it('403 when the domain is not saved on a page owned by the user', async () => {
    const res = await POST(post({
      pageId: 'page_1',
      customDomain: 'different.acme.com',
      token: 'nexez-verify-abc123',
    }))

    expect(res.status).toBe(403)
  })

  it('400 when the supplied token differs from the saved page token', async () => {
    const res = await POST(post({
      pageId: 'page_1',
      customDomain: 'agents.acme.com',
      token: 'nexez-verify-wrong',
    }))

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      error: 'Verification token does not match the saved token for this page.',
    })
  })
})
