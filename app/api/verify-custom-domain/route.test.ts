import { describe, it, expect, vi, beforeEach } from 'vitest'

const { serverUserRef, adminRef, adminUpdates, accessRef, providerRef } = vi.hoisted(() => ({
  serverUserRef: { user: { id: 'user_1', email: 'owner@acme.com' } as any },
  adminRef: {
    handler: (_ctx: any): { data: any; error: any } => ({ data: null, error: null }),
  },
  adminUpdates: [] as Array<{ table: string; payload: any; eqs: Record<string, any> }>,
  // resolvePageAccess result. Default: the caller IS the owner of page_1.
  accessRef: { value: { pageId: 'page_1', ownerId: 'owner_1', role: 'owner' } as any },
  providerRef: {
    configured: false,
    status: { verificationMethod: 'unknown' } as any,
  },
}))

vi.mock('dns', () => ({ default: { resolveTxt: vi.fn() } }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: () => [] })),
  headers: vi.fn(async () => new Headers({ host: 'app.nexez.ai' })),
}))
// The session client only authenticates the caller now; the plan gate + all owner-scoped
// reads/writes go through the admin (service-role) client below.
vi.mock('../../../utils/supabase/server', async () => {
  const { createSupabaseMock } = await import('../../../test/supabase-mock')
  return {
    createClient: vi.fn(() =>
      createSupabaseMock(() => ({ data: null, error: null }), { user: serverUserRef.user })
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
// The security primitive: authoritatively resolves the page owner from the caller.
vi.mock('../../../lib/server/page-access', () => ({
  resolvePageAccess: vi.fn(async () => accessRef.value),
}))
vi.mock('../../../lib/vercel-domains', () => ({
  isVercelDomainConfigured: vi.fn(() => providerRef.configured),
  getDomainStatus: vi.fn(async () => providerRef.status),
}))

import dns from 'dns'
import { resolvePageAccess } from '../../../lib/server/page-access'
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

// Admin-client responses, scoped to the resolved OWNER id (ownerId), NOT the caller.
function mockOwnerPage(
  ownerId = 'owner_1',
  domain = 'agents.acme.com',
  token = 'nexez-verify-abc123',
  planId = 'launch',
) {
  adminUpdates.length = 0
  adminRef.handler = (ctx) => {
    // Plan gate now reads billing through the admin client, scoped to the owner.
    if (ctx.table === 'billing_subscriptions') {
      return { data: { plan_id: planId, status: 'active' }, error: null }
    }
    if (ctx.table === 'platform_admins') {
      return { data: null, error: null }
    }

    if (ctx.table === 'pages' && ctx.op === 'select') {
      const ownsRequestedPage =
        ctx.eqs.id === 'page_1' &&
        ctx.eqs.owner_id === ownerId &&
        ctx.eqs.custom_domain === domain

      return {
        data: ownsRequestedPage
          ? { id: 'page_1', owner_id: ownerId, custom_domain: domain }
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
    serverUserRef.user = { id: 'user_1', email: 'owner@acme.com' }
    accessRef.value = { pageId: 'page_1', ownerId: 'owner_1', role: 'owner' }
    providerRef.configured = false
    providerRef.status = { verificationMethod: 'unknown' }
    mockOwnerPage()
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
    // Writes are scoped to the resolved OWNER id (owner_1), not the caller (user_1).
    expect(adminUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'pages',
          payload: expect.objectContaining({ custom_domain_verified: expect.any(String) }),
          eqs: expect.objectContaining({ id: 'page_1', owner_id: 'owner_1', custom_domain: 'agents.acme.com' }),
        }),
        expect.objectContaining({
          table: 'page_secrets',
          payload: expect.objectContaining({ domain_verification_token: null }),
          eqs: expect.objectContaining({ page_id: 'page_1', owner_id: 'owner_1' }),
        }),
      ])
    )
  })

  it('returns a retryable conflict when domain allocation is being reconciled', async () => {
    const baseHandler = adminRef.handler
    adminRef.handler = (ctx) => ctx.table === 'pages' && ctx.op === 'update'
      ? { data: null, error: { code: '40001', message: 'NEXEZ_ENTITLEMENT_ALLOCATION_RETRY' } }
      : baseHandler(ctx)
    setTxt([['nexez-verify-abc123']])

    const res = await POST(post({
      pageId: 'page_1',
      customDomain: 'agents.acme.com',
      token: 'nexez-verify-abc123',
    }))

    expect(res.status).toBe(409)
    expect(res.headers.get('retry-after')).toBe('1')
    expect(await res.json()).toMatchObject({ code: 'entitlement_allocation_retry', retryable: true })
  })

  it('rejects the conflicting TXT flow when Vercel identifies a CNAME subdomain', async () => {
    providerRef.configured = true
    providerRef.status = { verificationMethod: 'cname' }

    const res = await POST(post({
      pageId: 'page_1',
      customDomain: 'agents.acme.com',
      token: 'nexez-verify-abc123',
    }))

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({
      verified: false,
      verificationMethod: 'cname',
      code: 'CNAME_VERIFICATION_REQUIRED',
    })
    expect(dns.resolveTxt).not.toHaveBeenCalled()
    expect(adminUpdates).toHaveLength(0)
  })

  it('an editor-collaborator verifies against the OWNER id (not their own)', async () => {
    // Caller user_2 is an editor invited by owner_1; resolvePageAccess returns the owner.
    serverUserRef.user = { id: 'user_2', email: 'editor@partner.com' }
    accessRef.value = { pageId: 'page_1', ownerId: 'owner_1', role: 'editor' }
    setTxt([['nexez-verify-abc123']])

    const res = await POST(post({
      pageId: 'page_1',
      customDomain: 'agents.acme.com',
      token: 'nexez-verify-abc123',
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ verified: true, domain: 'agents.acme.com' })
    // resolvePageAccess was asked for editor access, keyed on the caller's identity.
    expect(vi.mocked(resolvePageAccess)).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: 'page_1', userId: 'user_2', userEmail: 'editor@partner.com', requireEditor: true })
    )
    // The persisted rows are the OWNER's, never the collaborator's id.
    expect(adminUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: 'pages', eqs: expect.objectContaining({ owner_id: 'owner_1' }) }),
      ])
    )
  })

  it('403 when the caller is neither the owner nor an editor (resolvePageAccess null)', async () => {
    serverUserRef.user = { id: 'stranger', email: 'nobody@elsewhere.com' }
    accessRef.value = null
    const res = await POST(post({
      pageId: 'page_1',
      customDomain: 'agents.acme.com',
      token: 'nexez-verify-abc123',
    }))

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'You do not have edit access to this page.' })
    expect(adminUpdates).toHaveLength(0)
  })

  it('402 when the OWNER plan does not include custom domains', async () => {
    mockOwnerPage('owner_1', 'agents.acme.com', 'nexez-verify-abc123', 'free')
    const res = await POST(post({
      pageId: 'page_1',
      customDomain: 'agents.acme.com',
      token: 'nexez-verify-abc123',
    }))

    expect(res.status).toBe(402)
    expect(await res.json()).toMatchObject({ upgrade: 'launch' })
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

  // This route used to check the service-role env BEFORE authenticating, so an
  // anonymous caller got a 503 naming the deployment's configuration. Going through
  // requirePageAccess flipped that to 401, which is the better answer: whether this
  // deployment has domain verification configured is not something to tell someone
  // who has not signed in. Pinned so the order stays a decision, not an accident.
  it('401s an anonymous caller ahead of any configuration check', async () => {
    serverUserRef.user = null
    const admin = await import('../../../utils/supabase/admin')

    const res = await POST(post({ pageId: 'page_1', customDomain: 'agents.acme.com' }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Not authenticated' })
    // Asserting the call never happens proves the ordering without stubbing a
    // return value. An unconsumed mockReturnValueOnce would leak into the next test.
    expect(admin.hasSupabaseAdminEnv).not.toHaveBeenCalled()
  })

  it('403 when the domain is not saved on the owner page', async () => {
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
