import { beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({
  adminReady: true,
  ownerEmail: 'owner@example.com' as string | null,
  lookupError: null as Error | null,
}))

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => refs.adminReady),
  createAdminClient: vi.fn(() => ({
    auth: {
      admin: {
        getUserById: vi.fn(async () => {
          if (refs.lookupError) throw refs.lookupError
          return { data: { user: refs.ownerEmail ? { email: refs.ownerEmail } : null } }
        }),
      },
    },
  })),
}))

import { resolveOwnerNotifyEmail } from './owner-email'

describe('resolveOwnerNotifyEmail', () => {
  beforeEach(() => {
    refs.adminReady = true
    refs.ownerEmail = 'owner@example.com'
    refs.lookupError = null
  })

  it('routes private seller operations to the verified owner account before the public listing contact', async () => {
    await expect(resolveOwnerNotifyEmail({
      ownerId: 'owner-1',
      contactEmail: 'public-contact@example.com',
    })).resolves.toBe('owner@example.com')
  })

  it('falls back to the listing contact when the owner account cannot be resolved', async () => {
    refs.ownerEmail = null
    await expect(resolveOwnerNotifyEmail({
      ownerId: 'owner-1',
      contactEmail: ' public-contact@example.com ',
    })).resolves.toBe('public-contact@example.com')
  })

  it('falls back to the listing contact when the admin lookup is unavailable', async () => {
    refs.adminReady = false
    await expect(resolveOwnerNotifyEmail({
      ownerId: 'owner-1',
      contactEmail: 'public-contact@example.com',
    })).resolves.toBe('public-contact@example.com')
  })

  it('falls back safely when the owner lookup throws', async () => {
    refs.lookupError = new Error('lookup unavailable')
    await expect(resolveOwnerNotifyEmail({
      ownerId: 'owner-1',
      contactEmail: 'public-contact@example.com',
    })).resolves.toBe('public-contact@example.com')
  })

  it('returns null only when neither private nor fallback delivery is possible', async () => {
    refs.adminReady = false
    await expect(resolveOwnerNotifyEmail({ ownerId: 'owner-1', contactEmail: null })).resolves.toBeNull()
  })
})
