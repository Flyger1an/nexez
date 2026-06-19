import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const { authRef, rateLimitRef } = vi.hoisted(() => ({
  authRef: { result: null as any },
  rateLimitRef: { response: null as any },
}))

vi.mock('../../../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => rateLimitRef.response),
}))
vi.mock('../../../../../../lib/agents/nexie-auth', () => ({
  authenticateNexieRequest: vi.fn(async () => authRef.result),
}))

import { GET, PATCH } from './route'

// A Supabase-ish chainable mock that resolves awaited queries from a queue, in order.
function makeDb(results: any[]) {
  let i = 0
  const q: any = {}
  for (const m of ['select', 'eq', 'order', 'limit', 'update']) q[m] = vi.fn(() => q)
  q.maybeSingle = vi.fn(() => Promise.resolve(results[i++]))
  q.then = (resolve: any) => resolve(results[i++])
  q.__lastUpdate = undefined
  q.update = vi.fn((patch: any) => {
    q.__lastUpdate = patch
    return q
  })
  return { from: vi.fn(() => q), __q: q }
}

const getReq = () => new Request('https://nexez.test/api/agents/nexie/threads/t1') as any
const patchReq = (body: unknown, raw = false) =>
  new Request('https://nexez.test/api/agents/nexie/threads/t1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  }) as any
const ctx = { params: Promise.resolve({ id: 't1' }) }

beforeEach(() => {
  rateLimitRef.response = null
  authRef.result = { ok: true, user: { id: 'u1' }, db: makeDb([]) }
})

describe('GET /api/agents/nexie/threads/[id]', () => {
  it('401s when unauthenticated', async () => {
    authRef.result = { ok: false, response: NextResponse.json({ code: 'auth_required' }, { status: 401 }) }
    expect((await GET(getReq(), ctx)).status).toBe(401)
  })

  it('404s when the thread is not the caller’s', async () => {
    authRef.result.db = makeDb([{ data: null, error: null }])
    expect((await GET(getReq(), ctx)).status).toBe(404)
  })

  it('maps roles, drops TOOL/SYSTEM, and restores assistant cards from metadata', async () => {
    authRef.result.db = makeDb([
      { data: { id: 't1', title: 'Cleaning quotes' }, error: null },
      {
        data: [
          { id: 'm1', role: 'USER', content: 'find cleaners', metadata: { mode: 'text' }, created_at: '1' },
          { id: 'm2', role: 'TOOL', content: '{...}', metadata: {}, created_at: '2' },
          { id: 'm3', role: 'ASSISTANT', content: 'here are 3', metadata: { cards: [{ type: 'page_result', id: 'p1' }] }, created_at: '3' },
        ],
        error: null,
      },
    ])
    const res = await GET(getReq(), ctx)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, threadId: 't1', title: 'Cleaning quotes' })
    expect(json.messages).toHaveLength(2) // TOOL dropped
    expect(json.messages[0]).toEqual({ id: 'm1', role: 'user', content: 'find cleaners' })
    expect(json.messages[1]).toMatchObject({ role: 'assistant', cards: [{ type: 'page_result', id: 'p1' }] })
  })
})

describe('PATCH /api/agents/nexie/threads/[id]', () => {
  it('400s on malformed JSON', async () => {
    expect((await PATCH(patchReq('{bad', true), ctx)).status).toBe(400)
  })

  it('400s when there is nothing to update', async () => {
    expect((await PATCH(patchReq({ foo: 'bar' }), ctx)).status).toBe(400)
  })

  it('archives by mapping { archived: true } to status ARCHIVED', async () => {
    const db = makeDb([{ error: null }])
    authRef.result.db = db
    const res = await PATCH(patchReq({ archived: true }), ctx)
    expect(res.status).toBe(200)
    expect(db.__q.__lastUpdate).toEqual({ status: 'ARCHIVED' })
  })

  it('trims + caps a rename', async () => {
    const db = makeDb([{ error: null }])
    authRef.result.db = db
    await PATCH(patchReq({ title: '   Spring   cleaning   ' }), ctx)
    expect(db.__q.__lastUpdate).toEqual({ title: 'Spring cleaning' })
  })

  it('500s when the update errors', async () => {
    authRef.result.db = makeDb([{ error: { message: 'rls' } }])
    expect((await PATCH(patchReq({ archived: true }), ctx)).status).toBe(500)
  })
})
