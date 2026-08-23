import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  resolveOwnerSettlementReadiness,
  resolveCheckoutEligibleOwners,
  resolveCheckoutEligibleSlugs,
  acpCheckoutEligibleSlugs,
  agenticProgramFlags,
} from '../server/agentic-commerce-eligibility'

// A minimal chainable stand-in for the service-role client. Terminal `.maybeSingle()`
// (single-owner reads) and `.returns()` (batch reads) resolve from the seeded tables.
type Sub = {
  owner_id: string
  plan_id: string | null
  status: string | null
  trial_ends_at?: string | null
  stripe_connect_account_id: string | null
  stripe_connect_charges_enabled: boolean | null
  stripe_connect_payouts_enabled: boolean | null
}

function makeAdmin(seed: { admins?: string[]; subs?: Sub[]; pages?: { slug: string; owner_id: string | null }[] }) {
  const from = (table: string) => {
    const state: { eqVal?: unknown } = {}
    const chain: Record<string, unknown> = {
      select: () => chain,
      in: () => chain,
      eq: (_col: string, val: unknown) => {
        state.eqVal = val
        return chain
      },
      maybeSingle: async () => {
        if (table === 'platform_admins') return { data: (seed.admins ?? []).includes(state.eqVal as string) ? { user_id: state.eqVal } : null }
        if (table === 'billing_subscriptions') return { data: (seed.subs ?? []).find((s) => s.owner_id === state.eqVal) ?? null }
        return { data: null }
      },
      returns: () => {
        if (table === 'platform_admins') return { data: (seed.admins ?? []).map((id) => ({ user_id: id })) }
        if (table === 'billing_subscriptions') return { data: seed.subs ?? [] }
        if (table === 'pages') return { data: seed.pages ?? [] }
        return { data: [] }
      },
    }
    return chain
  }
  return { from } as never
}

const proConnected = (owner: string): Sub => ({
  owner_id: owner,
  plan_id: 'pro',
  status: 'active',
  stripe_connect_account_id: 'acct_1',
  stripe_connect_charges_enabled: true,
  stripe_connect_payouts_enabled: true,
})

afterEach(() => vi.unstubAllEnvs())

describe('resolveOwnerSettlementReadiness', () => {
  it('charge-and-payout-ready Connect opens checkout on Pro', async () => {
    const admin = makeAdmin({ subs: [proConnected('o1')] })
    expect(await resolveOwnerSettlementReadiness(admin, 'o1')).toEqual({ connectReady: true })
  })

  it('Free + settlement-ready Connect can transact', async () => {
    const admin = makeAdmin({ subs: [{ owner_id: 'o1', plan_id: 'free', status: 'active', stripe_connect_account_id: 'acct_1', stripe_connect_charges_enabled: true, stripe_connect_payouts_enabled: true }] })
    expect(await resolveOwnerSettlementReadiness(admin, 'o1')).toEqual({ connectReady: true })
  })

  it('Launch + settlement-ready Connect can transact', async () => {
    const admin = makeAdmin({ subs: [{ owner_id: 'o1', plan_id: 'launch', status: 'active', stripe_connect_account_id: 'acct_1', stripe_connect_charges_enabled: true, stripe_connect_payouts_enabled: true }] })
    expect(await resolveOwnerSettlementReadiness(admin, 'o1')).toEqual({ connectReady: true })
  })

  it('Connect account without charges_enabled → payout gate closed', async () => {
    const admin = makeAdmin({ subs: [{ owner_id: 'o1', plan_id: 'pro', status: 'active', stripe_connect_account_id: 'acct_1', stripe_connect_charges_enabled: false, stripe_connect_payouts_enabled: true }] })
    expect(await resolveOwnerSettlementReadiness(admin, 'o1')).toEqual({ connectReady: false })
  })

  it('Connect account without payouts_enabled remains closed', async () => {
    const admin = makeAdmin({ subs: [{ owner_id: 'o1', plan_id: 'pro', status: 'active', stripe_connect_account_id: 'acct_1', stripe_connect_charges_enabled: true, stripe_connect_payouts_enabled: false }] })
    expect(await resolveOwnerSettlementReadiness(admin, 'o1')).toEqual({ connectReady: false })
  })

  it('subscription lifecycle does not remove foundational checkout', async () => {
    const admin = makeAdmin({ subs: [{ owner_id: 'o1', plan_id: 'pro', status: 'trialing', trial_ends_at: '2000-01-01T00:00:00Z', stripe_connect_account_id: 'acct_1', stripe_connect_charges_enabled: true, stripe_connect_payouts_enabled: true }] })
    expect(await resolveOwnerSettlementReadiness(admin, 'o1')).toEqual({ connectReady: true })
  })

  it('no owner → settlement readiness is closed', async () => {
    expect(await resolveOwnerSettlementReadiness(makeAdmin({}), null)).toEqual({ connectReady: false })
  })
})

describe('resolveCheckoutEligibleOwners (batch)', () => {
  it('returns settlement-ready owners regardless of plan', async () => {
    const admin = makeAdmin({
      subs: [
        proConnected('o1'), // eligible
        { owner_id: 'o2', plan_id: 'free', status: 'active', stripe_connect_account_id: 'acct_2', stripe_connect_charges_enabled: true, stripe_connect_payouts_enabled: true }, // Free is eligible
        { owner_id: 'o3', plan_id: 'pro', status: 'active', stripe_connect_account_id: 'acct_3', stripe_connect_charges_enabled: false, stripe_connect_payouts_enabled: true }, // no charge readiness
        { owner_id: 'o4', plan_id: 'launch', status: 'canceled', stripe_connect_account_id: 'acct_4', stripe_connect_charges_enabled: true, stripe_connect_payouts_enabled: true }, // lifecycle does not revoke checkout
      ],
    })
    const eligible = await resolveCheckoutEligibleOwners(admin, ['o1', 'o2', 'o3', 'o4'])
    expect([...eligible].sort()).toEqual(['o1', 'o2', 'o4'])
  })

  it('an owner without a payout account is not eligible (money cannot move)', async () => {
    const admin = makeAdmin({ admins: ['o1'], subs: [] })
    expect(await resolveCheckoutEligibleOwners(admin, ['o1'])).toEqual(new Set())
  })

  it('empty input → empty set', async () => {
    expect(await resolveCheckoutEligibleOwners(makeAdmin({}), [])).toEqual(new Set())
  })
})

describe('resolveCheckoutEligibleSlugs', () => {
  it('maps published slug → owner → eligibility', async () => {
    const admin = makeAdmin({
      subs: [
        { owner_id: 'o1', plan_id: 'free', status: 'active', stripe_connect_account_id: 'acct_1', stripe_connect_charges_enabled: true, stripe_connect_payouts_enabled: true },
        { owner_id: 'o2', plan_id: 'free', status: 'active', stripe_connect_account_id: null, stripe_connect_charges_enabled: null, stripe_connect_payouts_enabled: null },
      ],
      pages: [{ slug: 'a', owner_id: 'o1' }, { slug: 'b', owner_id: 'o2' }],
    })
    const slugs = await resolveCheckoutEligibleSlugs(admin, ['a', 'b'])
    expect([...slugs]).toEqual(['a'])
  })

  it('a slug with no matching page row is excluded', async () => {
    const admin = makeAdmin({ subs: [proConnected('o1')], pages: [{ slug: 'a', owner_id: 'o1' }] })
    const slugs = await resolveCheckoutEligibleSlugs(admin, ['a', 'ghost'])
    expect([...slugs]).toEqual(['a'])
  })
})

describe('program-flag wrappers', () => {
  it('agenticProgramFlags reports each surface independently (never collapsed to one OR)', () => {
    expect(agenticProgramFlags()).toEqual({ chatgptLive: false, googleLive: false })
    vi.stubEnv('ACP_CHECKOUT_ENABLED', 'true')
    expect(agenticProgramFlags()).toEqual({ chatgptLive: true, googleLive: false })
    vi.stubEnv('UCP_CHECKOUT_ENABLED', 'true')
    expect(agenticProgramFlags()).toEqual({ chatgptLive: true, googleLive: true })
  })

  it('acpCheckoutEligibleSlugs → null when the ACP program is off (feed leaves everything search-only)', async () => {
    vi.stubEnv('ACP_CHECKOUT_ENABLED', 'false')
    expect(await acpCheckoutEligibleSlugs(['a', 'b'])).toBeNull()
  })

  it('acpCheckoutEligibleSlugs → empty set (fail closed) when program is ON but no service role', async () => {
    vi.stubEnv('ACP_CHECKOUT_ENABLED', 'true')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    expect(await acpCheckoutEligibleSlugs(['a', 'b'])).toEqual(new Set())
  })
})
