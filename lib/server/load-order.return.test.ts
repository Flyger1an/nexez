import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'
const refs = vi.hoisted(() => ({ handler: (_c: QueryContext): any => ({ data: null, error: null }) }))
vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => true,
  createAdminClient: () => createSupabaseMock((c) => refs.handler(c)),
}))
import { bearerTokenColumns } from './bearer-token'
import { loadOrderTokenBySession, loadBuyerOrderTokenBySession } from './load-order'

describe('checkout return on the encrypted-only schema', () => {
  beforeEach(() => { vi.stubEnv('INTEGRATION_SECRET_KEY', '11'.repeat(32)) })
  afterEach(() => vi.unstubAllEnvs())
  it('recovers the direct-order token without querying the removed column', async () => {
    const token = 'fixture-buyer-capability'
    refs.handler = (c) => {
      expect(c.calls.find(([method]) => method === 'select')?.[1]).toBe('access_token_encrypted, status')
      expect(c.eqs.stripe_session_id).toBe('cs_test_return')
      return { data: { ...bearerTokenColumns(token, 'access_token'), status: 'paid' }, error: null }
    }
    expect(await loadOrderTokenBySession('cs_test_return')).toEqual({ token, status: 'paid' })
  })
  it('does not disclose another buyer token', async () => {
    refs.handler = (c) => ({ data: c.eqs.buyer_reference === 'buyer-owner'
      ? { ...bearerTokenColumns('owned-token', 'access_token'), status: 'paid' } : null })
    expect(await loadBuyerOrderTokenBySession('cs_test_return', 'other-buyer')).toBeNull()
    expect(await loadBuyerOrderTokenBySession('cs_test_return', 'buyer-owner')).toEqual({ token: 'owned-token', status: 'paid' })
  })
  it('distinguishes a failed database lookup from a pending checkout', async () => {
    refs.handler = () => ({ data: null, error: { code: '42703', message: 'column does not exist' } })
    await expect(loadOrderTokenBySession('cs_test_return')).rejects.toThrow('Order return lookup failed')
    await expect(loadBuyerOrderTokenBySession('cs_test_return', 'buyer')).rejects.toThrow('Buyer order return lookup failed')
    refs.handler = () => ({ data: null, error: null })
    expect(await loadBuyerOrderTokenBySession('cs_test_return', 'buyer')).toBeNull()
  })
})
