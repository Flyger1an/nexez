import { describe, it, expect, vi, beforeEach } from 'vitest'

// Collaboration conversion test for POST /api/custom-domain.
// - The page that uses a domain is found with the ADMIN (service-role) client by
//   `custom_domain` only (never an owner_id from the client).
// - resolvePageAccess authorizes the caller as the page OWNER or a non-revoked EDITOR;
//   a stranger (null) gets 403.
// - The plan gate + owner-scoped reads run against access.ownerId via the admin client.

const { userRef, resolveRef, adminRef } = vi.hoisted(() => ({
  // Logged-in session user (may be the owner OR an editor-collaborator).
  userRef: { user: { id: 'owner-1', email: 'owner@example.com' } as { id: string; email: string } | null },
  // resolvePageAccess result: owner | editor | null(stranger).
  resolveRef: { fn: (_opts: any) => ({ pageId: 'page-1', ownerId: 'owner-1', role: 'owner' }) as any },
  // Tunable admin-client query results.
  adminRef: {
    domainPages: [{ id: 'page-1', custom_domain: 'acme.com', custom_domain_verified: null }] as any[],
    platformAdmin: null as any,
    subscription: null as any,
    ownedPages: [] as any[],
  },
}))

// Session client: only auth.getUser is used.
vi.mock('../../../utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: userRef.user } })) },
  })),
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({})) }))

// Authoritative authorization primitive — fully mocked here (it has its own test).
vi.mock('../../../lib/server/page-access', () => ({
  resolvePageAccess: vi.fn((opts: any) => Promise.resolve(resolveRef.fn(opts))),
}))

// Admin (service-role) client. A tiny chainable builder whose terminal resolves
// depend on which table was queried.
vi.mock('../../../utils/supabase/admin', () => {
  // A tiny chainable query builder. Two `pages` reads exist: the domain lookup
  // (.eq('custom_domain', ...).returns -> domainPages) and the owned-domains count on
  // attach (.not(...).neq(...).returns -> ownedPages). Disambiguate by whether a
  // `.not`/`.neq` filter was applied (the owned-count query) vs the domain `.eq`.
  const makeBuilder = (table: string, state: { isOwnedQuery: boolean }) => {
    const builder: any = {
      select: () => builder,
      eq: (col: string) => {
        if (col === 'custom_domain') state.isOwnedQuery = false
        return builder
      },
      neq: () => {
        state.isOwnedQuery = true
        return builder
      },
      not: () => {
        state.isOwnedQuery = true
        return builder
      },
      order: () => builder,
      limit: () => builder,
      returns: () =>
        Promise.resolve({
          data: state.isOwnedQuery ? adminRef.ownedPages : adminRef.domainPages,
          error: null,
        }),
      maybeSingle: () =>
        Promise.resolve({
          data: table === 'platform_admins' ? adminRef.platformAdmin : adminRef.subscription,
          error: null,
        }),
    }
    return builder
  }
  return {
    hasSupabaseAdminEnv: vi.fn(() => true),
    createAdminClient: vi.fn(() => ({
      from: (table: string) => makeBuilder(table, { isOwnedQuery: false }),
    })),
  }
})

// Keep Vercel unconfigured so the route exercises auth/access/plan only (no network).
vi.mock('../../../lib/vercel-domains', () => ({
  isVercelDomainConfigured: vi.fn(() => false),
  addDomainToProject: vi.fn(async () => ({ attached: false, verified: false, misconfigured: false, requiredRecords: [] })),
  getDomainStatus: vi.fn(async () => ({ attached: false, verified: false, misconfigured: false, requiredRecords: [] })),
  removeDomainFromProject: vi.fn(async () => ({ ok: true })),
  deriveDomainState: vi.fn(() => ({ state: 'pending_dns', label: 'Pending DNS', detail: 'Point your DNS.' })),
}))

import { POST } from './route'
import { resolvePageAccess } from '../../../lib/server/page-access'

const post = (body: unknown) =>
  new Request('https://nexez.app/api/custom-domain', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/custom-domain (collaborator-aware)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userRef.user = { id: 'owner-1', email: 'owner@example.com' }
    resolveRef.fn = () => ({ pageId: 'page-1', ownerId: 'owner-1', role: 'owner' })
    adminRef.domainPages = [{ id: 'page-1', custom_domain: 'acme.com', custom_domain_verified: null }]
    adminRef.platformAdmin = null
    adminRef.subscription = null
    adminRef.ownedPages = []
  })

  it('401 when there is no session user', async () => {
    userRef.user = null
    expect((await POST(post({ action: 'status', domain: 'acme.com' }))).status).toBe(401)
  })

  it('400 on a missing/short domain', async () => {
    expect((await POST(post({ action: 'status', domain: '' }))).status).toBe(400)
  })

  it('403 when no page uses the domain', async () => {
    adminRef.domainPages = []
    const res = await POST(post({ action: 'status', domain: 'acme.com' }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/No page you own uses this domain/)
  })

  it('the owner still works (status)', async () => {
    const res = await POST(post({ action: 'status', domain: 'acme.com' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, domain: 'acme.com' })
  })

  it('an editor-collaborator now works against the OWNER id', async () => {
    // Logged-in user is the collaborator, not the owner; resolvePageAccess returns the
    // page OWNER with role editor.
    userRef.user = { id: 'editor-9', email: 'editor@example.com' }
    resolveRef.fn = () => ({ pageId: 'page-1', ownerId: 'owner-1', role: 'editor' })
    const res = await POST(post({ action: 'status', domain: 'acme.com' }))
    expect(res.status).toBe(200)
    // The page id resolved by domain was authorized, not an owner_id from the client.
    expect(resolvePageAccess).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: 'page-1', userId: 'editor-9', userEmail: 'editor@example.com', requireEditor: true }),
    )
  })

  it('a stranger (resolvePageAccess null) gets 403', async () => {
    userRef.user = { id: 'stranger-7', email: 'stranger@example.com' }
    resolveRef.fn = () => null
    const res = await POST(post({ action: 'status', domain: 'acme.com' }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/do not have edit access/)
  })

  it('503 when admin env is unavailable', async () => {
    const admin = await import('../../../utils/supabase/admin')
    ;(admin.hasSupabaseAdminEnv as any).mockReturnValueOnce(false)
    const res = await POST(post({ action: 'status', domain: 'acme.com' }))
    expect(res.status).toBe(503)
  })

  it('attach is plan-gated on the OWNER: 402 when the owner is on Free', async () => {
    // Collaborator on a Free owner — gate must read the OWNER plan, not the caller.
    userRef.user = { id: 'editor-9', email: 'editor@example.com' }
    resolveRef.fn = () => ({ pageId: 'page-1', ownerId: 'owner-1', role: 'editor' })
    adminRef.subscription = null // owner has no live subscription -> free
    const res = await POST(post({ action: 'attach', domain: 'acme.com' }))
    expect(res.status).toBe(402)
    expect((await res.json()).upgrade).toBe('launch')
  })

  it('attach succeeds when the OWNER plan allows custom domains', async () => {
    adminRef.subscription = { plan_id: 'pro', status: 'active' }
    const res = await POST(post({ action: 'attach', domain: 'acme.com' }))
    expect(res.status).toBe(200)
  })

  it('attach enforces the OWNER plan custom-domain COUNT (402 at the cap)', async () => {
    // Launch allows custom domains but caps the count at 1; the owner already has one
    // other distinct domain, so a second attach is blocked.
    adminRef.subscription = { plan_id: 'launch', status: 'active' }
    adminRef.ownedPages = [{ custom_domain: 'other.com' }]
    const res = await POST(post({ action: 'attach', domain: 'acme.com' }))
    expect(res.status).toBe(402)
    expect((await res.json()).upgrade).toBe('pro')
  })
})
