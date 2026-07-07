import { describe, it, expect, vi, beforeEach } from 'vitest'

// Same collaboration gate as the other importers. Owner-disallow forces 402 right after
// the gate, so no Square Catalog API call / sample-data path is reached.
const { userRef, featureRef, ownerAllowsRef } = vi.hoisted(() => ({
  userRef: { user: { id: 'user-1', email: 'me@x.com', email_confirmed_at: '2026-01-01' } as any },
  featureRef: { fn: (_o: any) => ({ ok: true, ownerId: 'user-1', pageId: null, scoped: false, role: 'owner' }) as any },
  ownerAllowsRef: { calls: [] as Array<{ ownerId: any; feature: any; client: any }>, value: false },
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
  new Request('https://nexez.app/api/integrations/square/import', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })

describe('POST /api/integrations/square/import (collaboration gate)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userRef.user = { id: 'user-1', email: 'me@x.com', email_confirmed_at: '2026-01-01' }
    featureRef.fn = () => ({ ok: true, ownerId: 'user-1', pageId: null, scoped: false, role: 'owner' })
    ownerAllowsRef.calls = []
    ownerAllowsRef.value = false
  })

  it('401 when not authenticated', async () => {
    userRef.user = null
    expect((await POST(post({}))).status).toBe(401)
  })

  it('403 when resolveFeatureOwner denies - never reaches Square / sample data', async () => {
    featureRef.fn = () => ({ ok: false, status: 403 })
    expect((await POST(post({ pageId: 'p1' }))).status).toBe(403)
    expect(ownerAllowsRef.calls).toEqual([])
  })

  it('editor-collaborator: gates integrations on the OWNER via the ADMIN client (402 below Pro)', async () => {
    featureRef.fn = () => ({ ok: true, ownerId: 'owner-9', pageId: 'p1', scoped: true, role: 'editor' })
    expect((await POST(post({ pageId: 'p1' }))).status).toBe(402)
    expect(ownerAllowsRef.calls).toEqual([{ ownerId: 'owner-9', feature: 'integrations', client: expect.objectContaining({ __admin: true }) }])
  })

  it('self-gate (no pageId): gates the caller via the SESSION client (402 below Pro)', async () => {
    expect((await POST(post({}))).status).toBe(402)
    expect(ownerAllowsRef.calls[0]).toMatchObject({ ownerId: 'user-1', feature: 'integrations' })
    expect(ownerAllowsRef.calls[0].client).toMatchObject({ __session: true })
  })
})
