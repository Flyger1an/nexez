import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mutable refs so each test can swap behavior without re-mocking the module.
const { authRef, accessRef, planRef, pageRef, llmRef } = vi.hoisted(() => ({
  authRef: { user: { id: 'caller-1', email: 'caller@example.com' } as { id: string; email: string } | null },
  accessRef: { fn: (_o: any) => null as any },
  planRef: { allow: true },
  pageRef: {
    row: {
      name: 'Acme',
      description: 'desc',
      audience: 'buyers',
      services: [{ name: 'Logo' }],
      products: null,
      llm_opt_in: true,
    } as Record<string, unknown> | null,
  },
  llmRef: { configured: true, complete: 'a note' },
}))

// Rate limiting has its own dedicated test; keep it a pass-through here.
vi.mock('../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))

// Session client: only used to load the authed user.
vi.mock('../../../../utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: authRef.user } })) },
  })),
}))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({})) }))

// Admin client: owner-scoped page read goes through here.
vi.mock('../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: pageRef.row }),
          }),
        }),
      }),
    }),
  })),
}))

// THE authorization primitive - stubbed to model owner / editor / stranger.
vi.mock('../../../../lib/server/page-access', () => ({
  resolvePageAccess: vi.fn((o: any) => accessRef.fn(o)),
}))

// Plan gate runs on the OWNER via ownerAllows(admin, ownerId, 'aiFeatures').
vi.mock('../../../../lib/server/plan', () => ({
  ownerAllows: vi.fn(async (_client: any, _ownerId: string, _feature: string) => planRef.allow),
}))

vi.mock('../../../../lib/llm', () => ({
  isLlmConfigured: vi.fn(() => llmRef.configured),
  llmComplete: vi.fn(async () => llmRef.complete),
}))
vi.mock('../../../../lib/observability', () => ({ captureError: vi.fn() }))

import { POST } from './route'
import { resolvePageAccess } from '../../../../lib/server/page-access'
import { ownerAllows } from '../../../../lib/server/plan'

const post = (body: unknown) =>
  new Request('https://nexez.app/api/ai/suggest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/ai/suggest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRef.user = { id: 'caller-1', email: 'caller@example.com' }
    accessRef.fn = () => ({ pageId: 'p1', ownerId: 'owner-1', role: 'owner' })
    planRef.allow = true
    pageRef.row = {
      name: 'Acme',
      description: 'desc',
      audience: 'buyers',
      services: [{ name: 'Logo' }],
      products: null,
      llm_opt_in: true,
    }
    llmRef.configured = true
    llmRef.complete = 'a note'
  })

  it('401 when there is no session user', async () => {
    authRef.user = null
    expect((await POST(post({ pageId: 'p1' }))).status).toBe(401)
  })

  it('400 when pageId is missing', async () => {
    expect((await POST(post({ kind: 'memory' }))).status).toBe(400)
  })

  it('owner: succeeds and returns a suggestion', async () => {
    const res = await POST(post({ pageId: 'p1', kind: 'memory' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ suggestion: 'a note' })
    // Authorized as owner of the requested page.
    expect(resolvePageAccess).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: 'p1', userId: 'caller-1', userEmail: 'caller@example.com', requireEditor: true }),
    )
  })

  it('editor-collaborator: works against the OWNER id (plan gated on owner, not caller)', async () => {
    // Caller is a different user, resolved as an editor of owner-1's page.
    authRef.user = { id: 'editor-9', email: 'editor@example.com' }
    accessRef.fn = () => ({ pageId: 'p1', ownerId: 'owner-1', role: 'editor' })
    const res = await POST(post({ pageId: 'p1', kind: 'approval-note' }))
    expect(res.status).toBe(200)
    // Plan gate ran against the OWNER's id, never the logged-in collaborator's.
    expect(ownerAllows).toHaveBeenCalledWith(expect.anything(), 'owner-1', 'aiFeatures')
  })

  it('stranger: 403 when resolvePageAccess returns null', async () => {
    accessRef.fn = () => null
    const res = await POST(post({ pageId: 'p1', kind: 'memory' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'You do not have edit access to this page.' })
    // Never reaches the plan gate or LLM.
    expect(ownerAllows).not.toHaveBeenCalled()
  })

  it('402 when the OWNER lacks aiFeatures', async () => {
    planRef.allow = false
    expect((await POST(post({ pageId: 'p1', kind: 'memory' }))).status).toBe(402)
  })

  it('404 when the owner-scoped page is not found', async () => {
    pageRef.row = null
    expect((await POST(post({ pageId: 'p1', kind: 'memory' }))).status).toBe(404)
  })

  it('403 (consent gate) when the page has not opted into AI assist', async () => {
    pageRef.row = { ...(pageRef.row as Record<string, unknown>), llm_opt_in: false }
    const res = await POST(post({ pageId: 'p1', kind: 'memory' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({
      error: 'Enable "Advanced AI Assist" for this page first to use AI suggestions.',
    })
  })

  it('503 when the LLM is not configured', async () => {
    llmRef.configured = false
    expect((await POST(post({ pageId: 'p1', kind: 'memory' }))).status).toBe(503)
  })
})
