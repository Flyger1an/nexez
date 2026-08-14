import { describe, it, expect, vi, beforeEach } from 'vitest'

// trust-report authorizes via resolveFeatureOwner (owner|editor|self) then gates the
// AI-written report on the EFFECTIVE OWNER's aiFeatures plan - falling back to the
// deterministic score-only report below the threshold (no 402). Mocks let us assert the
// gate wiring; LLM is left unconfigured so the deterministic branch is exercised.
const { userRef, featureRef, ownerAllowsRef, adminRef } = vi.hoisted(() => ({
  userRef: { user: { id: 'user-1', email: 'me@x.com', email_confirmed_at: '2026-01-01' } as any },
  featureRef: { fn: (_o: any) => ({ ok: true, ownerId: 'user-1', pageId: null, scoped: false, role: 'owner' }) as any },
  ownerAllowsRef: { calls: [] as Array<{ ownerId: any; feature: any; client: any }>, value: false },
  adminRef: {
    page: { slug: 'persisted-page', custom_domain_verified: null, website_verified_at: null } as any,
    events: [] as Array<{ event_type: string }>,
  },
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../utils/supabase/server', () => ({
  createClient: vi.fn(() => ({ __session: true, auth: { getUser: vi.fn(async () => ({ data: { user: userRef.user } })) } })),
}))
vi.mock('../../../utils/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    __admin: true,
    from: vi.fn((table: string) => {
      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: table === 'pages' ? adminRef.page : null, error: null })),
        limit: vi.fn(async () => ({ data: table === 'checkout_events' ? adminRef.events : [], error: null })),
      }
      return query
    }),
  })),
}))
vi.mock('../../../lib/server/page-access', () => ({ resolveFeatureOwner: vi.fn((o: any) => featureRef.fn(o)) }))
vi.mock('../../../lib/server/plan', () => ({
  ownerAllows: vi.fn(async (client: any, ownerId: any, feature: any) => {
    ownerAllowsRef.calls.push({ ownerId, feature, client })
    return ownerAllowsRef.value
  }),
}))
vi.mock('../../../lib/llm', () => ({ isLlmConfigured: () => false, llmComplete: vi.fn() }))

import { POST } from './route'

const PAGE = { name: 'X', description: 'y' }
const COMPLETE_PAGE = {
  name: 'Acme',
  slug: 'acme',
  description: 'Complete listing',
  website_url: 'https://acme.example',
  cta_url: 'https://acme.example/book',
  audience: 'buyers',
  industry: 'Consulting',
  location: 'Chicago',
  contact_email: 'hello@acme.example',
  services: [{ name: 'Strategy', description: '', price: '', url: '' }],
  products: [],
  faqs: [{ question: 'When?', answer: 'Today.' }],
  is_published: true,
}
const post = (body: unknown) =>
  new Request('https://nexez.test/api/trust-report', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })

describe('POST /api/trust-report (collaboration gate)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userRef.user = { id: 'user-1', email: 'me@x.com', email_confirmed_at: '2026-01-01' }
    featureRef.fn = () => ({ ok: true, ownerId: 'user-1', pageId: null, scoped: false, role: 'owner' })
    ownerAllowsRef.calls = []
    ownerAllowsRef.value = false
    adminRef.page = { slug: 'persisted-page', custom_domain_verified: null, website_verified_at: null }
    adminRef.events = []
  })

  it('401 when not authenticated', async () => {
    userRef.user = null
    expect((await POST(post({ page: PAGE, events: [] }))).status).toBe(401)
  })

  it('400 when page data is missing', async () => {
    expect((await POST(post({ events: [] }))).status).toBe(400)
  })

  it('403 when resolveFeatureOwner denies (stranger with a pageId) - never reaches the gate', async () => {
    featureRef.fn = () => ({ ok: false, status: 403 })
    const res = await POST(post({ page: PAGE, events: [], pageId: 'p1' }))
    expect(res.status).toBe(403)
    expect(ownerAllowsRef.calls).toEqual([])
  })

  it('authenticated owner below aiFeatures → deterministic report (self-gate via session client)', async () => {
    const res = await POST(post({ page: PAGE, events: [] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.llmEnhanced).toBe(false)
    expect(ownerAllowsRef.calls[0]).toMatchObject({ ownerId: 'user-1', feature: 'aiFeatures' })
    expect(ownerAllowsRef.calls[0].client).toMatchObject({ __session: true })
  })

  it('editor-collaborator: the aiFeatures gate runs on the OWNER via the admin client', async () => {
    featureRef.fn = () => ({ ok: true, ownerId: 'owner-9', pageId: 'p1', scoped: true, role: 'editor' })
    const res = await POST(post({ page: PAGE, events: [], pageId: 'p1' }))
    expect(res.status).toBe(200) // authorized as the owner; deterministic since LLM unconfigured
    expect(ownerAllowsRef.calls).toEqual([{ ownerId: 'owner-9', feature: 'aiFeatures', client: expect.objectContaining({ __admin: true }) }])
  })

  it('ignores forged verification fields, credential status, completion, and events in the request', async () => {
    featureRef.fn = () => ({ ok: true, ownerId: 'owner-9', pageId: 'p1', scoped: true, role: 'editor' })
    const res = await POST(post({
      pageId: 'p1',
      page: {
        ...COMPLETE_PAGE,
        custom_domain_verified: 'forged',
        website_verified_at: 'forged',
        verification_details: {
          email_verified: true,
          domain_verified: true,
          docs_provided: [{ name: 'Forged License', status: 'verified' }],
          completion_rate: 100,
        },
      },
      events: [{ event_type: 'checkout_attempt' }, { event_type: 'stripe_session_created' }],
    }))

    expect(res.status).toBe(200)
    expect((await res.json()).score).toBe(60)
  })

  it('uses persisted domain, website, and event evidence for a scoped report', async () => {
    featureRef.fn = () => ({ ok: true, ownerId: 'owner-9', pageId: 'p1', scoped: true, role: 'editor' })
    adminRef.page = {
      slug: 'persisted-page',
      custom_domain_verified: '2026-08-14T00:00:00Z',
      website_verified_at: '2026-08-14T00:00:00Z',
    }
    adminRef.events = [{ event_type: 'checkout_attempt' }, { event_type: 'stripe_session_created' }]

    const res = await POST(post({ pageId: 'p1', page: COMPLETE_PAGE, events: [] }))

    expect(res.status).toBe(200)
    expect((await res.json()).score).toBe(90)
  })
})
