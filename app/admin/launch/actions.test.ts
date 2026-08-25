import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdmin = vi.hoisted(() => vi.fn(async () => ({ id: 'admin-1', email: 'operator@nexez.ai' })))
const recordDecision = vi.hoisted(() => vi.fn(async () => ({
  replayed: false,
  record: { id: 1 },
})))
const revalidate = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: revalidate }))
vi.mock('../../../lib/server/admin-access', () => ({ requirePlatformAdmin: requireAdmin }))
vi.mock('../../../lib/server/launch-decision', () => ({ recordLaunchDecision: recordDecision }))

import { recordLaunchDecisionAction } from './actions'

const TOKEN = 'd2000000-0000-4000-8000-000000000001'

describe('recordLaunchDecisionAction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('authorizes and sends only the operator-owned launch decision fields', async () => {
    const form = new FormData()
    form.set('decision', 'go')
    form.set('reason', '  Approved for the launch window.  ')
    form.set('idempotencyToken', TOKEN)

    await expect(recordLaunchDecisionAction({ ok: false, message: '' }, form)).resolves.toEqual({
      ok: true,
      message: 'Go decision recorded.',
      completedToken: TOKEN,
    })
    expect(requireAdmin).toHaveBeenCalledWith('/admin/launch')
    expect(recordDecision).toHaveBeenCalledWith({
      decision: 'go',
      reason: 'Approved for the launch window.',
      idempotencyKey: TOKEN,
      operatorId: 'admin-1',
      operatorEmail: 'operator@nexez.ai',
    })
    expect(revalidate).toHaveBeenCalledWith('/admin/launch')
    expect(revalidate).toHaveBeenCalledWith('/admin/audit')
  })

  it('rejects malformed decisions before touching the ledger', async () => {
    const form = new FormData()
    form.set('decision', 'deploy')
    form.set('reason', 'Ship it.')
    form.set('idempotencyToken', TOKEN)

    await expect(recordLaunchDecisionAction({ ok: false, message: '' }, form)).resolves.toEqual({
      ok: false,
      message: 'Choose go or hold.',
    })
    expect(recordDecision).not.toHaveBeenCalled()
  })

  it('does not accept a browser-supplied operator identity or launch evidence', async () => {
    const form = new FormData()
    form.set('decision', 'hold')
    form.set('reason', 'Waiting for support delivery proof.')
    form.set('idempotencyToken', TOKEN)
    form.set('operatorEmail', 'attacker@example.com')
    form.set('launchScore', '100')

    await recordLaunchDecisionAction({ ok: false, message: '' }, form)

    expect(recordDecision).toHaveBeenCalledWith(expect.not.objectContaining({
      operatorEmail: 'attacker@example.com',
      launchScore: 100,
    }))
  })
})
