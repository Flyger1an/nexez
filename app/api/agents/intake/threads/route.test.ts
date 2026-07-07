import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../../../../test/supabase-mock'

const { authRef, rateLimitRef, importerRef } = vi.hoisted(() => ({
  authRef: { result: null as any },
  rateLimitRef: { response: null as any },
  importerRef: { urlError: null as string | null, result: null as any, error: null as Error | null },
}))

vi.mock('../../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => rateLimitRef.response),
}))
vi.mock('../../../../../lib/server/request-auth', () => ({
  resolveRequestAuth: vi.fn(async () => authRef.result),
}))
vi.mock('../../../../../lib/importer', () => ({
  getImportUrlError: vi.fn(() => importerRef.urlError),
  analyzeSite: vi.fn(async () => {
    if (importerRef.error) throw importerRef.error
    return importerRef.result
  }),
}))

import { GET, POST } from './route'

const OWNER = { id: 'owner-1', email: 'o@example.com' }

function makeDb(handlers: { page?: any; onInsert?: (payload: any) => void; sessions?: any[] }) {
  return createSupabaseMock((ctx) => {
    if (ctx.table === 'pages' && ctx.op === 'select') return { data: handlers.page ?? null }
    if (ctx.table === 'intake_sessions' && ctx.op === 'insert') {
      handlers.onInsert?.(ctx.payload)
      return { data: { id: 'sess-new', status: 'active', phase: ctx.payload.phase } }
    }
    if (ctx.table === 'intake_sessions' && ctx.op === 'select') return { data: handlers.sessions ?? [] }
    return { data: null }
  })
}

const post = (body: unknown) =>
  new Request('https://nexez.test/api/agents/intake/threads', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as any

beforeEach(() => {
  rateLimitRef.response = null
  importerRef.urlError = null
  importerRef.error = null
  importerRef.result = {
    title: 'Apex Catering Co.',
    description: 'Full-service catering.',
    website_url: 'https://apex.example',
    structuredOffers: [{ name: 'Event Catering', description: 'Full', price: '$1,200', url: '' }],
    servicesText: '',
    industry: 'Catering',
    clarifyingQuestions: [{ id: 'q1', field: 'audience', question: 'Who buys?', why: 'match' }],
    aiStatus: { configured: false, attempted: false, used: false, status: 'deterministic', provider: '', model: '', reason: '' },
    pagesAnalyzed: 2,
  }
  authRef.result = { supabase: makeDb({}), user: OWNER }
})

describe('POST /api/agents/intake/threads', () => {
  it('401s when unauthenticated', async () => {
    authRef.result = { supabase: makeDb({}), user: null }
    expect((await POST(post({}))).status).toBe(401)
  })

  it('400s on malformed JSON', async () => {
    expect((await POST(post('{nope'))).status).toBe(400)
  })

  it('400s on an invalid source_url', async () => {
    importerRef.urlError = 'That URL is not allowed.'
    expect((await POST(post({ source_url: 'http://localhost/evil' }))).status).toBe(400)
  })

  it('creates a from-scratch session (a scratch source + gap analysis already run)', async () => {
    let inserted: any
    authRef.result = { supabase: makeDb({ onInsert: (p) => (inserted = p) }), user: OWNER }
    const res = await POST(post({}))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.id).toBe('sess-new')
    expect(inserted.owner_id).toBe(OWNER.id)
    expect(inserted.state.phase).toBe('GAP_ANALYSIS')
    expect(inserted.state.sources[0].kind).toBe('none')
    expect(inserted.state.gaps.length).toBeGreaterThan(0)
  })

  it('creates a session from a URL: source added, extraction folded, gaps analyzed', async () => {
    let inserted: any
    authRef.result = { supabase: makeDb({ onInsert: (p) => (inserted = p) }), user: OWNER }
    const res = await POST(post({ source_url: 'https://apex.example' }))
    expect(res.status).toBe(201)
    expect(inserted.state.draft.name).toBe('Apex Catering Co.')
    expect(inserted.state.draft.services).toHaveLength(1)
    expect(inserted.state.phase).toBe('GAP_ANALYSIS')
    expect(inserted.state.extractions).toHaveLength(1)
  })

  it('still creates the session when the create-time crawl fails (best-effort extraction)', async () => {
    importerRef.error = new Error('crawl blew up')
    let inserted: any
    authRef.result = { supabase: makeDb({ onInsert: (p) => (inserted = p) }), user: OWNER }
    const res = await POST(post({ source_url: 'https://apex.example' }))
    expect(res.status).toBe(201)
    expect(inserted.state.sources[0].kind).toBe('url')
    expect(inserted.state.extractions).toHaveLength(0)
  })

  it('404s when re-interviewing a page the caller does not own', async () => {
    authRef.result = { supabase: makeDb({ page: null }), user: OWNER }
    expect((await POST(post({ page_id: 'page-x' }))).status).toBe(404)
  })

  it('seeds a re-interview from the owned page with imported provenance', async () => {
    let inserted: any
    authRef.result = {
      supabase: makeDb({
        page: { name: 'Existing Biz', description: 'D', services: [{ name: 'Old', description: '', price: '$5', url: '' }], products: [], faqs: [] },
        onInsert: (p) => (inserted = p),
      }),
      user: OWNER,
    }
    const res = await POST(post({ page_id: 'page-1' }))
    expect(res.status).toBe(201)
    expect(inserted.page_id).toBe('page-1')
    expect(inserted.state.draft.name).toBe('Existing Biz')
    expect(inserted.state.provenance['page:name']).toBe('imported')
  })
})

describe('GET /api/agents/intake/threads', () => {
  it('401s when unauthenticated', async () => {
    authRef.result = { supabase: makeDb({}), user: null }
    expect((await GET(new Request('https://nexez.test/api/agents/intake/threads') as any)).status).toBe(401)
  })

  it('lists the owner\'s active sessions', async () => {
    authRef.result = {
      supabase: makeDb({ sessions: [{ id: 's1', status: 'active', phase: 'INTERVIEW', page_id: null, updated_at: '2026-07-06T00:00:00Z' }] }),
      user: OWNER,
    }
    const json = await (await GET(new Request('https://nexez.test/api/agents/intake/threads') as any)).json()
    expect(json.sessions).toEqual([{ id: 's1', status: 'active', phase: 'INTERVIEW', pageId: null, updatedAt: '2026-07-06T00:00:00Z' }])
  })
})
