import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'

const refs = vi.hoisted(() => ({
  hasEnv: true,
  page: { id: 'p1', owner_id: 'owner-1' } as any,
  pageError: null as any,
  entitlements: {
    planId: 'pro',
    features: { teamCollaboration: true },
    limits: { teamSeats: 3 },
  } as any,
  invites: [] as any[],
  inviteError: null as any,
}))

vi.mock('./plan', () => ({
  getOwnerEntitlements: vi.fn(async () => refs.entitlements),
}))

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => refs.hasEnv),
  createAdminClient: vi.fn(() =>
    createSupabaseMock((ctx: QueryContext) => {
      if (ctx.table === 'pages') return { data: refs.page, error: refs.pageError }
      if (ctx.table === 'team_invites') {
        const limit = ctx.calls.find(([method]) => method === 'limit')?.[1]
        return {
          data: typeof limit === 'number' ? refs.invites.slice(0, limit) : refs.invites,
          error: refs.inviteError,
        }
      }
      return { data: null, error: null }
    }),
  ),
}))

import { resolvePageAccess, resolveFeatureOwner } from './page-access'

// A collaborator's email must be CONFIRMED (hardening a). Most collaborator-grant tests
// pass this; the unconfirmed case is asserted explicitly below.
const CONFIRMED = '2026-01-01T00:00:00Z'
const acceptedInvite = (
  email: string,
  role: 'editor' | 'viewer' = 'editor',
  index = 1,
) => ({
  id: `invite-${index}`,
  email,
  role,
  status: 'accepted',
  created_at: `2026-01-${String(index).padStart(2, '0')}T00:00:00Z`,
})

function usePlan(planId: 'free' | 'pro' | 'enterprise') {
  refs.entitlements = {
    planId,
    features: { teamCollaboration: planId === 'pro' || planId === 'enterprise' },
    limits: { teamSeats: planId === 'free' ? 0 : planId === 'pro' ? 3 : null },
  }
}

describe('resolvePageAccess', () => {
  beforeEach(() => {
    refs.hasEnv = true
    refs.page = { id: 'p1', owner_id: 'owner-1' }
    refs.pageError = null
    refs.invites = []
    refs.inviteError = null
    usePlan('pro')
  })

  it('grants the page OWNER full access (no invite needed)', async () => {
    const a = await resolvePageAccess({ pageId: 'p1', userId: 'owner-1', userEmail: 'owner@x.com' })
    expect(a).toEqual({ pageId: 'p1', ownerId: 'owner-1', role: 'owner' })
  })

  it('grants an ACCEPTED EDITOR collaborator (confirmed email)', async () => {
    refs.invites = [acceptedInvite('mate@x.com')]
    const a = await resolvePageAccess({ pageId: 'p1', userId: 'mate-2', userEmail: 'Mate@X.com', userEmailConfirmedAt: CONFIRMED, requireEditor: true })
    expect(a).toEqual({ pageId: 'p1', ownerId: 'owner-1', role: 'editor' })
  })

  it('DENIES an accepted collaborator on Free (no collaboration feature or seats)', async () => {
    usePlan('free')
    refs.invites = [acceptedInvite('mate@x.com')]
    const a = await resolvePageAccess({ pageId: 'p1', userId: 'mate-2', userEmail: 'Mate@X.com', userEmailConfirmedAt: CONFIRMED, requireEditor: true })
    expect(a).toBeNull()
  })

  it('keeps direct owner access open on Free, independent of collaborator allocation', async () => {
    usePlan('free')
    refs.inviteError = { code: '42501', message: 'permission denied' }
    const a = await resolvePageAccess({ pageId: 'p1', userId: 'owner-1', userEmail: 'owner@x.com' })
    expect(a).toEqual({ pageId: 'p1', ownerId: 'owner-1', role: 'owner' })
  })

  it('DENIES a collaborator whose email is NOT confirmed (hardening a)', async () => {
    refs.invites = [acceptedInvite('mate@x.com')]
    // Same invite as above, but no confirmation timestamp → fail closed, never queried as an editor.
    expect(await resolvePageAccess({ pageId: 'p1', userId: 'mate-2', userEmail: 'Mate@X.com', userEmailConfirmedAt: null, requireEditor: true })).toBeNull()
    expect(await resolvePageAccess({ pageId: 'p1', userId: 'mate-2', userEmail: 'Mate@X.com', requireEditor: true })).toBeNull()
  })

  it('grants a VIEWER for read, but REJECTS them when requireEditor', async () => {
    refs.invites = [acceptedInvite('v@x.com', 'viewer')]
    expect(await resolvePageAccess({ pageId: 'p1', userId: 'v-3', userEmail: 'v@x.com', userEmailConfirmedAt: CONFIRMED })).toMatchObject({ role: 'viewer' })
    expect(await resolvePageAccess({ pageId: 'p1', userId: 'v-3', userEmail: 'v@x.com', userEmailConfirmedAt: CONFIRMED, requireEditor: true })).toBeNull()
  })

  it('denies when there is no live invite (non-owner)', async () => {
    refs.invites = [] // revoked invites are filtered out by the query → resolve to null
    expect(await resolvePageAccess({ pageId: 'p1', userId: 'stranger', userEmail: 's@x.com' })).toBeNull()
  })

  it('denies a non-owner collaborator with no verified email (cannot match an invite)', async () => {
    refs.invites = [acceptedInvite('mate@x.com')]
    expect(await resolvePageAccess({ pageId: 'p1', userId: 'mate-2', userEmail: null })).toBeNull()
  })

  it('allocates the oldest three accepted seats on Pro and denies the fourth', async () => {
    usePlan('pro')
    refs.invites = [
      acceptedInvite('first@x.com', 'editor', 1),
      acceptedInvite('second@x.com', 'editor', 2),
      acceptedInvite('third@x.com', 'editor', 3),
      acceptedInvite('fourth@x.com', 'editor', 4),
    ]

    await expect(resolvePageAccess({
      pageId: 'p1',
      userId: 'third-user',
      userEmail: 'third@x.com',
      userEmailConfirmedAt: CONFIRMED,
      requireEditor: true,
    })).resolves.toMatchObject({ role: 'editor' })
    await expect(resolvePageAccess({
      pageId: 'p1',
      userId: 'fourth-user',
      userEmail: 'fourth@x.com',
      userEmailConfirmedAt: CONFIRMED,
      requireEditor: true,
    })).resolves.toBeNull()
  })

  it('does not limit accepted seats for Enterprise (null means unlimited)', async () => {
    usePlan('enterprise')
    refs.invites = Array.from({ length: 20 }, (_, index) => (
      acceptedInvite(`member-${index + 1}@x.com`, 'editor', index + 1)
    ))

    await expect(resolvePageAccess({
      pageId: 'p1',
      userId: 'member-20',
      userEmail: 'member-20@x.com',
      userEmailConfirmedAt: CONFIRMED,
      requireEditor: true,
    })).resolves.toMatchObject({ role: 'editor' })
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

  it('fails closed when the page or allocated-invite query errors', async () => {
    // Even if a malformed/mock response carries data alongside an error, the
    // authorization decision must honor the error and deny.
    refs.page = { id: 'p1', owner_id: 'owner-1' }
    refs.pageError = { code: '08006', message: 'connection failure' }
    await expect(resolvePageAccess({
      pageId: 'p1',
      userId: 'mate-2',
      userEmail: 'mate@x.com',
      userEmailConfirmedAt: CONFIRMED,
    })).resolves.toBeNull()

    refs.page = { id: 'p1', owner_id: 'owner-1' }
    refs.pageError = null
    refs.invites = [acceptedInvite('mate@x.com')]
    refs.inviteError = { code: '42501', message: 'permission denied' }
    await expect(resolvePageAccess({
      pageId: 'p1',
      userId: 'mate-2',
      userEmail: 'mate@x.com',
      userEmailConfirmedAt: CONFIRMED,
    })).resolves.toBeNull()
  })

  it('queries accepted invitations in allocation order and applies the finite seat limit', async () => {
    refs.invites = [acceptedInvite('mate@x.com')]
    let captured: QueryContext | null = null
    const { createAdminClient } = await import('../../utils/supabase/admin')
    vi.mocked(createAdminClient).mockReturnValueOnce(
      createSupabaseMock((ctx: QueryContext) => {
        if (ctx.table === 'pages') return { data: refs.page, error: null }
        if (ctx.table === 'team_invites') {
          captured = ctx
          return { data: refs.invites, error: null }
        }
        return { data: null, error: null }
      }) as any,
    )
    await resolvePageAccess({ pageId: 'p1', userId: 'mate-2', userEmail: '  MATE@X.com ', userEmailConfirmedAt: CONFIRMED, requireEditor: true })
    expect(captured!.eqs.owner_id).toBe('owner-1')
    expect(captured!.eqs.status).toBe('accepted') // pending no longer grants access
    expect(captured!.eqs.email).toBeUndefined() // match only inside the allocated oldest-N set
    expect(captured!.calls).toEqual(expect.arrayContaining([
      ['order', 'created_at', { ascending: true }],
      ['order', 'id', { ascending: true }],
      ['limit', 3],
    ]))
  })
})

describe('resolveFeatureOwner', () => {
  beforeEach(() => {
    refs.hasEnv = true
    refs.page = { id: 'p1', owner_id: 'owner-1' }
    refs.pageError = null
    refs.invites = []
    refs.inviteError = null
    usePlan('pro')
  })

  it('self-gates the caller when NO pageId (create/sandbox flow) - never touches admin', async () => {
    const r = await resolveFeatureOwner({ pageId: undefined, userId: 'u-self', userEmail: 'u@x.com' })
    expect(r).toEqual({ ok: true, ownerId: 'u-self', pageId: null, scoped: false, role: 'owner' })
  })

  it('scopes to the page OWNER for a confirmed editor collaborator (gate runs as the owner)', async () => {
    refs.invites = [acceptedInvite('mate@x.com')]
    const r = await resolveFeatureOwner({ pageId: 'p1', userId: 'mate-2', userEmail: 'mate@x.com', userEmailConfirmedAt: CONFIRMED })
    expect(r).toEqual({ ok: true, ownerId: 'owner-1', pageId: 'p1', scoped: true, role: 'editor' })
  })

  it('403s a previously accepted editor after the owner loses team collaboration', async () => {
    usePlan('free')
    refs.invites = [acceptedInvite('mate@x.com')]
    const r = await resolveFeatureOwner({ pageId: 'p1', userId: 'mate-2', userEmail: 'mate@x.com', userEmailConfirmedAt: CONFIRMED })
    expect(r).toEqual({ ok: false, status: 403 })
  })

  it('grants the page owner directly (scoped, owner role)', async () => {
    const r = await resolveFeatureOwner({ pageId: 'p1', userId: 'owner-1', userEmail: 'owner@x.com' })
    expect(r).toEqual({ ok: true, ownerId: 'owner-1', pageId: 'p1', scoped: true, role: 'owner' })
  })

  it('403 for a stranger who supplies a pageId', async () => {
    refs.invites = []
    expect(await resolveFeatureOwner({ pageId: 'p1', userId: 'stranger', userEmail: 's@x.com', userEmailConfirmedAt: CONFIRMED })).toEqual({ ok: false, status: 403 })
  })

  it('403 for an editor invitee with an UNCONFIRMED email (hardening a)', async () => {
    refs.invites = [acceptedInvite('mate@x.com')]
    expect(await resolveFeatureOwner({ pageId: 'p1', userId: 'mate-2', userEmail: 'mate@x.com', userEmailConfirmedAt: null })).toEqual({ ok: false, status: 403 })
  })

  it('403 rejects a viewer (requireEditor defaults to true for feature routes)', async () => {
    refs.invites = [acceptedInvite('v@x.com', 'viewer')]
    expect(await resolveFeatureOwner({ pageId: 'p1', userId: 'v-3', userEmail: 'v@x.com', userEmailConfirmedAt: CONFIRMED })).toEqual({ ok: false, status: 403 })
  })

  it('503 when a pageId is supplied but the service-role env is missing', async () => {
    refs.hasEnv = false
    expect(await resolveFeatureOwner({ pageId: 'p1', userId: 'mate-2', userEmail: 'mate@x.com', userEmailConfirmedAt: CONFIRMED })).toEqual({ ok: false, status: 503 })
  })
})
