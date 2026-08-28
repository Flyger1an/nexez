import { describe, it, expect, vi, beforeEach } from 'vitest'

const { userRef, accessRef, optInRef, ownerAllowsRef } = vi.hoisted(() => ({
  // The session user (collaborator OR owner) loaded from the cookie client.
  userRef: { user: { id: 'user-1', email: 'me@example.com' } as { id: string; email: string } | null },
  // What resolvePageAccess returns for the given pageId.
  accessRef: { fn: (_o: any) => null as any },
  // The owner's page.llm_opt_in (read via the admin client).
  optInRef: { value: true as boolean | undefined },
  // ownerAllows(client, ownerId, feature) → boolean. Capture args to assert the gate
  // is decided against the OWNER, not the logged-in user, and via the admin client.
  ownerAllowsRef: { calls: [] as Array<{ ownerId: any; feature: any }>, value: true },
}))

// Rate limiting has its own dedicated test; keep it a pass-through here.
vi.mock('../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))

// Route awaits cookies() before building the session client - keep it inert.
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))

// Session client: only auth.getUser is exercised here.
vi.mock('../../../../utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: userRef.user } })) },
  })),
}))

vi.mock('../../../../lib/server/page-access', () => ({
  resolvePageAccess: vi.fn((o: any) => accessRef.fn(o)),
}))

const ADMIN_SENTINEL = { __admin: true }
vi.mock('../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: vi.fn(() => ({
    ...ADMIN_SENTINEL,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { llm_opt_in: optInRef.value } }),
        }),
      }),
    }),
  })),
}))

vi.mock('../../../../lib/server/plan', () => ({
  ownerAllows: vi.fn(async (_client: any, ownerId: any, feature: any) => {
    ownerAllowsRef.calls.push({ ownerId, feature })
    return ownerAllowsRef.value
  }),
}))

// LLM is "configured" so the only thing gating the llm path is opt-in + plan.
vi.mock('../../../../lib/llm', () => ({
  isLlmConfigured: vi.fn(() => true),
  llmComplete: vi.fn(async () => 'LLM REWRITE'),
}))

vi.mock('../../../../lib/ai-optimize', () => ({
  enhanceDescriptionForAgents: vi.fn(() => 'DETERMINISTIC REWRITE'),
  rewriteOfferForAgents: vi.fn((offer: any) => ({ ...offer, description: 'OPTIMIZED OFFER' })),
}))

vi.mock('../../../../lib/observability', () => ({ captureError: vi.fn() }))

import { POST } from './route'

const post = (body: unknown) =>
  new Request('https://nexez.app/api/ai/enhance', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/ai/enhance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userRef.user = { id: 'user-1', email: 'me@example.com' }
    accessRef.fn = () => null
    optInRef.value = true
    ownerAllowsRef.calls = []
    ownerAllowsRef.value = true
  })

  it('401 when there is no session user', async () => {
    userRef.user = null
    expect((await POST(post({ description: 'x', pageId: 'p1' }))).status).toBe(401)
  })

  it('400 when description is missing', async () => {
    expect((await POST(post({ pageId: 'p1' }))).status).toBe(400)
  })

  it('owner: gates aiFeatures on the page owner and returns the LLM result', async () => {
    // resolvePageAccess returns the owner themselves.
    accessRef.fn = () => ({ pageId: 'p1', ownerId: 'user-1', role: 'owner' })
    const res = await POST(post({ description: 'hello', pageId: 'p1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ enhanced: 'LLM REWRITE', source: 'llm' })
    // Plan gate decided against the resolved owner id.
    expect(ownerAllowsRef.calls).toEqual([{ ownerId: 'user-1', feature: 'aiFeatures' }])
  })

  it('editor-collaborator: gates + reads against the OWNER id (not the logged-in user)', async () => {
    // Logged-in collaborator is user-1; page is owned by owner-9.
    accessRef.fn = () => ({ pageId: 'p1', ownerId: 'owner-9', role: 'editor' })
    const res = await POST(post({ description: 'hello', pageId: 'p1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ enhanced: 'LLM REWRITE', source: 'llm' })
    // The AI plan gate is checked against the OWNER, never the collaborator.
    expect(ownerAllowsRef.calls).toEqual([{ ownerId: 'owner-9', feature: 'aiFeatures' }])
  })

  it('stranger: resolvePageAccess null → 403, never touches the plan gate', async () => {
    accessRef.fn = () => null
    const res = await POST(post({ description: 'hello', pageId: 'p1' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'You do not have edit access to this listing.' })
    expect(ownerAllowsRef.calls).toEqual([])
  })

  it('503 when admin env is unavailable (pageId path requires service role)', async () => {
    const admin = await import('../../../../utils/supabase/admin')
    ;(admin.hasSupabaseAdminEnv as any).mockReturnValueOnce(false)
    const res = await POST(post({ description: 'hello', pageId: 'p1' }))
    expect(res.status).toBe(503)
  })

  it('owner allowed but page NOT opted in → deterministic fallback (no LLM)', async () => {
    accessRef.fn = () => ({ pageId: 'p1', ownerId: 'user-1', role: 'owner' })
    optInRef.value = false
    const res = await POST(post({ description: 'hello', pageId: 'p1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ enhanced: 'DETERMINISTIC REWRITE', source: 'deterministic' })
  })

  it('entitled owner receives a deterministic fallback when the configured LLM fails', async () => {
    accessRef.fn = () => ({ pageId: 'p1', ownerId: 'user-1', role: 'owner' })
    const llm = await import('../../../../lib/llm')
    ;(llm.llmComplete as any).mockRejectedValueOnce(new Error('provider unavailable'))
    const res = await POST(post({ description: 'hello', pageId: 'p1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ enhanced: 'DETERMINISTIC REWRITE', source: 'deterministic' })
  })

  it('opted in but owner plan does NOT allow aiFeatures → 402 with no rewrite', async () => {
    accessRef.fn = () => ({ pageId: 'p1', ownerId: 'owner-9', role: 'editor' })
    ownerAllowsRef.value = false
    const res = await POST(post({ description: 'hello', pageId: 'p1' }))
    expect(res.status).toBe(402)
    expect(await res.json()).toMatchObject({ code: 'plan_upgrade_required' })
    const optimize = await import('../../../../lib/ai-optimize')
    expect(optimize.enhanceDescriptionForAgents).not.toHaveBeenCalled()
  })

  it.each(['enhance_offers', 'optimize_offers'] as const)(
    'stale editor entitlement receives 402 before the %s bulk transform',
    async (operation) => {
      accessRef.fn = () => ({ pageId: 'p1', ownerId: 'owner-9', role: 'editor' })
      ownerAllowsRef.value = false

      const res = await POST(post({
        operation,
        offers: [{ name: 'Audit', description: 'Original copy' }],
        pageId: 'p1',
      }))

      expect(res.status).toBe(402)
      expect(await res.json()).toMatchObject({ code: 'plan_upgrade_required' })
      const optimize = await import('../../../../lib/ai-optimize')
      expect(optimize.enhanceDescriptionForAgents).not.toHaveBeenCalled()
      expect(optimize.rewriteOfferForAgents).not.toHaveBeenCalled()
    },
  )

  it('runs entitled bulk offer transforms only after the owner gate', async () => {
    accessRef.fn = () => ({ pageId: 'p1', ownerId: 'owner-9', role: 'editor' })

    const res = await POST(post({
      operation: 'optimize_offers',
      offers: [{ name: 'Audit', description: 'Original copy' }],
      pageId: 'p1',
    }))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      source: 'deterministic',
      offers: [{ name: 'Audit', description: 'OPTIMIZED OFFER' }],
    })
    expect(ownerAllowsRef.calls).toEqual([{ ownerId: 'owner-9', feature: 'aiFeatures' }])
  })

  it('legacy self-gate: no pageId → gates on the logged-in entitled user, deterministic (no opt-in source)', async () => {
    const res = await POST(post({ description: 'hello' }))
    expect(res.status).toBe(200)
    // No page → no opt-in → LLM never fires; deterministic path.
    expect(await res.json()).toMatchObject({ enhanced: 'DETERMINISTIC REWRITE', source: 'deterministic' })
    // Gate still evaluated, on the logged-in user.
    expect(ownerAllowsRef.calls).toEqual([{ ownerId: 'user-1', feature: 'aiFeatures' }])
    // resolvePageAccess must NOT be consulted when no pageId is provided.
    const pa = await import('../../../../lib/server/page-access')
    expect(pa.resolvePageAccess).not.toHaveBeenCalled()
  })

  it('legacy self-gate: Free receives 402 and no deterministic rewrite', async () => {
    ownerAllowsRef.value = false
    const res = await POST(post({ description: 'hello' }))
    expect(res.status).toBe(402)
    expect(await res.json()).toMatchObject({ code: 'plan_upgrade_required' })
  })
})
