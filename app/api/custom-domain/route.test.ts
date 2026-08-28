import { describe, it, expect, vi, beforeEach } from 'vitest'

// Collaboration conversion test for POST /api/custom-domain.
// - The page that uses a domain is found with the ADMIN (service-role) client by
//   `custom_domain` only (never an owner_id from the client).
// - resolvePageAccess authorizes the caller as the page OWNER or a non-revoked EDITOR;
//   a stranger (null) gets 403.
// - The plan gate + owner-scoped reads run against access.ownerId via the admin client.

const { userRef, resolveRef, adminRef, providerRef, legacyRef, cnameRef } = vi.hoisted(() => ({
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
    updates: [] as Array<{ table: string; payload: any; eqs: Record<string, any> }>,
    updateError: null as any,
    updateNoMatch: false,
    claim: [{ domain: 'acme.com', claimed_at: '2026-08-01T00:00:00Z', expires_at: '2026-08-15T00:00:00Z', verified_at: null, owned: true, available: false }] as any,
    claimError: null as any,
  },
  providerRef: {
    configured: false,
    status: {
      attached: false,
      verified: false,
      configChecked: false,
      misconfigured: null,
      configuredBy: null,
      verificationMethod: 'unknown',
      requiredRecords: [],
      recommendedCNAME: [],
      recommendedIPv4: [],
    } as any,
  },
  legacyRef: { present: false },
  cnameRef: { present: true },
}))

// Session client: only auth.getUser is used.
vi.mock('../../../utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: userRef.user } })) },
  })),
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({})) }))

// Authoritative authorization primitive - fully mocked here (it has its own test).
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
  const makeBuilder = (
    table: string,
    state: { isOwnedQuery: boolean; op: 'select' | 'update'; payload?: any; eqs: Record<string, any> },
  ) => {
    const resolve = () => {
      if (state.op === 'update') {
        adminRef.updates.push({ table, payload: state.payload, eqs: state.eqs })
        return Promise.resolve({ data: null, error: adminRef.updateError })
      }
      if (table === 'pages') {
        return Promise.resolve({ data: state.isOwnedQuery ? adminRef.ownedPages : adminRef.domainPages, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    }
    const builder: any = {
      select: () => builder,
      update: (payload: any) => {
        state.op = 'update'
        state.payload = payload
        return builder
      },
      eq: (col: string, value: any) => {
        state.eqs[col] = value
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
      lte: () => builder,
      gt: () => builder,
      returns: () => resolve(),
      maybeSingle: () => {
        if (state.op === 'update') {
          adminRef.updates.push({ table, payload: state.payload, eqs: state.eqs })
          return Promise.resolve({
            data: adminRef.updateNoMatch ? null : { id: state.eqs.id || 'page-1' },
            error: adminRef.updateError,
          })
        }
        return Promise.resolve({
          data:
            table === 'platform_admins'
              ? adminRef.platformAdmin
              : table === 'promotional_plan_grants'
                ? null
                : adminRef.subscription,
          error: null,
        })
      },
      then: (onFulfilled: any, onRejected: any) => resolve().then(onFulfilled, onRejected),
    }
    return builder
  }
  return {
    hasSupabaseAdminEnv: vi.fn(() => true),
    createAdminClient: vi.fn(() => ({
      rpc: vi.fn(async () => ({ data: adminRef.claim, error: adminRef.claimError })),
      from: (table: string) => makeBuilder(table, { isOwnedQuery: false, op: 'select', eqs: {} }),
    })),
  }
})

vi.mock('../../../lib/vercel-domains', () => ({
  isVercelDomainConfigured: vi.fn(() => providerRef.configured),
  addDomainToProject: vi.fn(async () => providerRef.status),
  getDomainStatus: vi.fn(async () => providerRef.status),
  removeDomainFromProject: vi.fn(async () => ({ ok: true })),
  isCnameProviderProof: vi.fn((status: any, cnameConfigured: boolean) =>
    Boolean(
      status.attached &&
        status.verified &&
        status.configChecked &&
        status.misconfigured === false &&
        status.verificationMethod === 'cname' &&
        cnameConfigured &&
        !status.error,
    ),
  ),
  deriveDomainState: vi.fn((input: any) => ({
    state: input.ownershipVerified && input.verificationMethod === 'cname' ? 'live' : 'pending_dns',
    label: input.ownershipVerified ? 'Live' : 'Pending DNS',
    detail: input.ownershipVerified ? 'Live.' : 'Point your DNS.',
  })),
}))

vi.mock('../../../lib/server/doubled-txt-probe', () => ({
  hasLegacyCustomDomainTxt: vi.fn(async () => legacyRef.present),
}))

vi.mock('../../../lib/server/cname-probe', () => ({
  hasExpectedCname: vi.fn(async () => cnameRef.present),
}))

import { POST } from './route'
import { resolvePageAccess } from '../../../lib/server/page-access'

const post = (body: unknown) =>
  new Request('https://nexez.app/api/custom-domain', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const cnameStatus = (overrides: Record<string, unknown> = {}) => ({
  attached: true,
  verified: true,
  configChecked: true,
  misconfigured: false,
  configuredBy: 'CNAME',
  apexName: 'acme.com',
  verificationMethod: 'cname',
  requiredRecords: [],
  recommendedCNAME: ['project.vercel-dns-017.com'],
  recommendedIPv4: [],
  ...overrides,
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
    adminRef.updates = []
    adminRef.updateError = null
    adminRef.updateNoMatch = false
    adminRef.claim = [{ domain: 'acme.com', claimed_at: '2026-08-01T00:00:00Z', expires_at: '2026-08-15T00:00:00Z', verified_at: null, owned: true, available: false }]
    adminRef.claimError = null
    providerRef.configured = false
    providerRef.status = {
      attached: false,
      verified: false,
      configChecked: false,
      misconfigured: null,
      configuredBy: null,
      verificationMethod: 'unknown',
      requiredRecords: [],
      recommendedCNAME: [],
      recommendedIPv4: [],
    }
    legacyRef.present = false
    cnameRef.present = true
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
    expect((await res.json()).error).toMatch(/No listing you own uses this domain/)
  })

  it('the owner still works (status)', async () => {
    const res = await POST(post({ action: 'status', domain: 'acme.com' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      ok: true,
      domain: 'acme.com',
      claim: { domain: 'acme.com', owned: true },
    })
  })

  it('returns the claim lifecycle without contacting the provider', async () => {
    providerRef.configured = true
    const provider = await import('../../../lib/vercel-domains')

    const res = await POST(post({ action: 'claim', domain: 'acme.com', pageId: 'page-1' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ claim: { owned: true, expiresAt: '2026-08-15T00:00:00Z' } })
    expect(provider.getDomainStatus).not.toHaveBeenCalled()
    expect(provider.addDomainToProject).not.toHaveBeenCalled()
  })

  it('fails closed when canonical claim status cannot be checked', async () => {
    adminRef.claimError = { message: 'rpc unavailable' }
    const res = await POST(post({ action: 'status', domain: 'acme.com', pageId: 'page-1' }))
    expect(res.status).toBe(503)
  })

  it('blocks attach and status after another owner reclaims the domain', async () => {
    adminRef.claim = [{ domain: 'acme.com', claimed_at: '2026-08-16T00:00:00Z', expires_at: '2026-08-30T00:00:00Z', verified_at: null, owned: false, available: false }]

    const res = await POST(post({ action: 'status', domain: 'acme.com', pageId: 'page-1' }))

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'custom_domain_claim_lost', claim: { owned: false } })
  })

  it('distinguishes a released domain from a claim held by another account', async () => {
    adminRef.claim = [{ domain: 'acme.com', claimed_at: null, expires_at: null, verified_at: null, owned: false, available: true }]

    const res = await POST(post({ action: 'status', domain: 'acme.com', pageId: 'page-1' }))

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'custom_domain_claim_available', claim: { available: true } })
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
    // Collaborator on a Free owner - gate must read the OWNER plan, not the caller.
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

  it('persists CNAME-backed verification only after the complete provider proof', async () => {
    providerRef.configured = true
    providerRef.status = cnameStatus()
    adminRef.subscription = { plan_id: 'pro', status: 'active' }
    adminRef.domainPages = [{ id: 'page-1', custom_domain: 'agents.acme.com', custom_domain_verified: null }]

    const res = await POST(post({ action: 'status', domain: 'agents.acme.com', pageId: 'page-1' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      ownershipVerified: true,
      verificationMethod: 'cname',
      state: 'live',
      routingRecords: [{ type: 'CNAME', name: 'agents.acme.com', value: 'cname.nexez.app' }],
    })
    expect(adminRef.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'pages',
          payload: expect.objectContaining({ custom_domain_verified: expect.any(String) }),
          eqs: expect.objectContaining({ id: 'page-1', owner_id: 'owner-1', custom_domain: 'agents.acme.com' }),
        }),
        expect.objectContaining({
          table: 'page_secrets',
          payload: expect.objectContaining({ domain_verification_token: null }),
          eqs: expect.objectContaining({ page_id: 'page-1', owner_id: 'owner-1' }),
        }),
      ]),
    )
  })

  it('does not let a status check activate CNAME routing below the custom-domain plan', async () => {
    providerRef.configured = true
    providerRef.status = cnameStatus()
    adminRef.subscription = null
    adminRef.domainPages = [{ id: 'page-1', custom_domain: 'agents.acme.com', custom_domain_verified: null }]

    const res = await POST(post({ action: 'status', domain: 'agents.acme.com', pageId: 'page-1' }))

    expect(res.status).toBe(402)
    expect(await res.json()).toMatchObject({ code: 'plan_feature_required', upgrade: 'launch' })
    expect(adminRef.updates).toHaveLength(0)
  })

  it('maps the serialized database quota race to the next viable plan', async () => {
    providerRef.configured = true
    providerRef.status = cnameStatus()
    adminRef.subscription = { plan_id: 'launch', status: 'active' }
    adminRef.domainPages = [{ id: 'page-1', custom_domain: 'agents.acme.com', custom_domain_verified: null }]
    adminRef.updateError = { code: '23514', message: 'Verified custom-domain limit reached for your plan.' }

    const res = await POST(post({ action: 'attach', domain: 'agents.acme.com', pageId: 'page-1' }))

    expect(res.status).toBe(402)
    expect(await res.json()).toMatchObject({ code: 'plan_limit_reached', upgrade: 'pro' })
  })

  it('maps a contended domain allocation to a retryable conflict', async () => {
    providerRef.configured = true
    providerRef.status = cnameStatus()
    adminRef.subscription = { plan_id: 'launch', status: 'active' }
    adminRef.domainPages = [{ id: 'page-1', custom_domain: 'agents.acme.com', custom_domain_verified: null }]
    adminRef.updateError = { code: '40001', message: 'NEXEZ_ENTITLEMENT_ALLOCATION_RETRY' }

    const res = await POST(post({ action: 'attach', domain: 'agents.acme.com', pageId: 'page-1' }))

    expect(res.status).toBe(409)
    expect(res.headers.get('retry-after')).toBe('1')
    expect(await res.json()).toMatchObject({ code: 'entitlement_allocation_retry', retryable: true })
  })

  it('never persists verification when the provider configuration check failed', async () => {
    providerRef.configured = true
    providerRef.status = cnameStatus({ configChecked: false, misconfigured: null, error: 'config unavailable' })
    adminRef.domainPages = [{ id: 'page-1', custom_domain: 'agents.acme.com', custom_domain_verified: null }]

    const body = await (await POST(post({ action: 'status', domain: 'agents.acme.com', pageId: 'page-1' }))).json()

    expect(body.ownershipVerified).toBe(false)
    expect(adminRef.updates).toHaveLength(0)
  })

  it('never persists verification when DNS does not publish the requested CNAME', async () => {
    providerRef.configured = true
    providerRef.status = cnameStatus({ configuredBy: 'http' })
    cnameRef.present = false
    adminRef.domainPages = [{ id: 'page-1', custom_domain: 'agents.acme.com', custom_domain_verified: null }]

    const body = await (await POST(post({ action: 'status', domain: 'agents.acme.com', pageId: 'page-1' }))).json()

    expect(body.ownershipVerified).toBe(false)
    expect(body.provider.cnameConfigured).toBe(false)
    expect(adminRef.updates).toHaveLength(0)
  })

  it('keeps apex ownership on the TXT path even when its A record is configured', async () => {
    providerRef.configured = true
    providerRef.status = cnameStatus({
      configuredBy: 'A',
      apexName: 'acme.com',
      verificationMethod: 'txt',
      recommendedCNAME: [],
      recommendedIPv4: ['76.76.21.21'],
    })

    const body = await (await POST(post({ action: 'status', domain: 'acme.com', pageId: 'page-1' }))).json()

    expect(body).toMatchObject({
      ownershipVerified: false,
      verificationMethod: 'txt',
      routingRecords: [{ type: 'A', name: 'acme.com', value: '76.76.21.21' }],
    })
    expect(adminRef.updates).toHaveLength(0)
  })

  it('reports a legacy Nexez TXT record that blocks a pending CNAME', async () => {
    providerRef.configured = true
    providerRef.status = cnameStatus({ misconfigured: true })
    legacyRef.present = true
    adminRef.domainPages = [{ id: 'page-1', custom_domain: 'agents.acme.com', custom_domain_verified: null }]

    const body = await (await POST(post({ action: 'status', domain: 'agents.acme.com', pageId: 'page-1' }))).json()

    expect(body.legacyTxtBlocksCname).toBe(true)
    expect(adminRef.updates).toHaveLength(0)
  })

  it('clears the saved hostname and verification after a successful provider detach', async () => {
    providerRef.configured = true
    adminRef.domainPages = [{ id: 'page-1', custom_domain: 'agents.acme.com', custom_domain_verified: '2026-08-13T00:00:00Z' }]

    const res = await POST(post({ action: 'remove', domain: 'agents.acme.com', pageId: 'page-1' }))

    expect(res.status).toBe(200)
    expect(adminRef.updates).toContainEqual(
      expect.objectContaining({
        table: 'pages',
        payload: { custom_domain: null, custom_domain_verified: null, domain_path: '/' },
        eqs: expect.objectContaining({ id: 'page-1', owner_id: 'owner-1', custom_domain: 'agents.acme.com' }),
      }),
    )
  })

  it('clears a stale page without detaching the new owner provider configuration', async () => {
    providerRef.configured = true
    adminRef.claim = [{ domain: 'agents.acme.com', claimed_at: '2026-08-16T00:00:00Z', expires_at: '2026-08-30T00:00:00Z', verified_at: null, owned: false, available: false }]
    adminRef.domainPages = [{ id: 'page-1', custom_domain: 'agents.acme.com', custom_domain_verified: null }]
    const provider = await import('../../../lib/vercel-domains')

    const res = await POST(post({ action: 'remove', domain: 'agents.acme.com', pageId: 'page-1' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ staleClaimRemoved: true, providerDetached: false })
    expect(provider.removeDomainFromProject).not.toHaveBeenCalled()
  })

  it('retains the provider attachment while another listing path uses the domain', async () => {
    providerRef.configured = true
    adminRef.domainPages = [
      { id: 'page-1', custom_domain: 'agents.acme.com', custom_domain_verified: '2026-08-13T00:00:00Z' },
      { id: 'page-2', custom_domain: 'agents.acme.com', custom_domain_verified: '2026-08-13T00:00:00Z' },
    ]
    adminRef.claim = [{ domain: 'agents.acme.com', claimed_at: '2026-08-01T00:00:00Z', expires_at: '2026-08-15T00:00:00Z', verified_at: '2026-08-13T00:00:00Z', owned: true, available: false }]
    const provider = await import('../../../lib/vercel-domains')

    const res = await POST(post({ action: 'remove', domain: 'agents.acme.com', pageId: 'page-1' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ sharedDomainRetained: true, providerDetached: false })
    expect(provider.removeDomainFromProject).not.toHaveBeenCalled()
  })

  it('keeps cleanup available below plan even when managed hosting is not configured', async () => {
    providerRef.configured = false
    adminRef.subscription = null
    adminRef.domainPages = [{ id: 'page-1', custom_domain: 'agents.acme.com', custom_domain_verified: '2026-08-13T00:00:00Z' }]

    const res = await POST(post({ action: 'remove', domain: 'agents.acme.com', pageId: 'page-1' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, removed: true, providerConfigured: false })
    expect(adminRef.updates).toContainEqual(
      expect.objectContaining({
        table: 'pages',
        payload: { custom_domain: null, custom_domain_verified: null, domain_path: '/' },
      }),
    )
  })
})
