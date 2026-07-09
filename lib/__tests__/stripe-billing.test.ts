import { describe, it, expect } from 'vitest'
import {
  LIVE_SUBSCRIPTION_STATUSES,
  isDbManagedBillingStatus,
  pickLiveStripeSubscription,
  shouldSkipSubscriptionSync,
} from '../stripe-billing'

const sub = (status: string, id = status) => ({ id, status })

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
