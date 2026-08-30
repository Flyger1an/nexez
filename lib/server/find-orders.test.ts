import { describe, it, expect, vi, beforeEach } from 'vitest'
import { encryptForTest, stubBearerTokenKey } from '../../test/bearer-token-fixtures'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'

const refs = vi.hoisted(() => ({ handler: (_c: any) => ({ data: [], error: null }) as any }))
vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: vi.fn(() => createSupabaseMock((c: QueryContext) => refs.handler(c))),
}))

import { checkoutCommerceKind, findOrdersByEmail } from './load-order'

stubBearerTokenKey()

describe('findOrdersByEmail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('escapes LIKE metacharacters (incl. PostgREST * → %) so a buyer email is an EXACT match (no cross-tenant leak)', async () => {
    const ilikePatterns: string[] = []
    refs.handler = (ctx: QueryContext) => {
      const ilike = ctx.calls.find((c) => c[0] === 'ilike')
      if (ilike) ilikePatterns.push(ilike[2])
      return { data: [], error: null }
    }
    await findOrdersByEmail('john_doe%*@example.com')
    // both checkout_orders + agent_negotiations queries get the fully-escaped pattern
    expect(ilikePatterns).toContain('john\\_doe\\%\\*@example.com')
    expect(ilikePatterns.every((p) => p === 'john\\_doe\\%\\*@example.com')).toBe(true)
  })

  it('escapes a bare wildcard so `*@gmail.com` cannot match every gmail buyer', async () => {
    let pattern = ''
    refs.handler = (ctx: QueryContext) => {
      const ilike = ctx.calls.find((c) => c[0] === 'ilike')
      if (ilike) pattern = ilike[2]
      return { data: [], error: null }
    }
    await findOrdersByEmail('*@gmail.com')
    expect(pattern).toBe('\\*@gmail.com')
  })

  it('merges both money paths, maps tokens, and sorts newest-first', async () => {
    refs.handler = (ctx: QueryContext) => {
      if (ctx.table === 'checkout_orders')
        return { data: [{ access_token_encrypted: encryptForTest('ck1'), slug: 'acme', offer_name: 'A', amount_cents: 5000, currency: 'usd', status: 'paid', metadata: null, created_at: '2026-06-10T00:00:00Z' }], error: null }
      if (ctx.table === 'agent_negotiations')
        return { data: [{ status_token_encrypted: encryptForTest('ng1'), slug: 'acme', offer_name: 'B', amount_cents: 500000, currency: 'jpy', status: 'held', metadata: null, created_at: '2026-06-15T00:00:00Z' }], error: null }
      if (ctx.table === 'pages_public') return { data: [{ slug: 'acme', name: 'Acme' }], error: null }
      return { data: [], error: null }
    }
    const out = await findOrdersByEmail('buyer@example.com')
    expect(out.map((o) => o.token)).toEqual(['ng1', 'ck1']) // newest (neg) first
    expect(out[0]).toMatchObject({ kind: 'negotiation', sellerName: 'Acme', amountCents: 5000 }) // jpy 500000 → 5000
    expect(out[1]).toMatchObject({ kind: 'checkout', token: 'ck1', amountCents: 5000 })
  })

  it('returns [] for a blank email without querying', async () => {
    expect(await findOrdersByEmail('   ')).toEqual([])
  })

  it('classifies advanced checkout orders for native buyer presentation', () => {
    expect(checkoutCommerceKind({ service_agreement_id: 'service-1' })).toBe('recurring')
    expect(checkoutCommerceKind({ staged_settlement_agreement_id: 'staged-1' })).toBe('staged')
    expect(checkoutCommerceKind({ resource_hold_id: 'hold-1' })).toBe('reservation')
    expect(checkoutCommerceKind({})).toBe('one_time')
  })
})
