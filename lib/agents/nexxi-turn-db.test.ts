import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createNexxiTurnDb } from './nexxi-turn-db'

function fakeClient(source: string) {
  const from = vi.fn((relation: string) => ({ source, relation }))
  const marker = vi.fn(function (this: { source: string }) {
    return this.source
  })
  return {
    client: { source, from, marker } as unknown as SupabaseClient,
    from,
    marker,
  }
}

describe('createNexxiTurnDb', () => {
  it('keeps normal buyer data on the user-scoped client', () => {
    const user = fakeClient('user')
    const admin = fakeClient('admin')
    const approvalFactory = vi.fn(() => admin.client)
    const db = createNexxiTurnDb(user.client, approvalFactory)

    expect((db.from('pages') as unknown as { source: string; relation: string })).toEqual({
      source: 'user',
      relation: 'pages',
    })
    expect(user.from).toHaveBeenCalledWith('pages')
    expect(admin.from).not.toHaveBeenCalled()
    expect(approvalFactory).not.toHaveBeenCalled()
  })

  it('uses one lazy server-only client for the approval ledger', () => {
    const user = fakeClient('user')
    const admin = fakeClient('admin')
    const approvalFactory = vi.fn(() => admin.client)
    const db = createNexxiTurnDb(user.client, approvalFactory)

    expect((db.from('agent_action_approvals') as unknown as { source: string })).toEqual({
      source: 'admin',
      relation: 'agent_action_approvals',
    })
    db.from('agent_action_approvals')

    expect(approvalFactory).toHaveBeenCalledTimes(1)
    expect(admin.from).toHaveBeenCalledTimes(2)
    expect(user.from).not.toHaveBeenCalledWith('agent_action_approvals')
  })

  it('preserves method binding for the underlying user client', () => {
    const user = fakeClient('user')
    const db = createNexxiTurnDb(user.client, () => fakeClient('admin').client)

    expect((db as unknown as { marker: () => string }).marker()).toBe('user')
    expect(user.marker).toHaveBeenCalledOnce()
  })
})
