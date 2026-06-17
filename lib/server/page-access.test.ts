import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'

const refs = vi.hoisted(() => ({
  hasEnv: true,
  page: { id: 'p1', owner_id: 'owner-1' } as any,
  invite: null as any, // { role, status } or null
}))

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => refs.hasEnv),
  createAdminClient: vi.fn(() =>
    createSupabaseMock((ctx: QueryContext) => {
      if (ctx.table === 'pages') return { data: refs.page, error: null }
      if (ctx.table === 'team_invites') return { data: refs.invite, error: null }
      return { data: null, error: null }
    }),
  ),
}))

import { resolvePageAccess, resolveFeatureOwner } from './page-access'

// A collaborator's email must be CONFIRMED (hardening a). Most collaborator-grant tests
// pass this; the unconfirmed case is asserted explicitly below.
const CONFIRMED = '2026-01-01T00:00:00Z'

describe('resolvePageAccess', () => {
  beforeEach(() => {
    refs.hasEnv = true
    refs.page = { id: 'p1', owner_id: 'owner-1' }
    refs.invite = null
  })

  it('grants the page OWNER full access (no invite needed)', async () => {
    const a = await resolvePageAccess({ pageId: 'p1', userId: 'owner-1', userEmail: 'owner@x.com' })
    expect(a).toEqual({ pageId: 'p1', ownerId: 'owner-1', role: 'owner' })
  })

  it('grants a non-revoked EDITOR collaborator (confirmed email)', async () => {
    refs.invite = { role: 'editor', status: 'pending' }
    const a = await resolvePageAccess({ pageId: 'p1', userId: 'mate-2', userEmail: 'Mate@X.com', userEmailConfirmedAt: CONFIRMED, requireEditor: true })
    expect(a).toEqual({ pageId: 'p1', ownerId: 'owner-1', role: 'editor' })
  })

  it('DENIES a collaborator whose email is NOT confirmed (hardening a)', async () => {
    refs.invite = { role: 'editor', status: 'pending' }
    // Same invite as above, but no confirmation timestamp → fail closed, never queried as an editor.
    expect(await resolvePageAccess({ pageId: 'p1', userId: 'mate-2', userEmail: 'Mate@X.com', userEmailConfirmedAt: null, requireEditor: true })).toBeNull()
    expect(await resolvePageAccess({ pageId: 'p1', userId: 'mate-2', userEmail: 'Mate@X.com', requireEditor: true })).toBeNull()
  })

  it('grants a VIEWER for read, but REJECTS them when requireEditor', async () => {
    refs.invite = { role: 'viewer', status: 'accepted' }
    expect(await resolvePageAccess({ pageId: 'p1', userId: 'v-3', userEmail: 'v@x.com', userEmailConfirmedAt: CONFIRMED })).toMatchObject({ role: 'viewer' })
    expect(await resolvePageAccess({ pageId: 'p1', userId: 'v-3', userEmail: 'v@x.com', userEmailConfirmedAt: CONFIRMED, requireEditor: true })).toBeNull()
  })

  it('denies when there is no live invite (non-owner)', async () => {
    refs.invite = null // revoked invites are filtered out by the query → resolve to null
    expect(await resolvePageAccess({ pageId: 'p1', userId: 'stranger', userEmail: 's@x.com' })).toBeNull()
  })

  it('denies a non-owner collaborator with no verified email (cannot match an invite)', async () => {
    refs.invite = { role: 'editor', status: 'pending' }
    expect(await resolvePageAccess({ pageId: 'p1', userId: 'mate-2', userEmail: null })).toBeNull()
  })

  it('denies when the page does not exist', async () => {
    refs.page = null
    expect(await resolvePageAccess({ pageId: 'nope', userId: 'owner-1', userEmail: 'o@x.com' })).toBeNull()
  })

  it('denies on missing inputs / no admin env (fail-closed)', async () => {
    expect(await resolvePageAccess({ pageId: '', userId: 'owner-1', userEmail: 'o@x.com' })).toBeNull()
    expect(await resolvePageAccess({ pageId: 'p1', userId: '', userEmail: 'o@x.com' })).toBeNull()
    refs.hasEnv = false
    expect(await resolvePageAccess({ pageId: 'p1', userId: 'owner-1', userEmail: 'o@x.com' })).toBeNull()
  })

  it('queries team_invites by owner + lowercased email + non-revoked', async () => {
    refs.invite = { role: 'editor', status: 'pending' }
    let captured: QueryContext | null = null
    const { createAdminClient } = await import('../../utils/supabase/admin')
    vi.mocked(createAdminClient).mockReturnValueOnce(
      createSupabaseMock((ctx: QueryContext) => {
        if (ctx.table === 'pages') return { data: refs.page, error: null }
        if (ctx.table === 'team_invites') {
          captured = ctx
          return { data: refs.invite, error: null }
        }
        return { data: null, error: null }
      }) as any,
    )
    await resolvePageAccess({ pageId: 'p1', userId: 'mate-2', userEmail: '  MATE@X.com ', userEmailConfirmedAt: CONFIRMED, requireEditor: true })
    expect(captured!.eqs.owner_id).toBe('owner-1')
    expect(captured!.eqs.email).toBe('mate@x.com') // trimmed + lowercased
    expect(captured!.calls.some((c) => c[0] === 'neq' && c[1] === 'status' && c[2] === 'revoked')).toBe(true)
  })
})

describe('resolveFeatureOwner', () => {
  beforeEach(() => {
    refs.hasEnv = true
    refs.page = { id: 'p1', owner_id: 'owner-1' }
    refs.invite = null
  })

  it('self-gates the caller when NO pageId (create/sandbox flow) — never touches admin', async () => {
    const r = await resolveFeatureOwner({ pageId: undefined, userId: 'u-self', userEmail: 'u@x.com' })
    expect(r).toEqual({ ok: true, ownerId: 'u-self', pageId: null, scoped: false, role: 'owner' })
  })

  it('scopes to the page OWNER for a confirmed editor collaborator (gate runs as the owner)', async () => {
    refs.invite = { role: 'editor', status: 'pending' }
    const r = await resolveFeatureOwner({ pageId: 'p1', userId: 'mate-2', userEmail: 'mate@x.com', userEmailConfirmedAt: CONFIRMED })
    expect(r).toEqual({ ok: true, ownerId: 'owner-1', pageId: 'p1', scoped: true, role: 'editor' })
  })

  it('grants the page owner directly (scoped, owner role)', async () => {
    const r = await resolveFeatureOwner({ pageId: 'p1', userId: 'owner-1', userEmail: 'owner@x.com' })
    expect(r).toEqual({ ok: true, ownerId: 'owner-1', pageId: 'p1', scoped: true, role: 'owner' })
  })

  it('403 for a stranger who supplies a pageId', async () => {
    refs.invite = null
    expect(await resolveFeatureOwner({ pageId: 'p1', userId: 'stranger', userEmail: 's@x.com', userEmailConfirmedAt: CONFIRMED })).toEqual({ ok: false, status: 403 })
  })

  it('403 for an editor invitee with an UNCONFIRMED email (hardening a)', async () => {
    refs.invite = { role: 'editor', status: 'pending' }
    expect(await resolveFeatureOwner({ pageId: 'p1', userId: 'mate-2', userEmail: 'mate@x.com', userEmailConfirmedAt: null })).toEqual({ ok: false, status: 403 })
  })

  it('403 rejects a viewer (requireEditor defaults to true for feature routes)', async () => {
    refs.invite = { role: 'viewer', status: 'accepted' }
    expect(await resolveFeatureOwner({ pageId: 'p1', userId: 'v-3', userEmail: 'v@x.com', userEmailConfirmedAt: CONFIRMED })).toEqual({ ok: false, status: 403 })
  })

  it('503 when a pageId is supplied but the service-role env is missing', async () => {
    refs.hasEnv = false
    expect(await resolveFeatureOwner({ pageId: 'p1', userId: 'mate-2', userEmail: 'mate@x.com', userEmailConfirmedAt: CONFIRMED })).toEqual({ ok: false, status: 503 })
  })
})
