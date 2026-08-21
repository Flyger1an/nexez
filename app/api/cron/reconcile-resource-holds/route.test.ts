import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueryContext } from '../../../../test/supabase-mock'

const { adminRef, retrieve, rpcCalls } = vi.hoisted(() => ({
  adminRef: {
    handler: (_context: QueryContext) => ({ data: null, error: null }) as { data?: unknown; error?: { message: string; code?: string } | null },
  },
  retrieve: vi.fn(),
  rpcCalls: [] as Array<{ fn: string; payload: any }>,
}))

vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { retrieve } }
  },
}))

vi.mock('../../../../utils/supabase/admin', async () => {
  const { createSupabaseMock } = await import('../../../../test/supabase-mock')
  const client = createSupabaseMock((context) => {
    if (context.table.startsWith('rpc:')) rpcCalls.push({ fn: context.table.slice(4), payload: context.payload })
    return adminRef.handler(context)
  })
  return {
    hasSupabaseAdminEnv: vi.fn(() => true),
    createAdminClient: vi.fn(() => client),
  }
})

import { GET } from './route'

const request = (token = 'cron-secret') => new Request('https://nexez.test/api/cron/reconcile-resource-holds', {
  headers: { authorization: `Bearer ${token}` },
})

describe('GET /api/cron/reconcile-resource-holds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rpcCalls.length = 0
    vi.stubEnv('CRON_SECRET', 'cron-secret')
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_resources')
    adminRef.handler = (context) => {
      if (context.table === 'resource_holds') return { data: [
        { id: 'active', status: 'active', stripe_checkout_session_id: null, stripe_connect_account_id: null },
        { id: 'expired', status: 'payment_pending', stripe_checkout_session_id: 'cs_expired', stripe_connect_account_id: 'acct_1' },
        { id: 'open', status: 'payment_pending', stripe_checkout_session_id: 'cs_open', stripe_connect_account_id: 'acct_1' },
        { id: 'paid', status: 'payment_pending', stripe_checkout_session_id: 'cs_paid', stripe_connect_account_id: 'acct_1' },
        { id: 'unknown', status: 'payment_pending', stripe_checkout_session_id: 'cs_unknown', stripe_connect_account_id: 'acct_1' },
      ], error: null }
      if (context.table === 'rpc:release_resource_hold') return { data: 'expired', error: null }
      return { data: null, error: null }
    }
    retrieve.mockImplementation(async (id: string) => {
      if (id === 'cs_expired') return { id, status: 'expired', payment_status: 'unpaid' }
      if (id === 'cs_open') return { id, status: 'open', payment_status: 'unpaid' }
      if (id === 'cs_paid') return { id, status: 'complete', payment_status: 'paid' }
      throw new Error('provider unavailable')
    })
  })

  afterEach(() => vi.unstubAllEnvs())

  it('requires cron authorization', async () => {
    expect((await GET(request('wrong'))).status).toBe(401)
  })

  it('releases unattached and provider-expired holds while preserving open, paid, and unknown sessions', async () => {
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      scanned: 5,
      activeExpired: 1,
      providerExpired: 1,
      stillOpen: 1,
      paidAwaitingWebhook: 1,
      providerUnavailable: 1,
    })
    expect(rpcCalls.filter((call) => call.fn === 'release_resource_hold').map((call) => call.payload)).toEqual([
      { p_hold_id: 'active', p_reason: 'unattached_expiry', p_stripe_checkout_session_id: null },
      { p_hold_id: 'expired', p_reason: 'provider_expired', p_stripe_checkout_session_id: 'cs_expired' },
    ])
  })
})
