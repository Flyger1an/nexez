import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../../../../../test/supabase-mock'

const { authRef, rateLimitRef } = vi.hoisted(() => ({
  authRef: { result: null as any },
  rateLimitRef: { response: null as any },
}))

vi.mock('../../../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => rateLimitRef.response),
}))
vi.mock('../../../../../../lib/server/request-auth', () => ({
  resolveRequestAuth: vi.fn(async () => authRef.result),
}))

import { GET } from './route'

const OWNER = { id: 'owner-1' }
const req = () => new Request('https://nexez.test/api/agents/intake/threads/sess-1') as any
const params = { params: Promise.resolve({ id: 'sess-1' }) }

function dbWith(row: any) {
  return createSupabaseMock((ctx) => {
    if (ctx.table === 'intake_sessions' && ctx.op === 'select') {
      // tenancy: the route must filter by BOTH the id and the caller's owner_id
      expect(ctx.eqs.id).toBe('sess-1')
      expect(ctx.eqs.owner_id).toBe(OWNER.id)
      return { data: row }
    }
    return { data: null }
  })
}

beforeEach(() => {
  rateLimitRef.response = null
  authRef.result = { supabase: dbWith(null), user: OWNER }
})

describe('GET /api/agents/intake/threads/[id]', () => {
  it('401s when unauthenticated', async () => {
    authRef.result = { supabase: dbWith(null), user: null }
    expect((await GET(req(), params)).status).toBe(401)
  })

  it('404s for a missing or foreign session (owner eq enforced)', async () => {
    expect((await GET(req(), params)).status).toBe(404)
  })

  it('returns the full resumable state', async () => {
    authRef.result = {
      supabase: dbWith({
        id: 'sess-1',
        owner_id: OWNER.id,
        page_id: null,
        status: 'active',
        phase: 'INTERVIEW',
        state: { phase: 'INTERVIEW', sources: [], extractions: [], gaps: [], askedGapIds: [], answers: [], draft: null, provenance: {}, messages: [], handoff: null },
        updated_at: '2026-07-06T00:00:00Z',
      }),
      user: OWNER,
    }
    const json = await (await GET(req(), params)).json()
    expect(json).toMatchObject({ ok: true, id: 'sess-1', status: 'active', phase: 'INTERVIEW' })
    expect(json.state.draft).toBeTruthy() // sessionState fills a usable draft even from a sparse row
  })
})
