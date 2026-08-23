import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({
  adminConfigured: true,
  checkout: new Set<string>(['ready']) as Set<string> | Error,
  negotiation: new Set<string>(['negotiable']) as Set<string> | Error,
}))

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => refs.adminConfigured),
  createAdminClient: vi.fn(() => ({ kind: 'admin' })),
}))
vi.mock('./agentic-commerce-eligibility', () => ({
  resolveCheckoutEligibleSlugs: vi.fn(async () => {
    if (refs.checkout instanceof Error) throw refs.checkout
    return refs.checkout
  }),
}))
vi.mock('./negotiation-visibility', () => ({
  resolveNegotiationEligibleSlugs: vi.fn(async () => {
    if (refs.negotiation instanceof Error) throw refs.negotiation
    return refs.negotiation
  }),
}))

import { resolveCheckoutEligibleSlugs } from './agentic-commerce-eligibility'
import { resolvePublicCommerceCapabilities } from './public-commerce-capabilities'

describe('resolvePublicCommerceCapabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.adminConfigured = true
    refs.checkout = new Set(['ready'])
    refs.negotiation = new Set(['negotiable'])
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_ready')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('advertises Nexez checkout only when both settlement state and the platform payment rail are available', async () => {
    const ready = await resolvePublicCommerceCapabilities(['ready', 'negotiable'])
    expect([...ready.checkoutReadySlugs]).toEqual(['ready'])

    vi.stubEnv('STRIPE_SECRET_KEY', '')
    const unavailable = await resolvePublicCommerceCapabilities(['ready', 'negotiable'])
    expect(unavailable.checkoutReadySlugs).toEqual(new Set())
    expect(unavailable.negotiationEligibleSlugs).toEqual(new Set(['negotiable']))
    expect(resolveCheckoutEligibleSlugs).toHaveBeenCalledTimes(1)
  })

  it('fails checkout readiness closed without privileged database configuration', async () => {
    refs.adminConfigured = false
    const capabilities = await resolvePublicCommerceCapabilities(['ready'])
    expect(capabilities.checkoutReadySlugs).toEqual(new Set())
  })

  it('fails the complete public action capability snapshot closed on a privileged read failure', async () => {
    refs.negotiation = new Error('billing unavailable')
    const capabilities = await resolvePublicCommerceCapabilities(['ready', 'negotiable'])
    expect(capabilities).toEqual({
      negotiationEligibleSlugs: new Set(),
      checkoutReadySlugs: new Set(),
    })
  })
})
