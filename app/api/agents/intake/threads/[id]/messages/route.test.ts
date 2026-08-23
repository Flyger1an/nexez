import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../../../../../../test/supabase-mock'
import { applyIntakeAction, createIntakeState, type IntakeState } from '../../../../../../../lib/intake'

const { authRef, rateLimitRef } = vi.hoisted(() => ({
  authRef: { result: null as any },
  rateLimitRef: { response: null as any },
}))

vi.mock('../../../../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => rateLimitRef.response),
}))
vi.mock('../../../../../../../lib/server/request-auth', () => ({
  resolveRequestAuth: vi.fn(async () => authRef.result),
}))
vi.mock('../../../../../../../lib/importer', () => ({
  analyzeSite: vi.fn(async () => ({ structuredOffers: [] })),
}))

import { POST } from './route'

const OWNER = { id: 'owner-1' }
const params = { params: Promise.resolve({ id: 'sess-1' }) }
const post = (body: unknown) =>
  new Request('https://nexez.test/api/agents/intake/threads/sess-1/messages', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as any

/** A real analyzed session state (built through the machine, not hand-rolled). */
function analyzedState(): IntakeState {
  let state = createIntakeState()
  for (const action of [
    { type: 'ADD_SOURCE' as const, source: { id: 's1', kind: 'url' as const, value: 'https://a.example', addedAt: '2026-07-06T00:00:00Z' } },
    {
      type: 'RECORD_EXTRACTION' as const,
      extraction: { sourceId: 's1', title: 'Apex', description: 'D', offers: [{ name: 'Thing', description: '', price: '', url: '' }] },
    },
    { type: 'ANALYZE_GAPS' as const },
  ]) {
    const applied = applyIntakeAction(state, action)
    if (applied.ok) state = applied.state
  }
  return state
}

function dbWith(row: any, updates: any[] = [], planId: 'free' | 'pro' | 'error' = 'free') {
  return createSupabaseMock((ctx) => {
    if (ctx.table === 'intake_sessions' && ctx.op === 'select') return { data: row }
    if (ctx.table === 'intake_sessions' && ctx.op === 'update') {
      updates.push(ctx.payload)
      return { data: null }
    }
    if (ctx.table === 'platform_admins') return planId === 'error' ? { data: null, error: { message: 'plan read failed' } } : { data: null }
    if (ctx.table === 'billing_subscriptions') {
      if (planId === 'error') return { data: null, error: { message: 'plan read failed' } }
      return {
        data: planId === 'pro'
          ? { owner_id: OWNER.id, plan_id: 'pro', status: 'active', trial_ends_at: null, account_origin: 'paid' }
          : null,
      }
    }
    if (ctx.table === 'promotional_plan_grants') return planId === 'error' ? { data: null, error: { message: 'plan read failed' } } : { data: [] }
    return { data: null }
  })
}

beforeEach(() => {
  rateLimitRef.response = null
  authRef.result = { supabase: dbWith(null), user: OWNER }
})

describe('POST /api/agents/intake/threads/[id]/messages', () => {
  it('401s when unauthenticated', async () => {
    authRef.result = { supabase: dbWith(null), user: null }
    expect((await POST(post({ content: 'hi' }), params)).status).toBe(401)
  })

  it('400s on malformed JSON and on an empty turn', async () => {
    authRef.result = { supabase: dbWith(null), user: OWNER }
    expect((await POST(post('{nope'), params)).status).toBe(400)
    expect((await POST(post({}), params)).status).toBe(400)
  })

  it('404s for a foreign/missing session', async () => {
    expect((await POST(post({ content: 'hi' }), params)).status).toBe(404)
  })

  it('runs a full deterministic turn end-to-end (no LLM configured) and persists', async () => {
    const updates: any[] = []
    const row = { id: 'sess-1', owner_id: OWNER.id, page_id: null, status: 'active', phase: 'GAP_ANALYSIS', state: analyzedState() }
    authRef.result = { supabase: dbWith(row, updates), user: OWNER }
    const res = await POST(post({ content: 'ready!' }), params)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.message.length).toBeGreaterThan(0)
    expect(json.phase).toBe('INTERVIEW')
    expect(json.cards.some((c: any) => c.type === 'gap_batch')).toBe(true)
    expect(updates).toHaveLength(1)
    // the owner's message made it into the persisted transcript
    expect(updates[0].state.messages.some((m: any) => m.role === 'owner' && m.content === 'ready!')).toBe(true)
  })

  it('fails plan-read errors closed to the deterministic interviewer even when an LLM is configured', async () => {
    vi.stubEnv('LLM_API_KEY', 'configured-but-not-entitled')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    try {
      const row = { id: 'sess-1', owner_id: OWNER.id, page_id: null, status: 'active', phase: 'GAP_ANALYSIS', state: analyzedState() }
      authRef.result = { supabase: dbWith(row, [], 'error'), user: OWNER }
      const res = await POST(post({ content: 'ready!' }), params)
      expect(res.status).toBe(200)
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      fetchMock.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it('applies structured quick-answers and 400s invalid ones with the reducer code', async () => {
    const row = { id: 'sess-1', owner_id: OWNER.id, page_id: null, status: 'active', phase: 'GAP_ANALYSIS', state: analyzedState() }
    authRef.result = { supabase: dbWith(row, []), user: OWNER }
    const bad = await POST(post({ answers: [{ gapId: 'nope', answer: 'x' }] }), params)
    expect(bad.status).toBe(400)
    expect((await bad.json()).code).toBe('unknown_gap')

    const good = await POST(
      post({ answers: [{ gapId: 'offer:services-0:price', answer: '$99', fields: [{ target: 'offer', offerKey: 'services-0', field: 'price', value: '$99' }] }] }),
      params,
    )
    expect(good.status).toBe(200)
    const json = await good.json()
    expect(json.state.draft.services[0].price).toBe('$99')
  })

  it('uses the effective owner plan to reject Open to offers below Pro and allow it on Pro', async () => {
    const answer = {
      answers: [{
        gapId: 'offer:services-0:posture',
        answer: 'Open to offers',
        fields: [{ target: 'offer', offerKey: 'services-0', field: 'offerType', value: 'negotiable' }],
      }],
    }
    const row = { id: 'sess-1', owner_id: OWNER.id, page_id: null, status: 'active', phase: 'GAP_ANALYSIS', state: analyzedState() }

    authRef.result = { supabase: dbWith(row), user: OWNER }
    const blocked = await POST(post(answer), params)
    expect(blocked.status).toBe(403)
    expect(await blocked.json()).toMatchObject({ code: 'feature_not_available' })

    authRef.result = { supabase: dbWith(row, [], 'pro'), user: OWNER }
    const allowed = await POST(post(answer), params)
    expect(allowed.status).toBe(200)
    expect((await allowed.json()).state.draft.services[0].offerType).toBe('negotiable')
  })

  it('409s once the interview has handed off', async () => {
    const row = { id: 'sess-1', owner_id: OWNER.id, page_id: 'p1', status: 'handed_off', phase: 'REVIEW_HANDOFF', state: analyzedState() }
    authRef.result = { supabase: dbWith(row, []), user: OWNER }
    expect((await POST(post({ content: 'hello?' }), params)).status).toBe(409)
  })
})
