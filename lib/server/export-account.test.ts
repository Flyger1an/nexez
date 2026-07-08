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
          const chain: any = {
            limit: (n: number) => {
              rec.limit = n
              return chain
            },
            eq: (k: string, v: unknown) => {
              rec.extraEq = [k, v]
              return chain
            },
            in: (k: string, v: unknown) => {
              rec.in = [k, v]
              return chain
            },
            then: (res: any, rej: any) => result.then(res, rej),
          }
          return chain
        }
        return {
          eq: (by: string, val: unknown) => mk(by, val),
          ilike: (by: string, val: unknown) => mk(by, val),
          or: (filter: string) => mk('or', filter),
          in: (by: string, val: unknown) => mk(by, val),
        }
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
  it('covers both facets, attributes every key, and never leaks secrets', async () => {
    const result = await exportUserAccount('user-1', 'Buyer@Acme.com', 'TS')
    expect(result).not.toBeNull()
    expect(result!.account).toEqual({ id: 'user-1', email: 'Buyer@Acme.com', exportedAt: 'TS' })

    for (const t of __EXPORT_ACCOUNT_TABLES.BUYER_USER_ID_TABLES) {
      expect(adminRef.ops).toContainEqual(expect.objectContaining({ table: t, by: 'user_id', val: 'user-1' }))
      expect(result!.facets.buyer).toContain(t)
    }
    for (const t of __EXPORT_ACCOUNT_TABLES.SELLER_OWNER_ID_TABLES) {
      expect(adminRef.ops).toContainEqual(expect.objectContaining({ table: t, by: 'owner_id', val: 'user-1' }))
      expect(result!.facets.seller).toContain(t)
    }
    for (const t of __EXPORT_ACCOUNT_TABLES.BUYER_EMAIL_TABLES) {
      expect(adminRef.ops).toContainEqual(expect.objectContaining({ table: t, by: 'buyer_email', val: 'Buyer@Acme.com' }))
      expect(result!.data).toHaveProperty(`${t}_as_buyer`)
    }

    // Every data key is facet-attributed - nothing "mixed".
    const attributed = new Set([...result!.facets.buyer, ...result!.facets.seller, ...result!.facets.account])
    for (const key of Object.keys(result!.data)) expect(attributed.has(key)).toBe(true)

    // The deletion-parity keys exist (deletion touches them -> export returns them).
    expect(result!.data).toHaveProperty('negotiation_messages_as_buyer')
    expect(result!.data).toHaveProperty('team_invites_as_invitee')
    expect(result!.data).toHaveProperty('referrals_as_referrer')
    expect(result!.data).toHaveProperty('referrals_as_referred')
    expect(result!.facets.seller).toContain('intake_sessions')
    expect(result!.facets.seller).toContain('storefronts')

    // api_keys metadata only - never the hash.
    const keyOp = adminRef.ops.find((o) => o.table === 'api_keys')
    expect(keyOp).toBeTruthy()
    expect(keyOp.cols).not.toMatch(/key_hash/)
    expect(keyOp.cols).toMatch(/name/)

    // page_secrets is never queried.
    expect(adminRef.ops.some((o) => o.table === 'page_secrets')).toBe(false)
  })

  it('LIKE-escapes the email in the buyer-transcript negotiation match', async () => {
    await exportUserAccount('user-1', 'a_b%c@acme.com', 'TS')
    const orOp = adminRef.ops.find((o) => o.table === 'agent_negotiations' && o.by === 'or')
    expect(orOp).toBeTruthy()
    expect(orOp.val).toContain('a\\_b\\%c@acme.com')
  })

  it('skips buyer-email queries when no email is present', async () => {
    await exportUserAccount('user-1', null, 'TS')
    expect(adminRef.ops.some((o) => o.by === 'buyer_email')).toBe(false)
    expect(adminRef.ops.some((o) => o.table === 'negotiation_messages')).toBe(false)
  })

  it('returns null without the service role', async () => {
    adminRef.hasEnv = false
    expect(await exportUserAccount('user-1', 'x@y.com', 'TS')).toBeNull()
  })
})
