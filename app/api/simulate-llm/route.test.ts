import { describe, it, expect, vi, beforeEach } from 'vitest'

// The page row the mocked anon client returns from pages_public.
let pageRow: any = null
const { entitlementRef } = vi.hoisted(() => ({ entitlementRef: { hasAdmin: true, allowed: true } }))

vi.mock('../../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../../test/supabase-mock')
  return { supabase: createSupabaseMock(() => ({ data: pageRow })) }
})
vi.mock('../../../lib/llm', () => ({
  isLlmConfigured: () => true,
  llmComplete: vi.fn(async () => 'MOCK_LLM_RESPONSE'),
}))
vi.mock('../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => entitlementRef.hasAdmin,
  createAdminClient: () => ({}),
}))
vi.mock('../../../lib/server/page-private-meta', () => ({
  getPagePrivateMeta: async () => ({ ownerId: 'owner-1' }),
}))
vi.mock('../../../lib/server/plan', () => ({
  ownerAllows: async () => entitlementRef.allowed,
}))

import { POST } from './route'
import { llmComplete } from '../../../lib/llm'

const post = (body: unknown) =>
  new Request('https://nexez.test/api/simulate-llm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const badJsonPost = () =>
  new Request('https://nexez.test/api/simulate-llm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  })

describe('POST /api/simulate-llm (llm_opt_in consent gate)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pageRow = null
    entitlementRef.hasAdmin = true
    entitlementRef.allowed = true
  })

  it('404 when the slug is not a published page', async () => {
    pageRow = null
    expect((await POST(post({ slug: 'nope', query: 'hi' }))).status).toBe(404)
  })

  it('400 for malformed JSON', async () => {
    expect((await POST(badJsonPost())).status).toBe(400)
  })

  it('does NOT invoke the LLM when the page has not opted in (deterministic)', async () => {
    pageRow = { slug: 'p1', name: 'P1', is_published: true, llm_opt_in: false, services: [] }
    const res = await POST(post({ slug: 'p1', query: 'hi' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.llmEnhanced).toBe(false)
    expect(llmComplete).not.toHaveBeenCalled()
  })

  it('invokes the LLM only when the page opted in', async () => {
    pageRow = { slug: 'p2', name: 'P2', is_published: true, llm_opt_in: true, services: [] }
    const res = await POST(post({ slug: 'p2', query: 'hi' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.llmEnhanced).toBe(true)
    expect(body.naturalLanguage).toBe('MOCK_LLM_RESPONSE')
    expect(llmComplete).toHaveBeenCalledTimes(1)
  })

  it('does not invoke the LLM when entitlement resolution is unavailable', async () => {
    entitlementRef.hasAdmin = false
    pageRow = { id: 'p3', slug: 'p3', name: 'P3', is_published: true, llm_opt_in: true, services: [] }
    const res = await POST(post({ slug: 'p3', query: 'hi' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ llmEnhanced: false, reason: 'entitlement_unavailable' })
    expect(llmComplete).not.toHaveBeenCalled()
  })

  it('does not invoke the LLM below the AI-feature entitlement', async () => {
    entitlementRef.allowed = false
    pageRow = { id: 'p4', slug: 'p4', name: 'P4', is_published: true, llm_opt_in: true, services: [] }
    const res = await POST(post({ slug: 'p4', query: 'hi' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ llmEnhanced: false, reason: 'plan_not_eligible' })
    expect(llmComplete).not.toHaveBeenCalled()
  })
})
