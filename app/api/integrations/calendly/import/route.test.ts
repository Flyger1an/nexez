import { describe, it, expect, vi, beforeEach } from 'vitest'

// The collaboration gate: resolveFeatureOwner authorizes (owner|editor|self), then the
// `integrations` (Pro) capability is checked against the EFFECTIVE OWNER — via the admin
// client when scoped to a page, the session client when self-gating. Both are mocked so
// we assert the wiring without real Calendly/network calls.
const { userRef, featureRef, ownerAllowsRef } = vi.hoisted(() => ({
  userRef: { user: { id: 'user-1', email: 'me@x.com', email_confirmed_at: '2026-01-01' } as any },
  featureRef: { fn: (_o: any) => ({ ok: true, ownerId: 'user-1', pageId: null, scoped: false, role: 'owner' }) as any },
  ownerAllowsRef: { calls: [] as Array<{ ownerId: any; feature: any; client: any }>, value: true },
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../../utils/supabase/server', () => ({
  createClient: vi.fn(() => ({ __session: true, auth: { getUser: vi.fn(async () => ({ data: { user: userRef.user } })) } })),
}))
vi.mock('../../../../../utils/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ __admin: true })) }))
vi.mock('../../../../../lib/server/page-access', () => ({ resolveFeatureOwner: vi.fn((o: any) => featureRef.fn(o)) }))
vi.mock('../../../../../lib/server/plan', () => ({
  ownerAllows: vi.fn(async (client: any, ownerId: any, feature: any) => {
    ownerAllowsRef.calls.push({ ownerId, feature, client })
    return ownerAllowsRef.value
  }),
}))

import { POST } from './route'

const post = (body: unknown) =>
  new Request('https://nexez.app/api/integrations/calendly/import', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })

describe('POST /api/integrations/calendly/import (collaboration gate)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userRef.user = { id: 'user-1', email: 'me@x.com', email_confirmed_at: '2026-01-01' }
    featureRef.fn = () => ({ ok: true, ownerId: 'user-1', pageId: null, scoped: false, role: 'owner' })
    ownerAllowsRef.calls = []
    ownerAllowsRef.value = true
  })

  it('401 when not authenticated', async () => {
    userRef.user = null
    expect((await POST(post({ token: 't' }))).status).toBe(401)
  })

  it('403 when resolveFeatureOwner denies (stranger with a pageId) — never touches the plan gate', async () => {
    featureRef.fn = () => ({ ok: false, status: 403 })
    const res = await POST(post({ token: 't', pageId: 'p1' }))
    expect(res.status).toBe(403)
    expect(ownerAllowsRef.calls).toEqual([])
  })

  it('503 when a pageId is supplied but the service-role env is missing', async () => {
    featureRef.fn = () => ({ ok: false, status: 503 })
    expect((await POST(post({ token: 't', pageId: 'p1' }))).status).toBe(503)
  })

  it('402 when the EFFECTIVE OWNER lacks the integrations (Pro) capability', async () => {
    ownerAllowsRef.value = false
    const res = await POST(post({ token: 't' }))
    expect(res.status).toBe(402)
    expect(ownerAllowsRef.calls).toEqual([{ ownerId: 'user-1', feature: 'integrations', client: expect.objectContaining({ __session: true }) }])
  })

  it('editor-collaborator: gates integrations on the OWNER via the ADMIN client', async () => {
    featureRef.fn = () => ({ ok: true, ownerId: 'owner-9', pageId: 'p1', scoped: true, role: 'editor' })
    // Gate passes; the missing token then yields 400 — proving we got past the gate.
    const res = await POST(post({ pageId: 'p1' }))
    expect(res.status).toBe(400)
    expect(ownerAllowsRef.calls).toEqual([{ ownerId: 'owner-9', feature: 'integrations', client: expect.objectContaining({ __admin: true }) }])
  })

  it('self-gate (no pageId): gates on the caller via the SESSION client', async () => {
    const res = await POST(post({}))
    expect(res.status).toBe(400) // no token, but gate passed as self-owner
    expect(ownerAllowsRef.calls[0]).toMatchObject({ ownerId: 'user-1', feature: 'integrations' })
    expect(ownerAllowsRef.calls[0].client).toMatchObject({ __session: true })
  })
})
