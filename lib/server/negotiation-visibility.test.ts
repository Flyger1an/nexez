import { beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({
  hasAdmin: true,
  privateOwnerId: 'owner-1' as string | null,
  allowedOwners: new Set<string>(['owner-1']),
  pages: [] as Array<{ slug: string; owner_id: string | null }>,
}))

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => refs.hasAdmin,
  createAdminClient: () => ({
    from: () => {
      const query: Record<string, unknown> = {}
      query.select = () => query
      query.in = () => query
      query.eq = () => query
      query.returns = async () => ({ data: refs.pages, error: null })
      return query
    },
  }),
}))
vi.mock('./page-private-meta', () => ({
  getPagePrivateMeta: async () => ({ ownerId: refs.privateOwnerId }),
}))
vi.mock('./plan', () => ({
  ownerAllows: async (_admin: unknown, ownerId: string) => refs.allowedOwners.has(ownerId),
  getOwnerPlanIds: vi.fn(async (_admin: unknown, ownerIds: string[]) => Object.fromEntries(
    ownerIds.map((ownerId) => [ownerId, refs.allowedOwners.has(ownerId) ? 'pro' : 'free']),
  )),
}))

import { resolveNegotiationAllowed, resolveNegotiationEligibleSlugs } from './negotiation-visibility'
import { getOwnerPlanIds } from './plan'

const page = (offerType: string | undefined = 'negotiable') => ({
  id: 'page-1',
  slug: 'demo',
  name: 'Demo',
  services: [{ name: 'Consult', price: '$100', offerType }],
  products: [],
}) as any

describe('negotiation visibility', () => {
  beforeEach(() => {
    refs.hasAdmin = true
    refs.privateOwnerId = 'owner-1'
    refs.allowedOwners = new Set(['owner-1'])
    refs.pages = []
  })

  it('fails closed when paid entitlement cannot be verified', async () => {
    refs.hasAdmin = false
    expect(await resolveNegotiationAllowed(page())).toBe(false)
  })

  it('requires both a negotiable offer and an entitled owner', async () => {
    expect(await resolveNegotiationAllowed(page('fixed'))).toBe(false)
    refs.allowedOwners.clear()
    expect(await resolveNegotiationAllowed(page())).toBe(false)
    refs.allowedOwners.add('owner-1')
    expect(await resolveNegotiationAllowed(page())).toBe(true)
  })

  it('resolves eligible slugs once per unique owner and excludes unknown owners', async () => {
    refs.pages = [
      { slug: 'alpha', owner_id: 'owner-1' },
      { slug: 'alpha-two', owner_id: 'owner-1' },
      { slug: 'beta', owner_id: 'owner-2' },
      { slug: 'orphan', owner_id: null },
    ]
    refs.allowedOwners = new Set(['owner-1'])
    expect(await resolveNegotiationEligibleSlugs(['alpha', 'alpha-two', 'beta', 'orphan'])).toEqual(
      new Set(['alpha', 'alpha-two']),
    )
    expect(getOwnerPlanIds).toHaveBeenCalledTimes(1)
    expect(getOwnerPlanIds).toHaveBeenCalledWith(expect.anything(), ['owner-1', 'owner-2'])
  })

  it('returns no eligible slugs without the privileged resolver', async () => {
    refs.hasAdmin = false
    refs.pages = [{ slug: 'alpha', owner_id: 'owner-1' }]
    expect(await resolveNegotiationEligibleSlugs(['alpha'])).toEqual(new Set())
  })
})
