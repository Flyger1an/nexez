import { describe, it, expect, vi, beforeEach } from 'vitest'

const { adminRef } = vi.hoisted(() => ({
  adminRef: {
    ops: [] as any[],
    hasEnv: true,
    rows: {} as Record<string, unknown[]>,
    errorTable: '' as string,
  },
}))

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => adminRef.hasEnv,
  createAdminClient: () => ({
    from: (table: string) => ({
      select: (cols: string) => {
        const mk = (by: string, val: unknown) => {
          const rec: any = { table, by, val, cols }
          adminRef.ops.push(rec)
          const resolve = () => {
            if (adminRef.errorTable === table) {
              return Promise.resolve({ data: null, error: { message: `${table} unavailable` } })
            }
            const rows = adminRef.rows[table] ?? []
            const [from = 0, to = rows.length - 1] = rec.range ?? []
            return Promise.resolve({ data: rows.slice(from, to + 1), error: null })
          }
          const chain: any = {
            range: (from: number, to: number) => {
              rec.range = [from, to]
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
            order: (column: string, options: unknown) => {
              rec.order = [column, options]
              return chain
            },
            then: (res: any, rej: any) => resolve().then(res, rej),
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
  adminRef.rows = {}
  adminRef.errorTable = ''
})

describe('exportUserAccount', () => {
  it('covers both facets, attributes every key, and never leaks secrets', async () => {
    const result = await exportUserAccount('user-1', 'Buyer@Acme.com', 'TS')
    expect(result).not.toBeNull()
    expect(result!.account).toEqual({ id: 'user-1', email: 'Buyer@Acme.com', exportedAt: 'TS' })
    expect(result!.manifest.complete).toBe(true)

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
    expect(result!.facets.seller).toContain('agent_lab_simulation_runs')
    expect(result!.facets.seller).toContain('agent_lab_research_runs')

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
    const result = await exportUserAccount('user-1', null, 'TS')
    expect(adminRef.ops.some((o) => o.by === 'buyer_email')).toBe(false)
    expect(adminRef.ops.some((o) => o.table === 'negotiation_messages')).toBe(false)
    expect(result!.data.checkout_orders_as_buyer).toEqual([])
    expect(result!.manifest.complete).toBe(true)
  })

  it('paginates past the previous row cap and records exact manifest counts', async () => {
    adminRef.rows.notifications = Array.from({ length: 1_201 }, (_, id) => ({ id }))
    const result = await exportUserAccount('user-1', null, 'TS')

    expect(result!.data.notifications).toHaveLength(1_201)
    expect(result!.manifest.datasets.notifications).toEqual({ rows: 1_201, complete: true })
    expect(
      adminRef.ops.filter((op) => op.table === 'notifications').map((op) => op.range),
    ).toEqual([[0, 499], [500, 999], [1000, 1499]])
  })

  it('marks query failures as incomplete instead of translating them into empty success', async () => {
    adminRef.errorTable = 'notifications'
    const result = await exportUserAccount('user-1', null, 'TS')

    expect(result!.manifest.complete).toBe(false)
    expect(result!.manifest.datasets.notifications).toMatchObject({ complete: false, error: 'notifications unavailable' })
    expect(result!.manifest.errors).toContainEqual({ dataset: 'notifications', message: 'notifications unavailable' })
  })

  it('returns null without the service role', async () => {
    adminRef.hasEnv = false
    expect(await exportUserAccount('user-1', 'x@y.com', 'TS')).toBeNull()
  })
})
