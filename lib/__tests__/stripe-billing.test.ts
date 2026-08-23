import { afterEach, describe, it, expect, vi } from 'vitest'
import {
  buildBillingSubscriptionRow,
  calculateApplicationFeeCents,
  calculateApplicationFeeCentsFromBps,
  getCommissionBpsForPlan,
  getCommissionPercentForPlan,
  getPlanIdForStripePrice,
  hasScheduledCancellation,
  LIVE_SUBSCRIPTION_STATUSES,
  isDbManagedBillingStatus,
  pickLiveStripeSubscription,
  shouldSkipSubscriptionSync,
} from '../stripe-billing'

afterEach(() => vi.unstubAllEnvs())

const sub = (status: string, id = status) => ({ id, status })

describe('commission core', () => {
  it('resolves every plan default and keeps the percent helper as a compatibility view', () => {
    const cases = [
      ['free', 900, 9],
      ['launch', 700, 7],
      ['pro', 500, 5],
      ['scale', 300, 3],
      ['enterprise', 200, 2],
    ] as const
    for (const [planId, bps, percent] of cases) {
      expect(getCommissionBpsForPlan(planId)).toBe(bps)
      expect(getCommissionPercentForPlan(planId)).toBe(percent)
    }
  })

  it('fails closed to Free economics for missing plan metadata', () => {
    expect(getCommissionBpsForPlan(null)).toBe(900)
    expect(getCommissionPercentForPlan(undefined)).toBe(9)
  })
})

describe('basis-point application fee arithmetic', () => {
  it('returns zero for zero/negative amounts', () => {
    expect(calculateApplicationFeeCentsFromBps(0, 900)).toBe(0)
    expect(calculateApplicationFeeCentsFromBps(-100, 900)).toBe(0)
  })

  it('rounds tiny fractional-cent commissions deterministically', () => {
    expect(calculateApplicationFeeCentsFromBps(5, 900)).toBe(0) // 0.45¢
    expect(calculateApplicationFeeCentsFromBps(6, 900)).toBe(1) // 0.54¢
  })

  it('handles normal, high-value, and custom Enterprise rates in integer math', () => {
    expect(calculateApplicationFeeCentsFromBps(12_345, 500)).toBe(617)
    expect(calculateApplicationFeeCentsFromBps(100_000_000, 150)).toBe(1_500_000)
    expect(calculateApplicationFeeCentsFromBps(12_345, 150)).toBe(185)
  })

  it('preserves legacy percent-call arithmetic during migration', () => {
    expect(calculateApplicationFeeCents(12_345, 5)).toBe(617)
    expect(calculateApplicationFeeCents(12_345, 1.5)).toBe(185)
  })
})

describe('pickLiveStripeSubscription', () => {
  it('finds the live subscription among noise (the one a plan change must UPDATE)', () => {
    const live = pickLiveStripeSubscription([sub('incomplete'), sub('canceled'), sub('active'), sub('incomplete_expired')])
    expect(live?.id).toBe('active')
  })

  it('treats every LIVE status as live (incl. unpaid - the dunning grace the resolvers honor)', () => {
    for (const status of LIVE_SUBSCRIPTION_STATUSES) {
      expect(pickLiveStripeSubscription([sub('canceled'), sub(status)])?.id).toBe(status)
    }
  })

  it('returns null when only abandoned/settled subs exist - a payment sheet opened then abandoned is NOT a subscription', () => {
    expect(pickLiveStripeSubscription([sub('incomplete')])).toBeNull()
    expect(pickLiveStripeSubscription([sub('incomplete_expired'), sub('canceled')])).toBeNull()
    expect(pickLiveStripeSubscription([])).toBeNull()
  })
})

describe('shouldSkipSubscriptionSync', () => {
  it('skips exactly the pre-payment states (the trial/pause clobber vectors)', () => {
    expect(shouldSkipSubscriptionSync('incomplete')).toBe(true)
    expect(shouldSkipSubscriptionSync('incomplete_expired')).toBe(true)
  })

  it('never skips real lifecycle states (conversion + dunning + cancellation must sync)', () => {
    for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'canceled', null, undefined]) {
      expect(shouldSkipSubscriptionSync(status)).toBe(false)
    }
  })
})

describe('isDbManagedBillingStatus', () => {
  it('flags the no-card trial + its expiry pause (rows with no Stripe subscription behind them)', () => {
    expect(isDbManagedBillingStatus('trialing')).toBe(true)
    expect(isDbManagedBillingStatus('paused')).toBe(true)
  })

  it('everything Stripe-backed reconciles normally', () => {
    for (const status of ['active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', null, undefined]) {
      expect(isDbManagedBillingStatus(status)).toBe(false)
    }
  })
})

describe('scheduled cancellation normalization', () => {
  it('recognizes both Stripe cancellation representations', () => {
    expect(hasScheduledCancellation({ cancel_at_period_end: true } as any)).toBe(true)
    expect(hasScheduledCancellation({ cancel_at_period_end: false, cancel_at: 1_786_920_857 } as any)).toBe(true)
    expect(hasScheduledCancellation({ cancel_at_period_end: false, cancel_at: null } as any)).toBe(false)
  })

  it('persists an explicit cancel_at timestamp as a pending period-end cancellation', () => {
    const row = buildBillingSubscriptionRow({
      ownerId: 'owner-1',
      fallbackPlanId: 'launch',
      subscription: {
        id: 'sub_1',
        status: 'active',
        cancel_at_period_end: false,
        cancel_at: 1_786_920_857,
        items: { data: [] },
      } as any,
    })

    expect(row.cancel_at_period_end).toBe(true)
  })

  it('persists Stripe trial_end so trial entitlements always have a finite window', () => {
    const row = buildBillingSubscriptionRow({
      ownerId: 'owner-1',
      fallbackPlanId: 'launch',
      subscription: {
        id: 'sub_trial',
        status: 'trialing',
        trial_end: 1_786_920_857,
        cancel_at_period_end: false,
        items: { data: [] },
      } as any,
    })

    expect(row.trial_ends_at).toBe(new Date(1_786_920_857 * 1000).toISOString())
  })
})

describe('Stripe Price to plan authority', () => {
  it('fails closed when one Stripe Price is mapped to multiple plans', () => {
    vi.stubEnv('STRIPE_PRICE_LAUNCH', 'price_shared')
    vi.stubEnv('STRIPE_PRICE_PRO', 'price_shared')
    vi.stubEnv('STRIPE_PRICE_SCALE', 'price_scale')
    expect(getPlanIdForStripePrice('price_shared')).toBeNull()
  })

  it('does not let claimed metadata replace an unknown concrete Stripe Price', () => {
    const row = buildBillingSubscriptionRow({
      ownerId: 'owner-1',
      fallbackPlanId: 'scale',
      fallbackPriceId: 'price_not_in_catalog',
    })
    expect(row.plan_id).toBeNull()
  })
})

describe('regression: the opened-then-abandoned payment sheet must be invisible', () => {
  it('an in-window trial whose customer holds only an incomplete sub reconciles to NOTHING', () => {
    // The cron guard: no live sub + db-managed row status (+ no stripe_subscription_id
    // on the row) -> leave the row alone. These two are the primitives it composes.
    const stripeSubs = [sub('incomplete')]
    expect(pickLiveStripeSubscription(stripeSubs)).toBeNull()
    expect(isDbManagedBillingStatus('trialing')).toBe(true)
  })

  it('a real conversion (active sub appears) DOES overwrite the trial', () => {
    const stripeSubs = [sub('incomplete_expired'), sub('active')]
    expect(pickLiveStripeSubscription(stripeSubs)?.id).toBe('active')
  })
})
