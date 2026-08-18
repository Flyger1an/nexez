import { describe, it, expect } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'
import { getOwnerPlanId, getOwnerCommission, getOwnerBillingState, ownerAllows, isPlatformAdmin, subscriptionConfers } from './plan'
import { LIVE_SUBSCRIPTION_STATUSES } from '../stripe-billing'

type SubRow = { plan_id: string; status: string; trial_ends_at?: string | null; account_origin?: string | null }
type GrantRow = {
  id: string
  campaign_id: string
  plan_id: string
  source: 'welcome' | 'referral' | 'admin'
  starts_at: string
  ends_at: string
  fallback_page_id: string | null
}
const future = () => new Date(Date.now() + 86_400_000).toISOString()
const past = () => new Date(Date.now() - 86_400_000).toISOString()
const launchGrant = (): GrantRow => ({
  id: 'grant-1',
  campaign_id: 'campaign-1',
  plan_id: 'launch',
  source: 'welcome',
  starts_at: past(),
  ends_at: future(),
  fallback_page_id: null,
})

// Build a client where `admin` decides the platform_admins row and `sub` the
// billing_subscriptions row. `adminError` simulates a missing/erroring table.
function client(opts: { admin?: boolean; sub?: SubRow | null; grant?: GrantRow | null; adminError?: boolean }) {
  return createSupabaseMock((ctx: QueryContext) => {
    if (ctx.table === 'platform_admins') {
      if (opts.adminError) return { data: null, error: { message: 'relation "platform_admins" does not exist' } }
      return { data: opts.admin ? { user_id: 'owner-1' } : null, error: null }
    }
    if (ctx.table === 'billing_subscriptions') return { data: opts.sub ?? null, error: null }
    if (ctx.table === 'promotional_plan_grants') return { data: opts.grant ?? null, error: null }
    return { data: null, error: null }
  }) as any
}

describe('getOwnerPlanId - admin short-circuit', () => {
  it('resolves an admin to enterprise regardless of subscription', async () => {
    expect(await getOwnerPlanId(client({ admin: true, sub: null }), 'owner-1')).toBe('enterprise')
    // even a free/canceled sub is overridden
    expect(await getOwnerPlanId(client({ admin: true, sub: { plan_id: 'free', status: 'canceled' } }), 'owner-1')).toBe('enterprise')
  })

  it('a non-admin still resolves from the subscription ladder', async () => {
    expect(await getOwnerPlanId(client({ admin: false, sub: { plan_id: 'pro', status: 'active' } }), 'owner-1')).toBe('pro')
    expect(await getOwnerPlanId(client({ admin: false, sub: null }), 'owner-1')).toBe('free')
    // inactive subscription → free
    expect(await getOwnerPlanId(client({ admin: false, sub: { plan_id: 'scale', status: 'canceled' } }), 'owner-1')).toBe('free')
  })

  it('billing resolution is unaffected when platform_admins errors (e.g. pre-migration)', async () => {
    expect(await getOwnerPlanId(client({ adminError: true, sub: { plan_id: 'pro', status: 'active' } }), 'owner-1')).toBe('pro')
  })

  it('returns free for a null owner', async () => {
    expect(await getOwnerPlanId(client({}), null)).toBe('free')
  })
})

describe('getOwnerCommission', () => {
  it('maps every effective plan to the v1 basis-point ladder', async () => {
    const cases = [
      [{ sub: null }, 'free', 900],
      [{ sub: { plan_id: 'launch', status: 'active' } }, 'launch', 700],
      [{ sub: { plan_id: 'pro', status: 'active' } }, 'pro', 500],
      [{ sub: { plan_id: 'scale', status: 'active' } }, 'scale', 300],
      [{ sub: { plan_id: 'enterprise', status: 'active' } }, 'enterprise', 200],
    ] as const

    for (const [opts, planId, basisPoints] of cases) {
      expect(await getOwnerCommission(client(opts as any), 'owner-1')).toMatchObject({
        planId,
        basisPoints,
        percent: basisPoints / 100,
        source: 'plan_default',
      })
    }
  })

  it('inherits admin, promotion, and dunning semantics from getOwnerPlanId', async () => {
    expect(await getOwnerCommission(client({ admin: true }), 'owner-1')).toMatchObject({ planId: 'enterprise', basisPoints: 200 })
    expect(await getOwnerCommission(client({ grant: launchGrant() }), 'owner-1')).toMatchObject({ planId: 'launch', basisPoints: 700 })
    expect(await getOwnerCommission(client({ sub: { plan_id: 'scale', status: 'past_due' } }), 'owner-1')).toMatchObject({ planId: 'scale', basisPoints: 300 })
    expect(await getOwnerCommission(client({ sub: { plan_id: 'scale', status: 'unpaid' } }), 'owner-1')).toMatchObject({ planId: 'scale', basisPoints: 300 })
  })

  it('falls back to Free/highest commission when entitlement no longer confers', async () => {
    expect(await getOwnerCommission(client({ sub: { plan_id: 'pro', status: 'canceled' } }), 'owner-1')).toMatchObject({ planId: 'free', basisPoints: 900 })
    expect(await getOwnerCommission(client({ sub: { plan_id: 'pro', status: 'trialing', trial_ends_at: past() } }), 'owner-1')).toMatchObject({ planId: 'free', basisPoints: 900 })
    expect(await getOwnerCommission(client({ grant: { ...launchGrant(), ends_at: past() } }), 'owner-1')).toMatchObject({ planId: 'free', basisPoints: 900 })
    expect(await getOwnerCommission(client({}), null)).toMatchObject({ planId: 'free', basisPoints: 900 })
  })

  it('fails closed when billing reads throw', async () => {
    const broken = { from() { throw new Error('db unavailable') } } as any
    expect(await getOwnerCommission(broken, 'owner-1')).toMatchObject({ planId: 'free', basisPoints: 900 })
  })
})

describe('admin entitlements', () => {
  it('unlocks the highest-tier features (Scale+ / Enterprise)', async () => {
    const c = client({ admin: true })
    expect(await ownerAllows(c, 'owner-1', 'teamCollaboration')).toBe(true) // Scale+
    expect(await ownerAllows(c, 'owner-1', 'sso')).toBe(true) // Enterprise
    expect(await ownerAllows(c, 'owner-1', 'whiteLabel')).toBe(true)
  })

  it('a free non-admin does NOT get those features', async () => {
    const c = client({ admin: false, sub: null })
    expect(await ownerAllows(c, 'owner-1', 'teamCollaboration')).toBe(false)
    expect(await ownerAllows(c, 'owner-1', 'sso')).toBe(false)
  })
})

describe('isPlatformAdmin', () => {
  it('reflects the platform_admins row', async () => {
    expect(await isPlatformAdmin(client({ admin: true }), 'owner-1')).toBe(true)
    expect(await isPlatformAdmin(client({ admin: false }), 'owner-1')).toBe(false)
    expect(await isPlatformAdmin(client({}), null)).toBe(false)
  })
})

describe('getOwnerPlanId - trials & paused', () => {
  it('an in-window trial confers the chosen plan', async () => {
    expect(await getOwnerPlanId(client({ sub: { plan_id: 'pro', status: 'trialing', trial_ends_at: future() } }), 'owner-1')).toBe('pro')
  })
  it('an EXPIRED trial does not confer → free', async () => {
    expect(await getOwnerPlanId(client({ sub: { plan_id: 'pro', status: 'trialing', trial_ends_at: past() } }), 'owner-1')).toBe('free')
  })
  it('a paused account → free (no paid features)', async () => {
    expect(await getOwnerPlanId(client({ sub: { plan_id: 'pro', status: 'paused', account_origin: 'trial' } }), 'owner-1')).toBe('free')
  })
  it('dunning (past_due/unpaid) still confers', async () => {
    expect(await getOwnerPlanId(client({ sub: { plan_id: 'scale', status: 'past_due' } }), 'owner-1')).toBe('scale')
  })
})

describe('getOwnerPlanId - promotional grants', () => {
  it('confers a live Launch grant without manufacturing a Stripe subscription', async () => {
    expect(await getOwnerPlanId(client({ sub: null, grant: launchGrant() }), 'owner-1')).toBe('launch')
  })

  it('keeps the higher paid plan when a lower grant is also live', async () => {
    expect(await getOwnerPlanId(client({
      sub: { plan_id: 'pro', status: 'active' },
      grant: launchGrant(),
    }), 'owner-1')).toBe('pro')
  })

  it('falls back to the live grant after a paid plan stops conferring', async () => {
    expect(await getOwnerPlanId(client({
      sub: { plan_id: 'pro', status: 'canceled' },
      grant: launchGrant(),
    }), 'owner-1')).toBe('launch')
  })

  it('ignores an expired grant', async () => {
    expect(await getOwnerPlanId(client({
      sub: null,
      grant: { ...launchGrant(), starts_at: past(), ends_at: past() },
    }), 'owner-1')).toBe('free')
  })
})

describe('getOwnerBillingState', () => {
  it('reports an in-window trial', async () => {
    const s = await getOwnerBillingState(client({ sub: { plan_id: 'pro', status: 'trialing', trial_ends_at: future(), account_origin: 'trial' } }), 'owner-1')
    expect(s).toMatchObject({ planId: 'pro', chosenPlanId: 'pro', isLive: true, isTrialing: true, isPaused: false })
    expect(s.trialEndsAt).toBeTruthy()
  })
  it('reports an expired trial as a Free fallback without pausing the storefront', async () => {
    const s = await getOwnerBillingState(client({ sub: { plan_id: 'pro', status: 'trialing', trial_ends_at: past(), account_origin: 'trial' } }), 'owner-1')
    expect(s).toMatchObject({
      planId: 'free',
      chosenPlanId: 'pro',
      isLive: false,
      isTrialing: false,
      isPaused: false,
      isTrialExpired: true,
    })
  })
  it('reports promotional access and its fixed expiration', async () => {
    const grant = launchGrant()
    const s = await getOwnerBillingState(client({ sub: null, grant }), 'owner-1')
    expect(s).toMatchObject({
      planId: 'launch',
      isLive: true,
      isPaused: false,
      promotion: {
        id: grant.id,
        planId: 'launch',
        source: 'welcome',
        endsAt: grant.ends_at,
      },
    })
  })
  it('a legacy account NEVER pauses (grandfathered to free)', async () => {
    const s = await getOwnerBillingState(client({ sub: { plan_id: 'free', status: 'canceled', account_origin: 'legacy' } }), 'owner-1')
    expect(s.isPaused).toBe(false)
    expect(s.planId).toBe('free')
  })
  it('admin → enterprise, live, never paused', async () => {
    const s = await getOwnerBillingState(client({ admin: true }), 'owner-1')
    expect(s).toMatchObject({ planId: 'enterprise', isLive: true, isPaused: false })
  })
  it('no subscription row → neutral free, not paused', async () => {
    const s = await getOwnerBillingState(client({ sub: null }), 'owner-1')
    expect(s).toMatchObject({ planId: 'free', chosenPlanId: null, isPaused: false, isLive: false })
  })
})

// Regression guard for the two concepts that used to be conflated in this file.
//
// `LIVE_STATUSES` sat at the top of plan.ts describing itself as the source of truth
// for entitlement, listed 'trialing' unconditionally, and was read by nothing. Its
// comment claimed the SQL triggers mirrored it; migration 20260627007400 had already
// moved them to the stricter conferring predicate. Anyone reaching for the
// authoritative-looking constant would have granted plan access to an EXPIRED trial.
//
// These assertions pin the difference so the two cannot be re-merged by accident.
describe('entitlement vs "current subscription row"', () => {
  it('an expired trial does NOT confer its plan', () => {
    expect(subscriptionConfers('trialing', past())).toBe(false)
  })

  it('a trial inside its window does confer', () => {
    expect(subscriptionConfers('trialing', future())).toBe(true)
    expect(subscriptionConfers('trialing', null)).toBe(true)
  })

  it('dunning states keep conferring, by policy', () => {
    expect(subscriptionConfers('past_due', null)).toBe(true)
    expect(subscriptionConfers('unpaid', null)).toBe(true)
  })

  it('dead states never confer', () => {
    for (const status of ['canceled', 'incomplete', 'paused', 'expired']) {
      expect(subscriptionConfers(status, future())).toBe(false)
    }
  })

  it('the Stripe "current row" set is deliberately broader than entitlement', () => {
    // An expired trial is still the row a plan change must UPDATE, so it belongs in
    // LIVE_SUBSCRIPTION_STATUSES while conferring nothing. That gap is the whole
    // reason these are two separate things.
    expect((LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes('trialing')).toBe(true)
    expect(subscriptionConfers('trialing', past())).toBe(false)
  })
})

describe('getOwnerCommission - Enterprise commercial terms', () => {
  function withCommercialTerms(
    base: any,
    terms: any,
    options: { error?: unknown; throwOnRead?: boolean; onRead?: () => void } = {},
  ) {
    return {
      from(table: string) {
        if (table !== 'owner_commercial_terms') return base.from(table)

        options.onRead?.()
        if (options.throwOnRead) throw new Error('commercial terms unavailable')

        const chain: any = {
          select() {
            return chain
          },
          eq() {
            return chain
          },
          async maybeSingle() {
            return {
              data: terms,
              error: options.error ?? null,
            }
          },
        }

        return chain
      },
    } as any
  }

  const enterpriseSub = { plan_id: 'enterprise', status: 'active' }
  const activeTerms = (commission_bps: number | null) => ({
    commission_bps,
    effective_from: '2000-01-01T00:00:00.000Z',
    effective_until: null,
  })

  it('uses 100, 150, and 200 bps active Enterprise overrides', async () => {
    for (const commissionBps of [100, 150, 200]) {
      const c = withCommercialTerms(
        client({ sub: enterpriseSub }),
        activeTerms(commissionBps),
      )

      expect(await getOwnerCommission(c, 'owner-1')).toMatchObject({
        planId: 'enterprise',
        basisPoints: commissionBps,
        percent: commissionBps / 100,
        source: 'enterprise_override',
      })
    }
  })

  it('falls back to the 200 bps Enterprise default when terms are missing', async () => {
    const c = withCommercialTerms(client({ sub: enterpriseSub }), null)

    expect(await getOwnerCommission(c, 'owner-1')).toMatchObject({
      planId: 'enterprise',
      basisPoints: 200,
      percent: 2,
      source: 'plan_default',
    })
  })

  it('rejects invalid, inactive, and expired Enterprise overrides', async () => {
    const invalidTerms = [
      activeTerms(99),
      activeTerms(201),
      activeTerms(150.5),
      activeTerms(null),
      {
        commission_bps: 150,
        effective_from: '2999-01-01T00:00:00.000Z',
        effective_until: null,
      },
      {
        commission_bps: 150,
        effective_from: '2000-01-01T00:00:00.000Z',
        effective_until: '2001-01-01T00:00:00.000Z',
      },
    ]

    for (const terms of invalidTerms) {
      const c = withCommercialTerms(client({ sub: enterpriseSub }), terms)
      expect(await getOwnerCommission(c, 'owner-1')).toMatchObject({
        planId: 'enterprise',
        basisPoints: 200,
        source: 'plan_default',
      })
    }
  })

  it('fails closed to the Enterprise default when the commercial-term read errors', async () => {
    const errored = withCommercialTerms(
      client({ sub: enterpriseSub }),
      activeTerms(150),
      { error: new Error('db unavailable') },
    )
    expect(await getOwnerCommission(errored, 'owner-1')).toMatchObject({
      planId: 'enterprise',
      basisPoints: 200,
      source: 'plan_default',
    })

    const thrown = withCommercialTerms(
      client({ sub: enterpriseSub }),
      activeTerms(150),
      { throwOnRead: true },
    )
    expect(await getOwnerCommission(thrown, 'owner-1')).toMatchObject({
      planId: 'enterprise',
      basisPoints: 200,
      source: 'plan_default',
    })
  })

  it('never reads commercial terms for non-Enterprise effective plans', async () => {
    let termsReads = 0
    const c = withCommercialTerms(
      client({ sub: { plan_id: 'pro', status: 'active' } }),
      activeTerms(100),
      { onRead: () => { termsReads += 1 } },
    )

    expect(await getOwnerCommission(c, 'owner-1')).toMatchObject({
      planId: 'pro',
      basisPoints: 500,
      source: 'plan_default',
    })
    expect(termsReads).toBe(0)
  })
})
