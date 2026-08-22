import { describe, it, expect, vi, beforeEach } from 'vitest'

const { adminRef } = vi.hoisted(() => ({
  adminRef: {
    ops: [] as any[],
    deletedUser: null as string | null,
    deleteUserError: null as any,
    operationErrorTable: '' as string,
    hasEnv: true,
    // When true, the seller-signal check (select on 'pages') reports a row → account is a seller.
    isSeller: false,
    sellerSignalTable: 'pages',
    // When true, the seller-signal select returns an error (to test the fail-safe path).
    signalError: false,
    // Negotiation ids the buyer's email/contact resolves to (for the negotiation_messages erasure).
    negIds: [] as string[],
    privacyRows: {} as Record<string, Array<Record<string, unknown>>>,
  },
}))

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => adminRef.hasEnv,
  createAdminClient: () => {
    const done = (rec: any) => {
      adminRef.ops.push(rec)
      return Promise.resolve({
        error: adminRef.operationErrorTable === rec.table ? { message: `${rec.table} unavailable` } : null,
      })
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
          // negotiation_messages erasure: update({content}).in('negotiation_id', ids).eq('role','buyer')
          in: (by: string, vals: unknown) => ({
            eq: (col: string, cval: unknown) => done({ op: 'update', table, patch, in: { by, vals }, eq: { col, cval } }),
          }),
        }),
        select: (cols: string) => {
          const rec: any = { op: 'select', table, cols }
          const resolve = () => {
            if (cols === 'owner_id') {
              return adminRef.signalError
                ? Promise.resolve({ data: null, error: { message: 'signal check failed' } })
                : Promise.resolve({
                    data: adminRef.isSeller && table === adminRef.sellerSignalTable
                      ? [{ owner_id: rec.val }]
                      : [],
                    error: null,
                  })
            }
            if (cols === 'id' && table === 'agent_negotiations') {
              return Promise.resolve({ data: adminRef.negIds.map((id) => ({ id })), error: null })
            }
            return Promise.resolve({ data: adminRef.privacyRows[table] ?? [], error: null })
          }
          const chain: any = {
            eq: (by: string, val: unknown) => {
              rec.by = by
              rec.val = val
              return chain
            },
            ilike: (by: string, val: unknown) => {
              rec.by = by
              rec.val = val
              return chain
            },
            order: () => chain,
            range: () => chain,
            limit: () => chain,
            then: (res: any, rej: any) => resolve().then(res, rej),
          }
          return chain
        },
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
  adminRef.operationErrorTable = ''
  adminRef.hasEnv = true
  adminRef.isSeller = false
  adminRef.sellerSignalTable = 'pages'
  adminRef.signalError = false
  adminRef.negIds = []
  adminRef.privacyRows = {}
})

describe('deleteUserAccount - facet-aware (Nexxi buyer vs Nexez seller)', () => {
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
    // Buyer PII anonymized on sellers' records (checkout_orders incl. buyer_name/buyer_agent + by reference).
    const ordersPatch = { buyer_email: null, buyer_name: null, buyer_reference: null, buyer_agent: null }
    expect(adminRef.ops).toContainEqual({ op: 'update', table: 'checkout_orders', patch: ordersPatch, by: 'buyer_reference', val: 'user-1' })
  })

  it('anonymizes agreement snapshots and checkout-session identity through the shared manifest', async () => {
    adminRef.privacyRows = {
      service_agreements: [{
        id: 'service-1',
        contract_snapshot: {
          terms: { paymentModel: 'fixed-per-period' },
          configuration: { address: '1 Private Way' },
        },
      }],
      staged_settlement_agreements: [{
        id: 'staged-1',
        contract_snapshot: { settlement: { totalAmount: 1000 }, offerConfiguration: { note: 'Private' } },
      }],
      checkout_sessions: [{
        id: 'session-1',
        buyer: { email: 'buyer@acme.com', name: 'Buyer', reference: 'user-1', locale: 'en-US' },
      }],
    }

    await deleteUserAccount('user-1', 'Buyer@Acme.com')

    expect(adminRef.ops).toContainEqual(expect.objectContaining({
      op: 'update',
      table: 'service_agreements',
      by: 'id',
      val: 'service-1',
      patch: expect.objectContaining({
        buyer_email: null,
        buyer_name: null,
        buyer_reference: null,
        buyer_agent: null,
        contract_snapshot: {
          terms: { paymentModel: 'fixed-per-period' },
          configuration: {},
        },
      }),
    }))
    expect(adminRef.ops).toContainEqual(expect.objectContaining({
      op: 'update',
      table: 'staged_settlement_agreements',
      by: 'id',
      val: 'staged-1',
      patch: expect.objectContaining({
        contract_snapshot: { settlement: { totalAmount: 1000 }, offerConfiguration: {} },
      }),
    }))
    expect(adminRef.ops).toContainEqual({
      op: 'update',
      table: 'checkout_sessions',
      by: 'id',
      val: 'session-1',
      patch: { buyer: { locale: 'en-US' } },
    })
  })

  it('erases the buyer\'s own chat turns from sellers\' negotiation threads (GDPR)', async () => {
    adminRef.negIds = ['neg-1', 'neg-2']
    await deleteUserAccount('user-1', 'Buyer@Acme.com')
    // negotiation_messages.content nulled for role=buyer on the buyer's negotiations.
    expect(adminRef.ops).toContainEqual({
      op: 'update',
      table: 'negotiation_messages',
      patch: { content: {} },
      in: { by: 'negotiation_id', vals: ['neg-1', 'neg-2'] },
      eq: { col: 'role', cval: 'buyer' },
    })
  })

  it('erases buyer chat in the SELLER-retained branch too (anonymizer runs in both)', async () => {
    adminRef.isSeller = true
    adminRef.negIds = ['neg-9']
    const result = await deleteUserAccount('user-2', 'seller@acme.com')
    expect(result.sellerRetained).toBe(true)
    expect(adminRef.ops.some((o) => o.op === 'update' && o.table === 'negotiation_messages')).toBe(true)
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

  it('treats an orphaned-page agreement as retained seller data', async () => {
    adminRef.isSeller = true
    adminRef.sellerSignalTable = 'service_agreements'
    const result = await deleteUserAccount('user-2', 'seller@acme.com')

    expect(result.sellerRetained).toBe(true)
    expect(result.authUserDeleted).toBe(false)
    expect(adminRef.deletedUser).toBeNull()
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

  it('keeps the auth user when buyer anonymization is incomplete so erasure can be retried', async () => {
    adminRef.operationErrorTable = 'checkout_orders'
    const result = await deleteUserAccount('user-1', 'x@y.com')

    expect(result.ok).toBe(false)
    expect(result.authUserDeleted).toBe(false)
    expect(adminRef.deletedUser).toBeNull()
    expect(result.errors).toContainEqual({
      scope: 'anonymize:checkout_orders:buyer_reference',
      message: 'checkout_orders unavailable',
    })
  })

  it('503-style guard: returns not-ok without the service role', async () => {
    adminRef.hasEnv = false
    const result = await deleteUserAccount('user-1', 'x@y.com')
    expect(result.ok).toBe(false)
    expect(result.authUserDeleted).toBe(false)
    expect(result.sellerRetained).toBe(false)
  })
})
