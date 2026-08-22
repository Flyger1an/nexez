import { beforeEach, describe, expect, it, vi } from 'vitest'

const { state } = vi.hoisted(() => ({
  state: {
    user: { id: 'owner-1', email: 'owner@nexez.test' } as any,
    calls: [] as any[],
    historyRows: [] as any[],
  },
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('@/lib/server/llm-simulation', () => ({
  runLlmSimulation: vi.fn(async () => ({ executed: false, model: null, reason: 'provider_not_configured', result: null })),
}))
vi.mock('@/utils/supabase/server', async () => {
  const { createSupabaseMock } = await import('@/test/supabase-mock')
  return {
    createClient: vi.fn(() => createSupabaseMock((context) => {
      state.calls.push(context)
      if (context.table === 'pages' && context.op === 'select') {
        return context.eqs.owner_id === state.user?.id ? { data: ownedPage, error: null } : { data: null, error: null }
      }
      if (context.table === 'pages_public') {
        return context.eqs.slug
          ? { data: publicPage, error: null }
          : { data: [publicPage], error: null, count: 1 } as any
      }
      if (context.table === 'agent_lab_simulation_runs' && context.op === 'insert') {
        return { data: context.payload, error: null }
      }
      if (context.table === 'agent_lab_simulation_runs') {
        return { data: state.historyRows, error: null }
      }
      return { data: null, error: null }
    }, { user: state.user })),
  }
})

import { GET, POST } from './route'

const publicPage = {
  id: 'page-1',
  owner_id: null,
  name: 'Acme Strategy',
  slug: 'acme',
  description: 'Strategy services for founders',
  website_url: 'https://acme.test',
  cta_url: 'https://acme.test/book',
  cta_label: 'Book',
  audience: 'Founders',
  location: 'Remote',
  contact_email: 'hello@acme.test',
  industry: 'Consulting',
  prefer_original_site: false,
  products: [],
  services: [{ name: 'Strategy Session', description: 'A focused call', price: '$250', url: '' }],
  faqs: [{ question: 'When?', answer: 'This week.' }],
  is_published: true,
  llm_opt_in: false,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
}

const ownedPage = { ...publicPage, owner_id: 'owner-1' }

function post(body: unknown) {
  return new Request('https://nexez.test/api/simulator/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('Agent Lab durable runs API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = { id: 'owner-1', email: 'owner@nexez.test' }
    state.calls = []
    state.historyRows = []
  })

  it('computes an owned run on the server and appends immutable evidence', async () => {
    const response = await POST(post({ pageId: 'page-1', query: 'Book a strategy session', includeLlm: true }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.persisted).toBe(true)
    expect(body.run).toMatchObject({
      ownerId: 'owner-1',
      pageId: 'page-1',
      engineVersion: 'nexez.agent-lab.v2',
      executionMode: 'deterministic',
      persisted: true,
    })
    expect(body.run.result.results).toHaveLength(5)
    expect(body.run.evidence).toMatchObject({
      execution: { boundary: 'server', deterministicAgents: 5, llm: { executed: false } },
      competitiveField: { visiblePagesEvaluated: 1, complete: true },
      commerce: { offersInspected: 1, runtimeDryRuns: 0, scope: 'published_contract' },
    })
    expect(body.run.evidence.commerce.notice).toContain('No checkout')
    expect(state.calls.some((call) => call.table === 'agent_lab_simulation_runs' && call.op === 'insert')).toBe(true)
    expect(state.calls.some((call) => call.table === 'pages' && call.eqs.owner_id === 'owner-1')).toBe(true)
  })

  it('analyzes a public slug without writing it to private history', async () => {
    state.user = null
    const response = await POST(post({ slug: 'acme', query: 'Find strategy help' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.persisted).toBe(false)
    expect(body.run.ownerId).toBeNull()
    expect(state.calls.some((call) => call.table === 'agent_lab_simulation_runs' && call.op === 'insert')).toBe(false)
  })

  it('lets an owner analyze a private draft without exposing it publicly', async () => {
    const originalPublished = ownedPage.is_published
    ownedPage.is_published = false

    try {
      const response = await POST(post({ pageId: 'page-1', query: 'Review this draft offer' }))
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.persisted).toBe(true)
      expect(body.run.evidence.commerce).toMatchObject({
        scope: 'owner_draft',
        runtimeDryRuns: 0,
      })
      expect(body.run.evidence.commerce.notice).toContain('remains unavailable to public agents')
      expect(body.run.evidence.commerce.offers[0].inspection).toBe('owner_draft')
      expect(state.calls.some((call) => call.table === 'pages_public' && call.eqs.slug === 'acme')).toBe(false)
    } finally {
      ownedPage.is_published = originalPublished
    }
  })

  it('does not allow an unauthenticated page id to read a private listing', async () => {
    state.user = null
    const response = await POST(post({ pageId: 'page-1', query: 'Read a private listing' }))

    expect(response.status).toBe(404)
    expect(state.calls.some((call) => call.table === 'pages')).toBe(false)
    expect(state.calls.some((call) => call.table === 'pages_public')).toBe(false)
  })

  it('rejects empty and oversized queries before doing analysis', async () => {
    expect((await POST(post({ pageId: 'page-1', query: '' }))).status).toBe(400)
    expect((await POST(post({ pageId: 'page-1', query: 'x'.repeat(501) }))).status).toBe(400)
  })

  it('requires auth for history and returns owner-scoped rows', async () => {
    const now = '2026-08-21T23:00:00.000Z'
    state.historyRows = [{
      id: 'run-1', owner_id: 'owner-1', page_id: 'page-1', page_slug: 'acme', query: 'strategy',
      engine_version: 'nexez.agent-lab.v2', execution_mode: 'deterministic', readiness: 90,
      result: { query: 'strategy', results: [], recommendations: [], overallReadiness: 90, success: { score: 90 }, rankAnalysis: {} },
      evidence: { execution: {}, competitiveField: {}, commerce: {} }, created_at: now,
    }]
    const response = await GET(new Request('https://nexez.test/api/simulator/runs?pageId=page-1'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.runs[0]).toMatchObject({ id: 'run-1', ownerId: 'owner-1', pageId: 'page-1', persisted: true })
    expect(state.calls.some((call) => call.table === 'agent_lab_simulation_runs' && call.eqs.owner_id === 'owner-1' && call.eqs.page_id === 'page-1')).toBe(true)

    state.user = null
    expect((await GET(new Request('https://nexez.test/api/simulator/runs'))).status).toBe(401)
  })
})
