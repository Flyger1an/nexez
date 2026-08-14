import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const { userRef, adminEnvRef, accessRef, adminClientRef } = vi.hoisted(() => ({
  userRef: { user: { id: 'user-1', email: 'owner@acme.com', email_confirmed_at: '2026-01-01' } as any },
  adminEnvRef: { available: true },
  accessRef: { value: { pageId: 'page-1', ownerId: 'owner-1', role: 'owner' } as any },
  adminClientRef: { client: { tag: 'admin-client' } as any },
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [] })) }))

vi.mock('../../utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: userRef.user } })) },
  })),
}))

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => adminEnvRef.available),
  createAdminClient: vi.fn(() => adminClientRef.client),
}))

vi.mock('./page-access', () => ({
  resolvePageAccess: vi.fn(async () => accessRef.value),
}))

import { requirePageAccess } from './require-page-access'
import { resolvePageAccess } from './page-access'
import { createClient } from '../../utils/supabase/server'

describe('requirePageAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userRef.user = { id: 'user-1', email: 'owner@acme.com', email_confirmed_at: '2026-01-01' }
    adminEnvRef.available = true
    accessRef.value = { pageId: 'page-1', ownerId: 'owner-1', role: 'owner' }
  })

  it('grants, handing back the user, the resolved access, and the admin client', async () => {
    const result = await requirePageAccess({ pageId: 'page-1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.user.id).toBe('user-1')
    expect(result.access).toEqual({ pageId: 'page-1', ownerId: 'owner-1', role: 'owner' })
    expect(result.admin).toBe(adminClientRef.client)
  })

  it('401s an anonymous caller before touching the admin client', async () => {
    userRef.user = null
    const result = await requirePageAccess({ pageId: 'page-1' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(401)
    expect(await result.response.json()).toEqual({ error: 'Not authenticated' })
    expect(resolvePageAccess).not.toHaveBeenCalled()
  })

  it('503s with route-specific copy when the service role is unavailable', async () => {
    adminEnvRef.available = false
    const result = await requirePageAccess({ pageId: 'page-1', unavailableMessage: 'AI is not configured.' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(503)
    expect(await result.response.json()).toEqual({ error: 'AI is not configured.' })
    expect(resolvePageAccess).not.toHaveBeenCalled()
  })

  it('defaults the 503 copy when a route does not supply any', async () => {
    adminEnvRef.available = false
    const result = await requirePageAccess({ pageId: 'page-1' })
    if (result.ok) return
    expect(await result.response.json()).toEqual({ error: 'Service unavailable' })
  })

  it('403s a stranger', async () => {
    accessRef.value = null
    const result = await requirePageAccess({ pageId: 'page-1' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(403)
    expect((await result.response.json()).error).toMatch(/do not have edit access/)
  })

  it('requires editor by default, since every caller is a write action', async () => {
    await requirePageAccess({ pageId: 'page-1' })
    expect(resolvePageAccess).toHaveBeenCalledWith(expect.objectContaining({ requireEditor: true }))
  })

  it('can be opted out of the editor requirement for read-only callers', async () => {
    await requirePageAccess({ pageId: 'page-1', requireEditor: false })
    expect(resolvePageAccess).toHaveBeenCalledWith(expect.objectContaining({ requireEditor: false }))
  })

  it('forwards the confirmed-email timestamp, which the collaborator grant fails closed without', async () => {
    await requirePageAccess({ pageId: 'page-1' })
    expect(resolvePageAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        userEmail: 'owner@acme.com',
        userEmailConfirmedAt: '2026-01-01',
      }),
    )
  })

  it('never passes a client-supplied owner id: authorization keys on the session user', async () => {
    userRef.user = { id: 'editor-9', email: 'editor@partner.com', email_confirmed_at: '2026-01-01' }
    accessRef.value = { pageId: 'page-1', ownerId: 'owner-1', role: 'editor' }
    const result = await requirePageAccess({ pageId: 'page-1' })
    if (!result.ok) return
    // The caller is the editor; everything downstream must act as the OWNER.
    expect(resolvePageAccess).toHaveBeenCalledWith(expect.objectContaining({ userId: 'editor-9' }))
    expect(result.access.ownerId).toBe('owner-1')
  })

  describe('function-form pageId, for routes that must discover the page themselves', () => {
    it('runs the resolver with the admin client and authorizes what it returns', async () => {
      const resolver = vi.fn(async () => 'page-from-lookup')
      await requirePageAccess({ pageId: resolver })
      expect(resolver).toHaveBeenCalledWith(adminClientRef.client)
      expect(resolvePageAccess).toHaveBeenCalledWith(expect.objectContaining({ pageId: 'page-from-lookup' }))
    })

    it('lets the resolver deny with its own response', async () => {
      const denial = NextResponse.json({ error: 'No page you own uses this domain.' }, { status: 403 })
      const result = await requirePageAccess({ pageId: async () => denial })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.response).toBe(denial)
      expect((await result.response.json()).error).toMatch(/uses this domain/)
      expect(resolvePageAccess).not.toHaveBeenCalled()
    })

    it('falls back to the standard 403 when the resolver finds nothing', async () => {
      accessRef.value = null
      const result = await requirePageAccess({ pageId: async () => null })
      if (result.ok) return
      expect(result.response.status).toBe(403)
    })

    it('does not run the resolver at all when the caller is anonymous', async () => {
      userRef.user = null
      const resolver = vi.fn(async () => 'page-1')
      await requirePageAccess({ pageId: resolver })
      expect(resolver).not.toHaveBeenCalled()
    })
  })

  it('forwards the host so cookie options match the request', async () => {
    await requirePageAccess({ pageId: 'page-1', host: 'app.nexez.ai' })
    expect(createClient).toHaveBeenCalledWith(expect.anything(), 'app.nexez.ai')
  })
})
