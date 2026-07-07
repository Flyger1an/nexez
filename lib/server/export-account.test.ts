import { describe, it, expect, vi, beforeEach } from 'vitest'

const { adminRef } = vi.hoisted(() => ({
  adminRef: { ops: [] as any[], hasEnv: true },
}))

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => adminRef.hasEnv,
  createAdminClient: () => ({
    from: (table: string) => ({
      select: (cols: string) => {
        const mk = (by: string, val: unknown) => {
          const rec: any = { table, by, val, cols }
          adminRef.ops.push(rec)
          const result = Promise.resolve({ data: [], error: null })
          return {
            limit: (n: number) => {
              rec.limit = n
              return result
            },
            then: (res: any, rej: any) => result.then(res, rej),
          }
        }
        return { eq: (by: string, val: unknown) => mk(by, val), ilike: (by: string, val: unknown) => mk(by, val) }
      },
    }),
  }),
}))

import { exportUserAccount, __EXPORT_ACCOUNT_TABLES } from './export-account'

beforeEach(() => {
  adminRef.ops = []
  adminRef.hasEnv = true
})

describe('exportUserAccount', () => {
  it('queries every user_id/owner_id/buyer table, keys buyer rows _as_buyer, and never leaks secrets', async () => {
    const result = await exportUserAccount('user-1', 'Buyer@Acme.com', 'TS')
    expect(result).not.toBeNull()
    expect(result!.account).toEqual({ id: 'user-1', email: 'Buyer@Acme.com', exportedAt: 'TS' })

    for (const t of __EXPORT_ACCOUNT_TABLES.USER_ID_TABLES) {
      expect(adminRef.ops).toContainEqual(expect.objectContaining({ table: t, by: 'user_id', val: 'user-1' }))
    }
    for (const t of __EXPORT_ACCOUNT_TABLES.OWNER_ID_TABLES) {
      expect(adminRef.ops).toContainEqual(expect.objectContaining({ table: t, by: 'owner_id', val: 'user-1' }))
    }
    for (const t of __EXPORT_ACCOUNT_TABLES.BUYER_EMAIL_TABLES) {
      expect(adminRef.ops).toContainEqual(expect.objectContaining({ table: t, by: 'buyer_email', val: 'Buyer@Acme.com' }))
      expect(result!.data).toHaveProperty(`${t}_as_buyer`)
    }

    // api_keys metadata only - never the hash.
    const keyOp = adminRef.ops.find((o) => o.table === 'api_keys')
    expect(keyOp).toBeTruthy()
    expect(keyOp.cols).not.toMatch(/key_hash/)
    expect(keyOp.cols).toMatch(/name/)

    // page_secrets is never queried.
    expect(adminRef.ops.some((o) => o.table === 'page_secrets')).toBe(false)
  })

  it('skips buyer-email queries when no email is present', async () => {
    await exportUserAccount('user-1', null, 'TS')
    expect(adminRef.ops.some((o) => o.by === 'buyer_email')).toBe(false)
  })

  it('returns null without the service role', async () => {
    adminRef.hasEnv = false
    expect(await exportUserAccount('user-1', 'x@y.com', 'TS')).toBeNull()
  })
})
