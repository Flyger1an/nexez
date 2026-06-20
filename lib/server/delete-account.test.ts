import { describe, it, expect, vi, beforeEach } from 'vitest'

const { adminRef } = vi.hoisted(() => ({
  adminRef: { ops: [] as any[], deletedUser: null as string | null, deleteUserError: null as any, hasEnv: true },
}))

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => adminRef.hasEnv,
  createAdminClient: () => {
    const done = (rec: any) => {
      adminRef.ops.push(rec)
      return Promise.resolve({ error: null })
    }
    return {
      from: (table: string) => ({
        delete: () => ({
          eq: (by: string, val: unknown) => done({ op: 'delete', table, by, val }),
          ilike: (by: string, val: unknown) => done({ op: 'delete', table, by, val }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: (by: string, val: unknown) => done({ op: 'update', table, patch, by, val }),
          ilike: (by: string, val: unknown) => done({ op: 'update', table, patch, by, val }),
        }),
      }),
      auth: {
        admin: {
          deleteUser: vi.fn(async (id: string) => {
            adminRef.deletedUser = id
            return { error: adminRef.deleteUserError }
          }),
        },
      },
    }
  },
}))

import { deleteUserAccount, __DELETE_ACCOUNT_TABLES } from './delete-account'

beforeEach(() => {
  adminRef.ops = []
  adminRef.deletedUser = null
  adminRef.deleteUserError = null
  adminRef.hasEnv = true
})

describe('deleteUserAccount', () => {
  it('deletes every user_id + owner_id table, anonymizes buyer PII, then deletes the auth user', async () => {
    const result = await deleteUserAccount('user-1', 'Buyer@Acme.com')
    expect(result.ok).toBe(true)
    expect(result.authUserDeleted).toBe(true)
    expect(adminRef.deletedUser).toBe('user-1')

    // Every user_id table deleted by user_id.
    for (const t of __DELETE_ACCOUNT_TABLES.USER_ID_TABLES) {
      expect(adminRef.ops).toContainEqual({ op: 'delete', table: t, by: 'user_id', val: 'user-1' })
    }
    // Every owner_id table deleted by owner_id.
    for (const t of __DELETE_ACCOUNT_TABLES.OWNER_ID_TABLES) {
      expect(adminRef.ops).toContainEqual({ op: 'delete', table: t, by: 'owner_id', val: 'user-1' })
    }
    // Buyer PII anonymized (nulled) on sellers' records. checkout_orders includes buyer_name and is
    // matched by BOTH the strong reference (buyer_reference == userId) and the email.
    const ordersPatch = { buyer_email: null, buyer_name: null, buyer_reference: null }
    expect(adminRef.ops).toContainEqual({ op: 'update', table: 'checkout_orders', patch: ordersPatch, by: 'buyer_reference', val: 'user-1' })
    expect(adminRef.ops).toContainEqual({ op: 'update', table: 'checkout_orders', patch: ordersPatch, by: 'buyer_email', val: 'Buyer@Acme.com' })
    // agent_negotiations erases free-form buyer text (contact/buyer_query/...) and matches by both
    // buyer_email AND contact, so non-email contacts are still caught.
    const negPatch = { buyer_email: null, contact: null, buyer_query: null, budget_text: null, timeline_text: null }
    expect(adminRef.ops).toContainEqual({ op: 'update', table: 'agent_negotiations', patch: negPatch, by: 'buyer_email', val: 'Buyer@Acme.com' })
    expect(adminRef.ops).toContainEqual({ op: 'update', table: 'agent_negotiations', patch: negPatch, by: 'contact', val: 'Buyer@Acme.com' })
    // order_requests nulls the free-text message too.
    expect(adminRef.ops).toContainEqual({ op: 'update', table: 'order_requests', patch: { buyer_email: null, message: null }, by: 'buyer_email', val: 'Buyer@Acme.com' })
    // Received invites (keyed by email) removed too.
    expect(adminRef.ops).toContainEqual({ op: 'delete', table: 'team_invites', by: 'email', val: 'Buyer@Acme.com' })
  })

  it('reports not-ok when the auth user deletion fails', async () => {
    adminRef.deleteUserError = { message: 'nope' }
    const result = await deleteUserAccount('user-1', 'x@y.com')
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.scope === 'auth.deleteUser')).toBe(true)
  })

  it('503-style guard: returns not-ok without the service role', async () => {
    adminRef.hasEnv = false
    const result = await deleteUserAccount('user-1', 'x@y.com')
    expect(result.ok).toBe(false)
    expect(result.authUserDeleted).toBe(false)
  })
})
