import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const { authRef, claimsRef, rateRef, delRef } = vi.hoisted(() => ({
  authRef: { result: null as any },
  claimsRef: { result: { data: { claims: { amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }] } }, error: null } as any },
  rateRef: { response: null as any },
  delRef: { result: { ok: true, authUserDeleted: true, sellerRetained: false, errors: [] as any[] }, calls: [] as any[] },
}))

vi.mock('../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => rateRef.response) }))
vi.mock('../../../../lib/agents/nexxi-auth', () => ({ authenticateNexxiRequest: vi.fn(async () => authRef.result) }))
vi.mock('../../../../lib/server/delete-account', () => ({
  deleteUserAccount: vi.fn(async (id: string, email: string | null) => {
    delRef.calls.push({ id, email })
    return delRef.result
  }),
}))

import { POST } from './route'

const req = (body: unknown = { confirm: true }) =>
  new Request('https://nexez.test/api/account/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any

beforeEach(() => {
  rateRef.response = null
  claimsRef.result = {
    data: { claims: { amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }] } },
    error: null,
  }
  authRef.result = {
    ok: true,
    user: { id: 'owner-Z', email: 'z@acme.com' },
    db: { auth: { getClaims: vi.fn(async () => claimsRef.result) } },
  }
  delRef.result = { ok: true, authUserDeleted: true, sellerRetained: false, errors: [] }
  delRef.calls.length = 0
})

describe('POST /api/account/delete', () => {
  it('400s without explicit confirm:true (and on an empty body)', async () => {
    expect((await POST(req({}))).status).toBe(400)
    expect((await POST(req({ confirm: false }))).status).toBe(400)
  })

  it('401s when unauthenticated', async () => {
    authRef.result = { ok: false, response: NextResponse.json({ code: 'auth_required' }, { status: 401 }) }
    expect((await POST(req())).status).toBe(401)
  })

  it('requires a recent interactive authentication before deletion', async () => {
    claimsRef.result = {
      data: { claims: { amr: [{ method: 'password', timestamp: 1 }] } },
      error: null,
    }

    const res = await POST(req())

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'recent_auth_required' })
    expect(delRef.calls).toEqual([])
  })

  it('checks the presented mobile bearer token rather than a refreshed-token timestamp', async () => {
    const getClaims = authRef.result.db.auth.getClaims as ReturnType<typeof vi.fn>
    const request = new Request('https://nexez.test/api/account/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer mobile-token' },
      body: JSON.stringify({ confirm: true }),
    }) as any

    expect((await POST(request)).status).toBe(200)
    expect(getClaims).toHaveBeenCalledWith('mobile-token')
  })

  it('deletes the session user (id + email passed; target never from the body) and returns ok', async () => {
    const res = await POST(req({ confirm: true, userId: 'attacker-should-be-ignored' }))
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    expect(delRef.calls).toEqual([{ id: 'owner-Z', email: 'z@acme.com' }]) // from the session, not the body
  })

  it('500s when deletion fails (auth user not removed)', async () => {
    delRef.result = { ok: false, authUserDeleted: false, sellerRetained: false, errors: [{ scope: 'auth.deleteUser', message: 'boom' }] }
    expect((await POST(req())).status).toBe(500)
  })

  it('forwards sellerRetained so the client can message a kept seller account', async () => {
    delRef.result = { ok: true, authUserDeleted: false, sellerRetained: true, errors: [] }
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, sellerRetained: true })
  })
})
