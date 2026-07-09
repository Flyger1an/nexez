import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mockable seams. resolvePageAccess is THE authorization (owner | editor | null);
// `accessRef.fn` returns the resolved access (or null for a stranger). adminRef
// captures the page row read + the verification_details update so we can assert
// the route reads/writes the OWNER's data via the service-role client.
const { userRef, accessRef, adminRef, planRef, reviewRef } = vi.hoisted(() => ({
  userRef: { user: { id: 'editor-1', email: 'editor@example.com' } as any },
  accessRef: { fn: (_p: string) => null as any },
  adminRef: {
    page: { id: 'p1', owner_id: 'owner-1', name: 'Acme', industry: 'saas', location: 'NYC', verification_details: { docs_provided: [] } } as any,
    updateError: null as any,
    captured: { update: null as any, eqId: null as any, eqOwner: null as any, storageUploadPath: null as any, storageRemoved: [] as string[] },
    uploadError: null as any,
  },
  planRef: { aiAllowed: false },
  reviewRef: { fn: () => ({ status: 'verified' as const, verdict: { reason: 'ok' } }) },
}))

// Session client: only used to read the logged-in user (still 401 if absent).
vi.mock('../../../utils/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: userRef.user } }) },
  }),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({}) }))

// THE authorization primitive - owner/editor/null is decided entirely here.
vi.mock('../../../lib/server/page-access', () => ({
  resolvePageAccess: vi.fn(async (opts: { pageId: string }) => accessRef.fn(opts.pageId)),
}))

// Service-role client: owner-scoped page read + verification_details write + storage.
vi.mock('../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: vi.fn(() => ({
    from: (_table: string) => {
      const builder: any = {
        select: () => builder,
        update: (patch: any) => {
          adminRef.captured.update = patch
          return builder
        },
        eq: (col: string, val: any) => {
          if (col === 'id') adminRef.captured.eqId = val
          if (col === 'owner_id') adminRef.captured.eqOwner = val
          return builder
        },
        maybeSingle: async () => ({ data: adminRef.page }),
        then: (resolve: (v: any) => any) => resolve({ error: adminRef.updateError }),
      }
      return builder
    },
    storage: {
      from: () => ({
        upload: async (path: string) => {
          adminRef.captured.storageUploadPath = path
          return { error: adminRef.uploadError }
        },
        remove: async (paths: string[]) => {
          adminRef.captured.storageRemoved.push(...paths)
          return { error: null }
        },
      }),
    },
  })),
}))

// Plan gate resolves against the OWNER; here it's a controllable boolean.
vi.mock('../../../lib/server/plan', () => ({
  ownerAllows: vi.fn(async () => planRef.aiAllowed),
}))

// LLM review is exercised separately; stub it so the gate branch is observable.
vi.mock('../../../lib/credential-review', () => ({
  reviewCredential: vi.fn(async () => reviewRef.fn()),
}))

import { POST, PATCH, DELETE } from './route'

const OWNER = { id: 'owner-1', email: 'owner@example.com' }
const EDITOR = { id: 'editor-1', email: 'editor@example.com' }
const access = (role: 'owner' | 'editor') => ({ pageId: 'p1', ownerId: 'owner-1', role })

const pngFile = () => new File([new Uint8Array([1, 2, 3])], 'cert.png', { type: 'image/png' })

const postReq = (fields: Record<string, any>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return new Request('https://nexez.app/api/credentials', { method: 'POST', body: fd })
}
const patchReq = (body: unknown) =>
  new Request('https://nexez.app/api/credentials', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
const delReq = (pageId: string, id: string) =>
  new Request(`https://nexez.app/api/credentials?pageId=${pageId}&id=${id}`, { method: 'DELETE' })

beforeEach(() => {
  vi.clearAllMocks()
  userRef.user = EDITOR
  accessRef.fn = () => access('editor')
  adminRef.page = { id: 'p1', owner_id: 'owner-1', name: 'Acme', industry: 'saas', location: 'NYC', verification_details: { docs_provided: [] } }
  adminRef.updateError = null
  adminRef.uploadError = null
  adminRef.captured = { update: null, eqId: null, eqOwner: null, storageUploadPath: null, storageRemoved: [] }
  planRef.aiAllowed = false
  reviewRef.fn = () => ({ status: 'verified', verdict: { reason: 'ok' } })
})

describe('POST /api/credentials (collaborator-aware)', () => {
  it('401 before parsing multipart when there is no session user', async () => {
    userRef.user = null
    const res = await POST(
      new Request('https://nexez.app/api/credentials', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pageId: 'p1' }),
      }),
    )
    expect(res.status).toBe(401)
  })

  it('401 when there is no session user', async () => {
    userRef.user = null
    expect((await POST(postReq({ pageId: 'p1', file: pngFile() }))).status).toBe(401)
  })

  it('400 when pageId or file is missing', async () => {
    expect((await POST(postReq({ file: pngFile() }))).status).toBe(400)
    expect((await POST(postReq({ pageId: 'p1' }))).status).toBe(400)
  })

  it('403 for a stranger (resolvePageAccess null)', async () => {
    accessRef.fn = () => null
    const res = await POST(postReq({ pageId: 'p1', file: pngFile() }))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'You do not have edit access to this page.' })
  })

  it('the OWNER can upload (201) and writes are scoped to the owner id', async () => {
    userRef.user = OWNER
    accessRef.fn = () => access('owner')
    const res = await POST(postReq({ pageId: 'p1', file: pngFile() }))
    expect(res.status).toBe(201)
    // saved under the OWNER, not the acting user
    expect(adminRef.captured.eqOwner).toBe('owner-1')
    expect(adminRef.captured.eqId).toBe('p1')
    // file grouped under the owner's id
    expect(adminRef.captured.storageUploadPath).toMatch(/^owner-1\/p1\//)
  })

  it('an EDITOR-collaborator can upload (201) against the OWNER id, not their own', async () => {
    userRef.user = EDITOR
    accessRef.fn = () => access('editor')
    const res = await POST(postReq({ pageId: 'p1', file: pngFile() }))
    expect(res.status).toBe(201)
    expect(adminRef.captured.eqOwner).toBe('owner-1')
    // NOT scoped to the collaborator's own id anywhere
    expect(adminRef.captured.eqOwner).not.toBe('editor-1')
    expect(adminRef.captured.storageUploadPath).toMatch(/^owner-1\//)
    expect(adminRef.captured.storageUploadPath).not.toMatch(/^editor-1\//)
  })

  it('below the AI plan, the credential is stored as pending (no trust boost)', async () => {
    planRef.aiAllowed = false
    const res = await POST(postReq({ pageId: 'p1', file: pngFile() }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.credential.status).toBe('pending')
  })

  it('with the AI plan, the LLM verdict status is used', async () => {
    planRef.aiAllowed = true
    reviewRef.fn = () => ({ status: 'verified', verdict: { reason: 'looks legit' } })
    const res = await POST(postReq({ pageId: 'p1', file: pngFile() }))
    expect(res.status).toBe(201)
    expect((await res.json()).credential.status).toBe('verified')
  })

  it('rolls back the stored file when the DB write fails', async () => {
    adminRef.updateError = { message: 'boom' }
    const res = await POST(postReq({ pageId: 'p1', file: pngFile() }))
    expect(res.status).toBe(500)
    expect(adminRef.captured.storageRemoved.length).toBe(1)
  })

  it('503 when admin env is unavailable', async () => {
    const admin = await import('../../../utils/supabase/admin')
    ;(admin.hasSupabaseAdminEnv as any).mockReturnValueOnce(false)
    expect((await POST(postReq({ pageId: 'p1', file: pngFile() }))).status).toBe(503)
  })
})

describe('PATCH /api/credentials (collaborator-aware)', () => {
  beforeEach(() => {
    adminRef.page = {
      id: 'p1',
      owner_id: 'owner-1',
      verification_details: { docs_provided: [{ id: 'doc-1', name: 'c', status: 'verified', file_path: 'owner-1/p1/doc-1.png', public: false }] },
    }
  })

  it('400 when pageId or id missing', async () => {
    expect((await PATCH(patchReq({ id: 'doc-1' }))).status).toBe(400)
    expect((await PATCH(patchReq({ pageId: 'p1' }))).status).toBe(400)
  })

  it('403 for a stranger', async () => {
    accessRef.fn = () => null
    expect((await PATCH(patchReq({ pageId: 'p1', id: 'doc-1', public: true }))).status).toBe(403)
  })

  it('an editor toggles visibility, scoped to the OWNER', async () => {
    accessRef.fn = () => access('editor')
    const res = await PATCH(patchReq({ pageId: 'p1', id: 'doc-1', public: true }))
    expect(res.status).toBe(200)
    expect(adminRef.captured.eqOwner).toBe('owner-1')
    const docs = adminRef.captured.update.verification_details.docs_provided
    expect(docs.find((d: any) => d.id === 'doc-1').public).toBe(true)
  })
})

describe('DELETE /api/credentials (collaborator-aware)', () => {
  beforeEach(() => {
    adminRef.page = {
      id: 'p1',
      owner_id: 'owner-1',
      verification_details: { docs_provided: [{ id: 'doc-1', name: 'c', status: 'verified', file_path: 'owner-1/p1/doc-1.png', public: false }] },
    }
  })

  it('400 when pageId or id missing', async () => {
    expect((await DELETE(delReq('', 'doc-1'))).status).toBe(400)
    expect((await DELETE(delReq('p1', ''))).status).toBe(400)
  })

  it('403 for a stranger', async () => {
    accessRef.fn = () => null
    expect((await DELETE(delReq('p1', 'doc-1'))).status).toBe(403)
  })

  it('an editor deletes, scoped to the OWNER, and removes the stored file', async () => {
    accessRef.fn = () => access('editor')
    const res = await DELETE(delReq('p1', 'doc-1'))
    expect(res.status).toBe(200)
    expect(adminRef.captured.eqOwner).toBe('owner-1')
    expect(adminRef.captured.update.verification_details.docs_provided.length).toBe(0)
    expect(adminRef.captured.storageRemoved).toContain('owner-1/p1/doc-1.png')
  })
})
