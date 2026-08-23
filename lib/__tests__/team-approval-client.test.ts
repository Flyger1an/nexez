import { describe, expect, it, vi } from 'vitest'
import { mutateTeamApproval } from '../team-approval-client'

describe('mutateTeamApproval', () => {
  it('surfaces a live downgrade without constructing a local approval fallback', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: 'Team approvals are available on the Pro plan and above.',
      code: 'plan_upgrade_required',
    }), { status: 402 }))

    await expect(mutateTeamApproval({
      pageId: 'page-1',
      action: 'request',
      note: 'Review pricing',
      fetchImpl,
    })).rejects.toMatchObject({ status: 402, code: 'plan_upgrade_required' })

    expect(fetchImpl).toHaveBeenCalledWith('/api/pages/page-1/team-approvals', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ action: 'request', note: 'Review pricing' }),
    }))
  })

  it('returns only the server-authored collaboration value', async () => {
    const teamCollaboration = {
      approvals: [{ id: 'server-id', approver: 'editor', status: 'pending' as const, ts: '2026-08-22T00:00:00Z' }],
    }
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, teamCollaboration }), { status: 200 }))

    await expect(mutateTeamApproval({ pageId: 'page-1', action: 'request', fetchImpl }))
      .resolves.toEqual(teamCollaboration)
  })
})
