import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const { authRef, rateRef, expRef } = vi.hoisted(() => ({
  authRef: { result: null as any },
  rateRef: { response: null as any },
  expRef: {
    result: { account: { id: 'owner-Z', email: 'z@acme.com', exportedAt: 'T' }, data: {} } as any,
    calls: [] as any[],
  },
}))

vi.mock('../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => rateRef.response) }))
vi.mock('../../../../lib/agents/nexie-auth', () => ({ authenticateNexieRequest: vi.fn(async () => authRef.result) }))
vi.mock('../../../../lib/server/export-account', () => ({
  exportUserAccount: vi.fn(async (id: string, email: string | null, exportedAt: string) => {
    expRef.calls.push({ id, email, exportedAt })
    return expRef.result
  }),
}))

import { GET } from './route'

const req = () => new Request('https://nexez.test/api/account/export') as any

beforeEach(() => {
  rateRef.response = null
  authRef.result = { ok: true, user: { id: 'owner-Z', email: 'z@acme.com' }, db: {} }
  expRef.result = { account: { id: 'owner-Z', email: 'z@acme.com', exportedAt: 'T' }, data: { user_agents: [] } }
  expRef.calls.length = 0
})

describe('GET /api/account/export', () => {
  it('401s when unauthenticated', async () => {
    authRef.result = { ok: false, response: NextResponse.json({ code: 'auth_required' }, { status: 401 }) }
    expect((await GET(req())).status).toBe(401)
  })

  it('exports the session user as a JSON attachment (id + email from the session)', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain('attachment')
    expect(res.headers.get('content-disposition')).toContain('nexez-data-export.json')
    const body = await res.json()
    expect(body.account.id).toBe('owner-Z')
    expect(expRef.calls).toHaveLength(1)
    expect(expRef.calls[0].id).toBe('owner-Z')
    expect(expRef.calls[0].email).toBe('z@acme.com')
  })

  it('503s when the export util is unavailable (no admin env)', async () => {
    expRef.result = null
    expect((await GET(req())).status).toBe(503)
  })

  it('short-circuits when rate limited', async () => {
    rateRef.response = NextResponse.json({ error: 'rate' }, { status: 429 })
    expect((await GET(req())).status).toBe(429)
    expect(expRef.calls).toHaveLength(0)
  })
})
