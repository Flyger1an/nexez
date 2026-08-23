// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../test/dom'
import { ApiKeysManager } from './ApiKeysManager'

const refs = vi.hoisted(() => ({
  keys: [] as Array<{
    id: string
    name: string
    prefix: string
    last_used_at: string | null
    revoked_at: string | null
    created_at: string
  }>,
  updates: [] as Array<{ id: string; value: Record<string, unknown> }>,
}))

vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'owner-1' } } })) },
    from: () => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        returns: async () => ({ data: refs.keys, error: null }),
        update: (value: Record<string, unknown>) => ({
          eq: async (_column: string, id: string) => {
            refs.updates.push({ id, value })
            refs.keys = refs.keys.map((key) => key.id === id
              ? { ...key, revoked_at: String(value.revoked_at) }
              : key)
            return { error: null }
          },
        }),
      }
      return builder
    },
  }),
}))

describe('ApiKeysManager downgrade cleanup', () => {
  beforeEach(() => {
    refs.keys = [{
      id: 'key-1',
      name: 'Retained automation',
      prefix: 'nxz_live_retained',
      last_used_at: null,
      revoked_at: null,
      created_at: '2026-08-21T00:00:00.000Z',
    }]
    refs.updates = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('hides key generation below Pro while keeping retained-key revocation available', async () => {
    render(<ApiKeysManager currentPlan="free" />)

    expect(await screen.findByText('Retained automation')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Generate key' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Upgrade to Pro' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))

    await waitFor(() => expect(refs.updates).toHaveLength(1))
    expect(refs.updates[0].id).toBe('key-1')
    expect(refs.updates[0].value.revoked_at).toEqual(expect.any(String))
  })

  it('shows generation controls on Pro', async () => {
    render(<ApiKeysManager currentPlan="pro" />)

    expect(await screen.findByRole('button', { name: 'Generate key' })).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Upgrade to Pro' })).not.toBeInTheDocument()
  })
})
