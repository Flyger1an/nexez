import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../../../../../../test/supabase-mock'
import { applyIntakeAction, createIntakeState, type IntakeState } from '../../../../../../../lib/intake'

const { authRef, rateLimitRef, importerRef, integRef } = vi.hoisted(() => ({
  authRef: { result: null as any },
  rateLimitRef: { response: null as any },
  importerRef: { urlError: null as string | null, result: null as any, offers: [] as any[] },
  integRef: { gate: null as any, importResult: null as any },
}))

vi.mock('../../../../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => rateLimitRef.response),
}))
vi.mock('../../../../../../../lib/server/request-auth', () => ({
  resolveRequestAuth: vi.fn(async () => authRef.result),
}))
vi.mock('../../../../../../../lib/importer', () => ({
  getImportUrlError: vi.fn(() => importerRef.urlError),
  analyzeSite: vi.fn(async () => importerRef.result),
  llmExtractOffers: vi.fn(async () => importerRef.offers),
}))
const { credRef } = vi.hoisted(() => ({ credRef: { savedPat: null as string | null, lastInput: null as any } }))
vi.mock('../../../../../../../lib/server/integration-importers', () => ({
  INGESTABLE_PROVIDERS: ['calendly', 'shopify', 'square', 'acuity'],
  gateIntegrationImport: vi.fn(async () => integRef.gate),
  importIntegrationOffers: vi.fn(async (input: any) => {
    credRef.lastInput = input
    return integRef.importResult
  }),
}))
vi.mock('../../../../../../../lib/server/page-integration-credentials', () => ({
  getCalendlyPat: vi.fn(async () => credRef.savedPat),
}))

import { POST } from './route'

const OWNER = { id: 'owner-1' }
const params = { params: Promise.resolve({ id: 'sess-1' }) }
const post = (body: unknown) =>
  new Request('https://nexez.test/api/agents/intake/threads/sess-1/ingest', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as any

function midInterviewState(): IntakeState {
  let state = createIntakeState()
  for (const action of [
    { type: 'ADD_SOURCE' as const, source: { id: 's1', kind: 'none' as const, value: '', addedAt: '2026-07-06T00:00:00Z' } },
    { type: 'ANALYZE_GAPS' as const },
  ]) {
    const applied = applyIntakeAction(state, action)
    if (applied.ok) state = applied.state
  }
  return state
}

function dbWith(row: any, updates: any[] = []) {
  return createSupabaseMock((ctx) => {
    if (ctx.table === 'intake_sessions' && ctx.op === 'select') return { data: row }
    if (ctx.table === 'intake_sessions' && ctx.op === 'update') {
      updates.push(ctx.payload)
      return { data: null }
    }
    return { data: null }
  })
}

beforeEach(() => {
  rateLimitRef.response = null
  importerRef.urlError = null
  integRef.gate = { ok: true, ownerId: 'owner-1' }
  integRef.importResult = { ok: true, offers: [{ name: 'Calendly Consult', description: '', price: 'Custom', url: '', source: 'calendly' }], note: 'Imported 1' }
  credRef.savedPat = null
  credRef.lastInput = null
  importerRef.offers = [{ name: 'Pasted Offer', description: '', price: '$40', url: '' }]
  importerRef.result = {
    title: 'Apex',
    description: 'D',
    website_url: 'https://apex.example',
    structuredOffers: [{ name: 'Crawled Offer', description: '', price: '$10', url: '' }],
    servicesText: '',
    aiStatus: { configured: false, attempted: false, used: false, status: 'deterministic', provider: '', model: '', reason: '' },
    pagesAnalyzed: 1,
  }
  authRef.result = { supabase: dbWith(null), user: OWNER }
})

describe('POST /api/agents/intake/threads/[id]/ingest', () => {
  it('401s when unauthenticated', async () => {
    authRef.result = { supabase: dbWith(null), user: null }
    expect((await POST(post({ url: 'https://apex.example' }), params)).status).toBe(401)
  })

  it('400s on malformed JSON, an empty body, and an invalid URL', async () => {
    expect((await POST(post('{nope'), params)).status).toBe(400)
    expect((await POST(post({}), params)).status).toBe(400)
    importerRef.urlError = 'Blocked host.'
    expect((await POST(post({ url: 'http://localhost' }), params)).status).toBe(400)
  })

  it('404s for a foreign/missing session and 409s after handoff', async () => {
    expect((await POST(post({ url: 'https://apex.example' }), params)).status).toBe(404)
    authRef.result = {
      supabase: dbWith({ id: 'sess-1', owner_id: OWNER.id, page_id: null, status: 'handed_off', phase: 'REVIEW_HANDOFF', state: midInterviewState() }),
      user: OWNER,
    }
    expect((await POST(post({ url: 'https://apex.example' }), params)).status).toBe(409)
  })

  it('ingests a URL mid-conversation: source appended, extraction folded, gaps re-analyzed, persisted', async () => {
    const updates: any[] = []
    const row = { id: 'sess-1', owner_id: OWNER.id, page_id: null, status: 'active', phase: 'GAP_ANALYSIS', state: midInterviewState() }
    authRef.result = { supabase: dbWith(row, updates), user: OWNER }
    const res = await POST(post({ url: 'https://apex.example' }), params)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.offersFound).toBe(1)
    expect(json.state.draft.name).toBe('Apex') // fill-empty fold
    expect(json.state.sources).toHaveLength(2)
    expect(updates).toHaveLength(1)
  })

  it('ingests pasted text through the LLM offer extractor (best-effort)', async () => {
    const row = { id: 'sess-1', owner_id: OWNER.id, page_id: null, status: 'active', phase: 'GAP_ANALYSIS', state: midInterviewState() }
    authRef.result = { supabase: dbWith(row, []), user: OWNER }
    const res = await POST(post({ text: 'We offer haircuts for $40 and beard trims for $20.' }), params)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.offersFound).toBe(1)
    expect(json.state.draft.services.map((o: any) => o.name)).toContain('Pasted Offer')
  })

  describe('integration sources', () => {
    const activeRow = () => ({ id: 'sess-1', owner_id: OWNER.id, page_id: null, status: 'active', phase: 'GAP_ANALYSIS', state: midInterviewState() })

    it('ingests a live integration catalog: Pro-gated, folded as an integration source', async () => {
      const updates: any[] = []
      authRef.result = { supabase: dbWith(activeRow(), updates), user: OWNER }
      const res = await POST(post({ provider: 'calendly', token: 'cal_tok' }), params)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.offersFound).toBe(1)
      expect(json.state.sources.some((s: any) => s.kind === 'integration' && s.value === 'calendly')).toBe(true)
      expect(json.state.draft.services.map((o: any) => o.name)).toContain('Calendly Consult')
      expect(updates).toHaveLength(1)
    })

    it('400s on an unsupported provider', async () => {
      authRef.result = { supabase: dbWith(activeRow(), []), user: OWNER }
      expect((await POST(post({ provider: 'wixxx', token: 'x' }), params)).status).toBe(400)
    })

    it('400s when the provider credentials are missing', async () => {
      authRef.result = { supabase: dbWith(activeRow(), []), user: OWNER }
      expect((await POST(post({ provider: 'shopify' }), params)).status).toBe(400) // no shop/accessToken
    })

    it('re-interview: a Calendly connect with no token falls back to the page\'s saved PAT', async () => {
      credRef.savedPat = 'stored_cal_pat'
      const reRow = { id: 'sess-1', owner_id: OWNER.id, page_id: 'page-7', status: 'active', phase: 'GAP_ANALYSIS', state: midInterviewState() }
      authRef.result = { supabase: dbWith(reRow, []), user: OWNER }
      const res = await POST(post({ provider: 'calendly' }), params) // NO token in the body
      expect(res.status).toBe(200)
      expect(credRef.lastInput).toEqual({ provider: 'calendly', token: 'stored_cal_pat' })
    })

    it('a Calendly connect with no token AND no saved PAT is a 400 (nothing to use)', async () => {
      credRef.savedPat = null
      const reRow = { id: 'sess-1', owner_id: OWNER.id, page_id: 'page-7', status: 'active', phase: 'GAP_ANALYSIS', state: midInterviewState() }
      authRef.result = { supabase: dbWith(reRow, []), user: OWNER }
      expect((await POST(post({ provider: 'calendly' }), params)).status).toBe(400)
    })

    it('surfaces the Pro gate (402) before fetching', async () => {
      integRef.gate = { ok: false, status: 402, error: 'Connecting a live integration is a Pro feature.' }
      authRef.result = { supabase: dbWith(activeRow(), []), user: OWNER }
      const res = await POST(post({ provider: 'calendly', token: 'cal_tok' }), params)
      expect(res.status).toBe(402)
    })

    it('422s when the live fetch fails (never folds sample/invented offers)', async () => {
      integRef.importResult = { ok: false, status: 502, error: 'Could not reach Square (check the access token).' }
      const updates: any[] = []
      authRef.result = { supabase: dbWith(activeRow(), updates), user: OWNER }
      const res = await POST(post({ provider: 'square', accessToken: 'sq_tok' }), params)
      expect(res.status).toBe(422)
      expect(updates).toHaveLength(0) // nothing persisted on a failed import
    })
  })
})
