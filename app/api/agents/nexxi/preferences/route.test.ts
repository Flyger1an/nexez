import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const { authRef, ensureRef, rateLimitRef, dbRef } = vi.hoisted(() => ({
  authRef: { result: null as any },
  ensureRef: { handler: vi.fn(async (_db: any, _userId: string) => ({ preferences: {} } as any)) },
  rateLimitRef: { response: null as any },
  dbRef: { error: null as any, lastUpdate: undefined as any },
}))

vi.mock('../../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => rateLimitRef.response),
}))
vi.mock('../../../../../lib/agents/nexxi-auth', () => ({
  authenticateNexxiRequest: vi.fn(async () => authRef.result),
}))
vi.mock('../../../../../lib/agents/nexxi', () => ({
  ensureUserAgent: (db: any, userId: string) => ensureRef.handler(db, userId),
}))

import { GET, PATCH } from './route'

function makeDb() {
  const q: any = {}
  q.update = vi.fn((patch: any) => {
    dbRef.lastUpdate = patch
    return q
  })
  q.eq = vi.fn(() => q)
  q.then = (resolve: any) => resolve({ error: dbRef.error })
  return { from: vi.fn(() => q) }
}

const get = () => new Request('https://nexez.test/api/agents/nexxi/preferences') as any
const patch = (body: unknown, raw = false) =>
  new Request('https://nexez.test/api/agents/nexxi/preferences', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  }) as any

beforeEach(() => {
  rateLimitRef.response = null
  dbRef.error = null
  dbRef.lastUpdate = undefined
  ensureRef.handler = vi.fn(async () => ({ preferences: {} }))
  authRef.result = { ok: true, user: { id: 'u1', email: 'b@x.com' }, db: makeDb() }
})

describe('GET /api/agents/nexxi/preferences', () => {
  it('passes through the rate-limit response when throttled', async () => {
    rateLimitRef.response = NextResponse.json({ error: 'rate' }, { status: 429 })
    expect((await GET(get())).status).toBe(429)
  })

  it('401s when unauthenticated', async () => {
    authRef.result = { ok: false, response: NextResponse.json({ code: 'auth_required' }, { status: 401 }) }
    expect((await GET(get())).status).toBe(401)
  })

  it('returns a normalized shape even when the stored value is partial/garbage', async () => {
    ensureRef.handler = vi.fn(async () => ({ preferences: { categories: ['  Cleaning ', 'cleaning'], timing: 'bogus' } }))
    const res = await GET(get())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.preferences.categories).toEqual(['Cleaning'])
    expect(json.preferences.timing).toBeNull()
    expect(json.preferences.currency).toBe('USD')
  })

  it('500s when the agent load throws', async () => {
    ensureRef.handler = vi.fn(async () => {
      throw new Error('db down')
    })
    expect((await GET(get())).status).toBe(500)
  })
})

describe('PATCH /api/agents/nexxi/preferences', () => {
  it('400s on a malformed JSON body', async () => {
    expect((await PATCH(patch('{not json', true))).status).toBe(400)
  })

  it('normalizes the body and persists it under the owner', async () => {
    const res = await PATCH(patch({ preferences: { budgetMax: 499.7, currency: 'eur', categories: ['x', 'x'], timing: 'asap' } }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.preferences).toMatchObject({ budgetMax: 500, currency: 'EUR', categories: ['x'], timing: 'asap' })
    // The persisted patch is the normalized object, not the raw input.
    expect(dbRef.lastUpdate.preferences).toMatchObject({ budgetMax: 500, currency: 'EUR', categories: ['x'] })
  })

  it('accepts a bare preferences object (no { preferences } wrapper)', async () => {
    const res = await PATCH(patch({ location: 'Dallas' }))
    expect(res.status).toBe(200)
    expect((await res.json()).preferences.location).toBe('Dallas')
  })

  it('500s when the update returns an error', async () => {
    dbRef.error = { message: 'rls denied' }
    expect((await PATCH(patch({ preferences: {} }))).status).toBe(500)
  })
})
