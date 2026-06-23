import { describe, it, expect, vi, beforeEach } from 'vitest'

const { adminRef } = vi.hoisted(() => ({
  adminRef: {
    ops: [] as any[],
    deletedUser: null as string | null,
    deleteUserError: null as any,
    hasEnv: true,
    // When true, the seller-signal check (select on 'pages') reports a row → account is a seller.
    isSeller: false,
    // When true, the seller-signal select returns an error (to test the fail-safe path).
    signalError: false,
  },
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
        // accountIsSeller(): select('owner_id').eq(...).limit(1) → row iff isSeller + signal table.
        select: (_cols: string) => ({
          eq: (_by: string, val: unknown) => ({
            limit: (_n: number) =>
              Promise.resolve(
                adminRef.signalError
                  ? { data: null, error: { message: 'signal check failed' } }
                  : { data: adminRef.isSeller && table === 'pages' ? [{ owner_id: val }] : [], error: null },
              ),
          }),
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
  adminRef.isSeller = false
  adminRef.signalError = false
})

describe('deleteUserAccount — facet-aware (Nexxi buyer vs Nexez seller)', () => {
  it('PURE BUYER: clears the buyer facet, deletes seller/account tables, and deletes the auth user', async () => {
    const result = await deleteUserAccount('user-1', 'Buyer@Acme.com')
    expect(result.ok).toBe(true)
    expect(result.authUserDeleted).toBe(true)
    expect(result.sellerRetained).toBe(false)
    expect(adminRef.deletedUser).toBe('user-1')

    for (const t of __DELETE_ACCOUNT_TABLES.BUYER_USER_ID_TABLES) {
      expect(adminRef.ops).toContainEqual({ op: 'delete', table: t, by: 'user_id', val: 'user-1' })
    }
    for (const t of __DELETE_ACCOUNT_TABLES.SELLER_USER_ID_TABLES) {
      expect(adminRef.ops).toContainEqual({ op: 'delete', table: t, by: 'user_id', val: 'user-1' })
    }
    for (const t of __DELETE_ACCOUNT_TABLES.SELLER_OWNER_ID_TABLES) {
      expect(adminRef.ops).toContainEqual({ op: 'delete', table: t, by: 'owner_id', val: 'user-1' })
    }
    // Buyer PII anonymized on sellers' records (checkout_orders incl. buyer_name + by reference).
    const ordersPatch = { buyer_email: null, buyer_name: null, buyer_reference: null }
    expect(adminRef.ops).toContainEqual({ op: 'update', table: 'checkout_orders', patch: ordersPatch, by: 'buyer_reference', val: 'user-1' })
  })

  it('SELLER who also buys: clears the buyer facet + anonymizes PII, but KEEPS seller data and the login', async () => {
    adminRef.isSeller = true
    const result = await deleteUserAccount('user-2', 'seller@acme.com')
    expect(result.ok).toBe(true)
    expect(result.sellerRetained).toBe(true)
    expect(result.authUserDeleted).toBe(false)
    expect(adminRef.deletedUser).toBeNull() // the auth user (login) is NEVER deleted for a seller

    // Buyer facet still cleared...
    for (const t of __DELETE_ACCOUNT_TABLES.BUYER_USER_ID_TABLES) {
      expect(adminRef.ops).toContainEqual({ op: 'delete', table: t, by: 'user_id', val: 'user-2' })
    }
    // ...and buyer PII anonymized (runs in both branches)...
    expect(adminRef.ops.some((o) => o.op === 'update' && o.table === 'agent_negotiations')).toBe(true)
    // ...but NO seller table is deleted (the business survives).
    for (const t of [...__DELETE_ACCOUNT_TABLES.SELLER_OWNER_ID_TABLES, ...__DELETE_ACCOUNT_TABLES.SELLER_USER_ID_TABLES]) {
      expect(adminRef.ops.some((o) => o.op === 'delete' && o.table === t)).toBe(false)
    }
  })

  it('fails SAFE: if the seller-signal check errors, retain the account (never cascade-delete a business)', async () => {
    adminRef.signalError = true
    const result = await deleteUserAccount('user-3', 'x@y.com')
    expect(result.sellerRetained).toBe(true)
    expect(result.authUserDeleted).toBe(false)
    expect(adminRef.deletedUser).toBeNull()
    // Buyer facet was still cleared before the (failed) signal check.
    expect(adminRef.ops.some((o) => o.op === 'delete' && o.table === 'user_agents')).toBe(true)
  })

  it('reports not-ok when the auth user deletion fails (pure buyer)', async () => {
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
    expect(result.sellerRetained).toBe(false)
  })
})
