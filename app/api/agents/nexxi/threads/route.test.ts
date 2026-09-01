import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const { authRef, rateLimitRef } = vi.hoisted(() => ({
  authRef: { result: null as any },
  rateLimitRef: { response: null as any },
}))

vi.mock('../../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => rateLimitRef.response),
}))
vi.mock('../../../../../lib/agents/nexxi-auth', () => ({
  authenticateNexxiRequest: vi.fn(async () => authRef.result),
}))

import { GET } from './route'

function makeDb(result: any) {
  const q: any = {}
  for (const m of ['select', 'eq', 'order', 'limit']) q[m] = vi.fn(() => q)
  q.then = (resolve: any) => resolve(result)
  return { from: vi.fn(() => q) }
}

const req = () => new Request('https://nexez.test/api/agents/nexxi/threads') as any

beforeEach(() => {
  rateLimitRef.response = null
  authRef.result = { ok: true, user: { id: 'u1' }, db: makeDb({ data: [], error: null }) }
})

describe('GET /api/agents/nexxi/threads', () => {
  it('401s when unauthenticated', async () => {
    authRef.result = { ok: false, response: NextResponse.json({ code: 'auth_required' }, { status: 401 }) }
    expect((await GET(req())).status).toBe(401)
  })

  it('maps rows to {id,title,updatedAt}', async () => {
    authRef.result.db = makeDb({
      data: [{ id: 't1', title: 'Cleaning', updated_at: '2026-06-18T00:00:00Z' }],
      error: null,
    })
    const json = await (await GET(req())).json()
    expect(json.threads).toEqual([{ id: 't1', title: 'Cleaning', updatedAt: '2026-06-18T00:00:00Z' }])
  })

  it('500s on a query error', async () => {
    authRef.result.db = makeDb({ data: null, error: { message: 'boom' } })
    expect((await GET(req())).status).toBe(500)
  })
})
