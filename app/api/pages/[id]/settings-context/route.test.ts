import { describe, it, expect, vi, beforeEach } from 'vitest'

const refs = vi.hoisted(() => ({
  user: { id: 'editor-2', email: 'mate@x.com' } as any,
  access: { pageId: 'p1', ownerId: 'owner-1', role: 'editor' } as any,
  adminEnv: true,
  plan: 'enterprise',
  ownedPage: { id: 'p1', owner_id: 'editor-2' } as any,
  ownerSecrets: { calendly_webhook_secret: 'owner-cs', outbound_webhooks: [], domain_verification_token: 'owner-tok', website_verification_token: 'web-tok' } as any,
  secrets: { calendly_webhook_secret: 'cs', outbound_webhooks: [{ url: 'u' }], domain_verification_token: 'tok', calendly_pat_encrypted: 'v1.enc.crypt.tag' } as any,
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../../utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: async () => ({ data: { user: refs.user } }) },
    from: (table: string) => {
      const query: any = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: table === 'pages' ? refs.ownedPage : refs.ownerSecrets }),
      }
      return query
    },
  })),
}))
vi.mock('../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../../lib/server/page-access', () => ({ resolvePageAccess: vi.fn(async () => refs.access) }))
vi.mock('../../../../../lib/server/plan', () => ({ getOwnerPlanId: vi.fn(async () => refs.plan) }))
vi.mock('../../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => refs.adminEnv),
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      const query: any = {
        select: () => query,
        eq: () => query,
        is: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: table === 'page_secrets' ? refs.secrets : null }),
      }
      return query
    },
  })),
}))

import { GET } from './route'

const req = () => new Request('https://app.nexez.ai/api/pages/p1/settings-context')
const params = Promise.resolve({ id: 'p1' })

describe('GET /api/pages/[id]/settings-context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.user = { id: 'editor-2', email: 'mate@x.com' }
    refs.access = { pageId: 'p1', ownerId: 'owner-1', role: 'editor' }
    refs.adminEnv = true
    refs.ownedPage = { id: 'p1', owner_id: 'editor-2' }
  })

  it('401 when not authenticated', async () => {
    refs.user = null
    expect((await GET(req(), { params })).status).toBe(401)
  })

  it('403 for a non-owner/non-editor (resolvePageAccess null)', async () => {
    const { resolvePageAccess } = await import('../../../../../lib/server/page-access')
    vi.mocked(resolvePageAccess).mockResolvedValueOnce(null)
    expect((await GET(req(), { params })).status).toBe(403)
  })

  it('returns the OWNER plan + role + owner-only secrets for an editor', async () => {
    const res = await GET(req(), { params })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({
      role: 'editor',
      ownerId: 'owner-1',
      plan: 'enterprise', // the OWNER's plan, not the editor's
      secrets: {
        calendly_webhook_secret: 'cs',
        outbound_webhooks: [{ url: 'u' }],
        domain_verification_token: 'tok',
        calendly_connected: true, // boolean derived from ciphertext presence
      },
      agenticCommerce: { connectReady: false },
    })
    expect(json.agenticCommerce).not.toHaveProperty('planAllowsCheckout')
    // Unified connection state drives the Integrations panel (booleans only).
    const cal = (json.integrations as any[]).find((c) => c.provider === 'calendly')
    expect(cal).toMatchObject({ connected: true, kind: 'token', canSync: true })
    // The encrypted PAT itself must never reach the client.
    expect(JSON.stringify(json)).not.toContain('v1.enc.crypt.tag')
  })

  it('falls back through RLS for the direct owner when the admin credential is absent', async () => {
    refs.adminEnv = false
    const res = await GET(req(), { params })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      role: 'owner',
      ownerId: 'editor-2',
      plan: 'enterprise',
      contextLimited: true,
      integrations: [],
      secrets: {
        calendly_webhook_secret: 'owner-cs',
        domain_verification_token: 'owner-tok',
        website_verification_token: 'web-tok',
        calendly_connected: false,
      },
    })
  })

  it('keeps collaborators fail-closed without the admin credential', async () => {
    refs.adminEnv = false
    refs.ownedPage = { id: 'p1', owner_id: 'owner-1' }
    expect((await GET(req(), { params })).status).toBe(403)
  })

  it('requires editor (passes requireEditor to the resolver)', async () => {
    const { resolvePageAccess } = await import('../../../../../lib/server/page-access')
    await GET(req(), { params })
    expect(vi.mocked(resolvePageAccess).mock.calls[0][0]).toMatchObject({ requireEditor: true, pageId: 'p1' })
  })
})
