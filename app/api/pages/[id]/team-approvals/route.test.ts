import { beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({
  user: { id: 'owner-1', email: 'owner@example.test', email_confirmed_at: '2026-01-01' } as any,
  access: { pageId: 'page-1', ownerId: 'owner-1', role: 'owner' } as any,
  allowed: true,
  row: {
    id: 'page-1',
    team_collaboration: { approvals: [] },
    updated_at: '2026-08-22T00:00:00Z',
  } as any,
  updateArg: null as any,
  saveError: null as any,
  saveReturnsRow: true,
}))

vi.mock('../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({})) }))
vi.mock('../../../../../utils/supabase/server', () => ({
  createClient: vi.fn(() => ({ auth: { getUser: async () => ({ data: { user: refs.user } }) } })),
}))
vi.mock('../../../../../lib/server/page-access', () => ({
  resolvePageAccess: vi.fn(async () => refs.access),
}))
vi.mock('../../../../../lib/server/plan', () => ({
  ownerAllows: vi.fn(async () => refs.allowed),
}))
vi.mock('../../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: refs.row, error: null }) }),
      }),
      update: (value: unknown) => {
        refs.updateArg = value
        return {
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: refs.saveReturnsRow ? { team_collaboration: refs.updateArg.team_collaboration } : null,
                  error: refs.saveError,
                }),
              }),
            }),
          }),
        }
      },
    }),
  })),
}))

import { POST } from './route'
import { ownerAllows } from '../../../../../lib/server/plan'

const params = Promise.resolve({ id: 'page-1' })
const post = (body: unknown) => new Request('https://nexez.app/api/pages/page-1/team-approvals', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

describe('POST /api/pages/[id]/team-approvals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.user = { id: 'owner-1', email: 'owner@example.test', email_confirmed_at: '2026-01-01' }
    refs.access = { pageId: 'page-1', ownerId: 'owner-1', role: 'owner' }
    refs.allowed = true
    refs.row = { id: 'page-1', team_collaboration: { approvals: [] }, updated_at: '2026-08-22T00:00:00Z' }
    refs.updateArg = null
    refs.saveError = null
    refs.saveReturnsRow = true
  })

  it('constructs a pending approval on the server after checking the page owner', async () => {
    refs.user = { id: 'editor-1', email: 'editor@example.test', email_confirmed_at: '2026-01-01' }
    refs.access = { pageId: 'page-1', ownerId: 'owner-1', role: 'editor' }

    const response = await POST(post({
      action: 'request',
      note: 'Review pricing',
      approvals: [{ id: 'attacker-authored' }],
    }), { params })

    expect(response.status).toBe(200)
    expect(ownerAllows).toHaveBeenCalledWith(expect.anything(), 'owner-1', 'teamCollaboration')
    expect(refs.updateArg.team_collaboration.approvals).toEqual([
      expect.objectContaining({ approver: 'editor', status: 'pending', note: 'Review pricing' }),
    ])
    expect(refs.updateArg.team_collaboration.approvals[0].id).not.toBe('attacker-authored')
  })

  it('blocks request and approval execution after a live downgrade', async () => {
    refs.allowed = false
    for (const action of ['request', 'approve_all'] as const) {
      const response = await POST(post({ action }), { params })
      expect(response.status).toBe(402)
      expect(await response.json()).toMatchObject({ code: 'plan_upgrade_required', upgrade: 'pro' })
      expect(refs.updateArg).toBeNull()
    }
  })

  it('keeps owner cleanup available after downgrade', async () => {
    refs.allowed = false
    refs.row.team_collaboration = {
      approvals: [{ id: 'old', approver: 'owner', status: 'pending', ts: '2026-01-01' }],
      retained: true,
    }

    const response = await POST(post({ action: 'clear' }), { params })

    expect(response.status).toBe(200)
    expect(ownerAllows).not.toHaveBeenCalled()
    expect(refs.updateArg.team_collaboration).toEqual({ approvals: [], retained: true })
  })

  it('allows editors to request review but not approve or clear owner history', async () => {
    refs.access = { pageId: 'page-1', ownerId: 'owner-1', role: 'editor' }
    for (const action of ['approve_all', 'clear'] as const) {
      expect((await POST(post({ action }), { params })).status).toBe(403)
    }
    expect(refs.updateArg).toBeNull()
  })

  it('returns a conflict instead of overwriting a concurrent page change', async () => {
    refs.saveReturnsRow = false
    const response = await POST(post({ action: 'request' }), { params })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'approval_conflict' })
  })
})
