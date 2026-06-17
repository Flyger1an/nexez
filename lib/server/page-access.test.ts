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

import { resolvePageAccess } from './page-access'

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

  it('grants a non-revoked EDITOR collaborator', async () => {
    refs.invite = { role: 'editor', status: 'pending' }
    const a = await resolvePageAccess({ pageId: 'p1', userId: 'mate-2', userEmail: 'Mate@X.com', requireEditor: true })
    expect(a).toEqual({ pageId: 'p1', ownerId: 'owner-1', role: 'editor' })
  })

  it('grants a VIEWER for read, but REJECTS them when requireEditor', async () => {
    refs.invite = { role: 'viewer', status: 'accepted' }
    expect(await resolvePageAccess({ pageId: 'p1', userId: 'v-3', userEmail: 'v@x.com' })).toMatchObject({ role: 'viewer' })
    expect(await resolvePageAccess({ pageId: 'p1', userId: 'v-3', userEmail: 'v@x.com', requireEditor: true })).toBeNull()
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
    await resolvePageAccess({ pageId: 'p1', userId: 'mate-2', userEmail: '  MATE@X.com ', requireEditor: true })
    expect(captured!.eqs.owner_id).toBe('owner-1')
    expect(captured!.eqs.email).toBe('mate@x.com') // trimmed + lowercased
    expect(captured!.calls.some((c) => c[0] === 'neq' && c[1] === 'status' && c[2] === 'revoked')).toBe(true)
  })
})
