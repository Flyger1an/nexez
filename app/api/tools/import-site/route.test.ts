import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mutable refs so each test can steer auth, plan-gating, and access resolution.
const { userRef, accessRef, ownerAllowsRef, analyzeRef } = vi.hoisted(() => ({
  userRef: { user: { id: 'logged-in-user', email: 'editor@example.com' } as any },
  // resolvePageAccess: by default the page's own owner. Tests override per-case.
  accessRef: { fn: (_opts: any) => null as any },
  // ownerAllows: records (clientTag, ownerId) so we can prove WHO got gated.
  ownerAllowsRef: {
    fn: (_client: any, _ownerId: string | null | undefined, _f: string) => true as boolean,
    calls: [] as Array<{ clientTag: string; ownerId: string | null | undefined; feature: string }>,
  },
  analyzeRef: { skipLlm: undefined as boolean | undefined },
}))

// Session client (createClient(cookies)) - only auth.getUser() is exercised here.
// `from` returns a tagged client so we can tell the SESSION client apart from ADMIN.
vi.mock('../../../../utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    __tag: 'session',
    auth: { getUser: vi.fn(async () => ({ data: { user: userRef.user } })) },
  })),
}))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({})) }))

vi.mock('../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: vi.fn(() => ({ __tag: 'admin' })),
}))

vi.mock('../../../../lib/server/page-access', () => ({
  resolvePageAccess: vi.fn((opts: any) => accessRef.fn(opts)),
}))

vi.mock('../../../../lib/server/plan', () => ({
  ownerAllows: vi.fn(async (client: any, ownerId: any, feature: any) => {
    ownerAllowsRef.calls.push({ clientTag: client?.__tag ?? 'unknown', ownerId, feature })
    return ownerAllowsRef.fn(client, ownerId, feature)
  }),
}))

// LLM stays off by default so the deterministic path is what's exercised; tests
// that care about the AI branch can flip isLlmConfigured.
const llmConfiguredRef = { value: false }
vi.mock('../../../../lib/llm', () => ({
  isLlmConfigured: vi.fn(() => llmConfiguredRef.value),
  llmComplete: vi.fn(async () => 'memory note'),
}))

vi.mock('../../../../lib/observability', () => ({ captureError: vi.fn() }))

// analyzeSite is the heavy importer - stub it and capture the skipLlm option.
const importResult = {
  title: 'Acme',
  description: 'desc',
  website_url: 'https://acme.test',
  servicesText: 'svc',
  industry: 'retail',
  logo_url: null,
  audience: 'buyers',
  location: 'NYC',
  cta_url: 'https://acme.test/buy',
  cta_label: 'Buy',
  faqs: [],
  structuredOffers: [],
  pagesAnalyzed: 3,
  confidence: 0.9,
  reviewNotes: [],
  sources: [],
  clarifyingQuestions: [],
  readiness: {},
  aiStatus: { used: false },
}
vi.mock('../../../../lib/importer', () => ({
  analyzeSite: vi.fn(async (_url: string, _guidance: any, opts: any) => {
    analyzeRef.skipLlm = opts?.skipLlm
    return importResult
  }),
}))

import { POST } from './route'

const post = (body: unknown) =>
  new Request('https://nexez.app/api/tools/import-site', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/tools/import-site', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userRef.user = { id: 'logged-in-user', email: 'editor@example.com' }
    accessRef.fn = () => null
    ownerAllowsRef.fn = () => true
    ownerAllowsRef.calls = []
    analyzeRef.skipLlm = undefined
    llmConfiguredRef.value = false
  })

  it('401 when there is no session user', async () => {
    userRef.user = null
    expect((await POST(post({ url: 'https://acme.test' }))).status).toBe(401)
  })

  it('400 when the url is missing', async () => {
    expect((await POST(post({}))).status).toBe(400)
  })

  // --- Legacy self-gate (no pageId) ---------------------------------------

  it('no pageId: gates aiFeatures on the LOGGED-IN user via the session client', async () => {
    const res = await POST(post({ url: 'https://acme.test' }))
    expect(res.status).toBe(200)
    // The plan gate ran against the logged-in user, with the SESSION client.
    expect(ownerAllowsRef.calls).toEqual([
      { clientTag: 'session', ownerId: 'logged-in-user', feature: 'aiFeatures' },
    ])
    // resolvePageAccess must NOT be consulted on the legacy path.
    const { resolvePageAccess } = await import('../../../../lib/server/page-access')
    expect(resolvePageAccess).not.toHaveBeenCalled()
  })

  it('no pageId + plan denies aiFeatures: runs the deterministic crawl (skipLlm=true)', async () => {
    ownerAllowsRef.fn = () => false
    const res = await POST(post({ url: 'https://acme.test' }))
    expect(res.status).toBe(200)
    expect(analyzeRef.skipLlm).toBe(true)
  })

  // --- Collaboration path (pageId present) --------------------------------

  it('owner: works and gates aiFeatures on the OWNER via the admin client', async () => {
    // Page owner is the logged-in user → resolvePageAccess returns role owner.
    accessRef.fn = () => ({ pageId: 'page-1', ownerId: 'logged-in-user', role: 'owner' })
    const res = await POST(post({ url: 'https://acme.test', pageId: 'page-1' }))
    expect(res.status).toBe(200)
    expect(ownerAllowsRef.calls).toEqual([
      { clientTag: 'admin', ownerId: 'logged-in-user', feature: 'aiFeatures' },
    ])
  })

  it('editor-collaborator: works against the OWNER id (gate uses owner, not caller)', async () => {
    // Caller is a different user; resolvePageAccess grants editor and returns the
    // PAGE OWNER's id, which is who the plan gate must run against.
    userRef.user = { id: 'collab-user', email: 'editor@example.com' }
    accessRef.fn = () => ({ pageId: 'page-1', ownerId: 'owner-9', role: 'editor' })
    const res = await POST(post({ url: 'https://acme.test', pageId: 'page-1' }))
    expect(res.status).toBe(200)
    expect(ownerAllowsRef.calls).toEqual([
      { clientTag: 'admin', ownerId: 'owner-9', feature: 'aiFeatures' },
    ])
    // requireEditor must be asserted to keep viewers out.
    const { resolvePageAccess } = await import('../../../../lib/server/page-access')
    expect(resolvePageAccess).toHaveBeenCalledWith({
      pageId: 'page-1',
      userId: 'collab-user',
      userEmail: 'editor@example.com',
      requireEditor: true,
    })
  })

  it('editor-collaborator on an OWNER without aiFeatures: deterministic crawl only', async () => {
    userRef.user = { id: 'collab-user', email: 'editor@example.com' }
    accessRef.fn = () => ({ pageId: 'page-1', ownerId: 'free-owner', role: 'editor' })
    ownerAllowsRef.fn = () => false
    const res = await POST(post({ url: 'https://acme.test', pageId: 'page-1' }))
    expect(res.status).toBe(200)
    expect(analyzeRef.skipLlm).toBe(true)
  })

  it('stranger (resolvePageAccess null): 403 and never gates a plan', async () => {
    accessRef.fn = () => null
    const res = await POST(post({ url: 'https://acme.test', pageId: 'page-1' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({
      error: 'You do not have edit access to this listing.',
    })
    expect(ownerAllowsRef.calls).toEqual([])
  })

  it('503 when pageId is present but admin env is unavailable', async () => {
    const { hasSupabaseAdminEnv } = await import('../../../../utils/supabase/admin')
    ;(hasSupabaseAdminEnv as any).mockReturnValueOnce(false)
    const res = await POST(post({ url: 'https://acme.test', pageId: 'page-1' }))
    expect(res.status).toBe(503)
    // Never falls through to a plan gate when the env is missing.
    expect(ownerAllowsRef.calls).toEqual([])
  })

  it('empty-string pageId is treated as absent → legacy self-gate, no 403', async () => {
    accessRef.fn = () => null // would 403 if the collab path were taken
    const res = await POST(post({ url: 'https://acme.test', pageId: '   ' }))
    expect(res.status).toBe(200)
    expect(ownerAllowsRef.calls).toEqual([
      { clientTag: 'session', ownerId: 'logged-in-user', feature: 'aiFeatures' },
    ])
  })
})
