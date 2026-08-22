import { describe, it, expect, vi, beforeEach } from 'vitest'

// analyze-competitor authorizes via resolveFeatureOwner (owner|editor|self) then gates
// the LLM analysis on the EFFECTIVE OWNER's aiFeatures plan (402, no fallback). Mocks let
// us assert the gate wiring; owner-disallow fires 402 before any outbound scraping.
const { userRef, featureRef, ownerAllowsRef, analysisRef, insertRef } = vi.hoisted(() => ({
  userRef: { user: { id: 'user-1', email: 'me@x.com', email_confirmed_at: '2026-01-01' } as any },
  featureRef: { fn: (_o: any) => ({ ok: true, ownerId: 'user-1', pageId: null, scoped: false, role: 'owner' }) as any },
  ownerAllowsRef: { calls: [] as Array<{ ownerId: any; feature: any; client: any }>, value: false },
  analysisRef: { value: {
    url: 'https://competitor.example',
    normalizedUrl: 'https://competitor.example',
    analyzedAt: '2026-08-21T00:00:00.000Z',
    scores: { overall: 50, parseability: 50, structuredDataQuality: 50, clarityAndIntent: 50 },
    missing: [], strengths: [], weaknesses: [], recommendations: [],
    provenance: { analysis: 'deterministic_with_llm', cache: { hit: false, scope: 'process', ttlHours: 48 }, fetch: 'respectful_public_web' },
    signals: { hasJsonLd: false, jsonLdCount: 0, hasLlmsTxt: false, hasAgentJson: false, offerCount: 0, headingCount: 1, hasContact: false, textLength: 1000, priceMentions: 0 },
  } as any },
  insertRef: { value: null as any },
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    __session: true,
    auth: { getUser: vi.fn(async () => ({ data: { user: userRef.user } })) },
    from: vi.fn(() => {
      const chain: any = {
        insert: vi.fn((value: any) => { insertRef.value = value; return chain }),
        select: vi.fn(() => chain),
        single: vi.fn(async () => ({
          data: insertRef.value ? {
            id: '123e4567-e89b-42d3-a456-426614174000',
            kind: insertRef.value.kind,
            target_url: insertRef.value.target_url,
            target_host: insertRef.value.target_host,
            compared_page_id: insertRef.value.compared_page_id,
            compared_page_slug: insertRef.value.compared_page_slug,
            result: insertRef.value.result,
            evidence: insertRef.value.evidence,
            created_at: '2026-08-21T00:00:00.000Z',
          } : null,
          error: null,
        })),
      }
      return chain
    }),
  })),
}))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ __admin: true })) }))
vi.mock('@/lib/server/page-access', () => ({ resolveFeatureOwner: vi.fn((o: any) => featureRef.fn(o)) }))
vi.mock('@/lib/server/plan', () => ({
  ownerAllows: vi.fn(async (client: any, ownerId: any, feature: any) => {
    ownerAllowsRef.calls.push({ ownerId, feature, client })
    return ownerAllowsRef.value
  }),
}))
vi.mock('@/lib/competitor-analyzer', () => ({
  analyzeCompetitorSite: vi.fn(async () => analysisRef.value),
  analysisToMarkdown: () => '',
  analysisToJSON: () => '{}',
}))

import { POST } from './route'

const post = (body: unknown) =>
  new Request('https://nexez.test/api/analyze-competitor', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })

describe('POST /api/analyze-competitor (collaboration gate)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userRef.user = { id: 'user-1', email: 'me@x.com', email_confirmed_at: '2026-01-01' }
    featureRef.fn = () => ({ ok: true, ownerId: 'user-1', pageId: null, scoped: false, role: 'owner' })
    ownerAllowsRef.calls = []
    ownerAllowsRef.value = false
    insertRef.value = null
  })

  it('401 when not authenticated - never reaches outbound scraping', async () => {
    userRef.user = null
    expect((await POST(post({ url: 'https://example.com' }))).status).toBe(401)
  })

  it('400 when url is missing', async () => {
    expect((await POST(post({}))).status).toBe(400)
  })

  it('403 when resolveFeatureOwner denies (stranger with a pageId) - never touches the plan gate', async () => {
    featureRef.fn = () => ({ ok: false, status: 403 })
    const res = await POST(post({ url: 'https://example.com', pageId: 'p1' }))
    expect(res.status).toBe(403)
    expect(ownerAllowsRef.calls).toEqual([])
  })

  it('402 when the EFFECTIVE OWNER lacks aiFeatures (self-gate via session client)', async () => {
    const res = await POST(post({ url: 'https://example.com' }))
    expect(res.status).toBe(402)
    expect(ownerAllowsRef.calls[0]).toMatchObject({ ownerId: 'user-1', feature: 'aiFeatures' })
    expect(ownerAllowsRef.calls[0].client).toMatchObject({ __session: true })
  })

  it('editor-collaborator: the aiFeatures gate runs on the OWNER via the admin client (402 below Launch)', async () => {
    featureRef.fn = () => ({ ok: true, ownerId: 'owner-9', pageId: 'p1', scoped: true, role: 'editor' })
    const res = await POST(post({ url: 'https://example.com', pageId: 'p1' }))
    expect(res.status).toBe(402)
    expect(ownerAllowsRef.calls).toEqual([{ ownerId: 'owner-9', feature: 'aiFeatures', client: expect.objectContaining({ __admin: true }) }])
  })

  it('persists a private summarized benchmark only after explicit opt-in', async () => {
    ownerAllowsRef.value = true
    const res = await POST(post({ url: 'https://competitor.example', save: true }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.savedRun).toMatchObject({ kind: 'competitor_benchmark', targetHost: 'competitor.example' })
    expect(insertRef.value).toMatchObject({ owner_id: 'user-1', kind: 'competitor_benchmark' })
    expect(insertRef.value.result).not.toHaveProperty('rawHtml')
    expect(insertRef.value.evidence.source.rawHtmlStored).toBe(false)
  })

  it('does not persist when save is omitted', async () => {
    ownerAllowsRef.value = true
    const res = await POST(post({ url: 'https://competitor.example' }))
    expect(res.status).toBe(200)
    expect(insertRef.value).toBeNull()
    expect((await res.json()).savedRun).toBeNull()
  })
})
