import { describe, it, expect } from 'vitest'
import {
  PLAN_FEATURE_MATRIX,
  PLAN_FEATURES,
  PLAN_LIMIT_MATRIX,
  PLAN_LIMITS,
  billingPlans,
  getBillingPlan,
  getCommissionBpsForPlan,
  getFeatureUpgradeDecision,
  getLimitUpgradeDecision,
  getPlanLimits,
  getPlanRank,
  getSerializablePlanLimits,
  minPlanForFeature,
  planAllows,
  type PlanId,
} from '../billing'

describe('billing catalog', () => {
  it('has the five tiers in ascending rank with a clean prices/ids', () => {
    expect(billingPlans.map((p) => p.id)).toEqual(['free', 'launch', 'pro', 'scale', 'enterprise'])
    expect(billingPlans.map((p) => p.rank)).toEqual([0, 1, 2, 3, 4])
    expect(billingPlans.map((p) => p.monthlyPriceCents)).toEqual([0, 1900, 4900, 14900, null])
  })

  it('commission steps DOWN monotonically as the plan steps up (upgrade incentive)', () => {
    const rates = billingPlans.map((p) => p.commissionPercent)
    expect(rates).toEqual([9, 7, 5, 3, 2])
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeLessThan(rates[i - 1])
  })

  it('exposes the v1 commission ladder in canonical basis points', () => {
    expect(getCommissionBpsForPlan('free')).toBe(900)
    expect(getCommissionBpsForPlan('launch')).toBe(700)
    expect(getCommissionBpsForPlan('pro')).toBe(500)
    expect(getCommissionBpsForPlan('scale')).toBe(300)
    expect(getCommissionBpsForPlan('enterprise')).toBe(200)
  })

  it('fails closed to the highest standard rate for missing/unknown plans', () => {
    expect(getCommissionBpsForPlan(null)).toBe(900)
    expect(getCommissionBpsForPlan('bogus')).toBe(900)
  })

  it('published-listing limits ladder up; enterprise is unlimited', () => {
    expect(getPlanLimits('free').publishedListings).toBe(1)
    expect(getPlanLimits('launch').publishedListings).toBe(3)
    expect(getPlanLimits('pro').publishedListings).toBe(25)
    expect(getPlanLimits('scale').publishedListings).toBe(100)
    expect(getPlanLimits('enterprise').publishedListings).toBe(Number.POSITIVE_INFINITY)
    // unknown/null falls back to Free limits (fail-safe)
    expect(getPlanLimits(null).publishedListings).toBe(1)
    expect(getPlanLimits('bogus').publishedListings).toBe(1)
    // Temporary compatibility alias while existing listing consumers migrate.
    expect(getPlanLimits('pro').pages).toBe(getPlanLimits('pro').publishedListings)
  })

  it('publishes the complete domains, seats, and storefronts allocation', () => {
    expect(billingPlans.map((plan) => plan.limits.customDomains)).toEqual([0, 1, 5, 25, Number.POSITIVE_INFINITY])
    expect(billingPlans.map((plan) => plan.limits.teamSeats)).toEqual([0, 0, 3, 10, Number.POSITIVE_INFINITY])
    expect(billingPlans.map((plan) => plan.limits.storefronts)).toEqual([1, 1, 3, 10, Number.POSITIVE_INFINITY])
    expect(getPlanLimits('launch').teamSeats).toBe(0) // team collab not available below Pro
  })

  it('keeps the limit matrix explicit on both axes', () => {
    expect(Object.keys(PLAN_LIMIT_MATRIX)).toEqual(['free', 'launch', 'pro', 'scale', 'enterprise'])
    for (const limits of Object.values(PLAN_LIMIT_MATRIX)) {
      expect(Object.keys(limits)).toEqual(PLAN_LIMITS)
    }
  })

  it('serializes unlimited limits as null instead of non-JSON Infinity', () => {
    expect(getSerializablePlanLimits('enterprise')).toEqual({
      publishedListings: null,
      customDomains: null,
      teamSeats: null,
      storefronts: null,
    })
    expect(JSON.parse(JSON.stringify(getSerializablePlanLimits('enterprise')))).toEqual(getSerializablePlanLimits('enterprise'))
  })
})

describe('planAllows (cumulative feature gating)', () => {
  it('gates Launch-tier features (including custom branding)', () => {
    for (const f of ['customDomain', 'aiFeatures', 'removeBadge', 'whiteLabel'] as const) {
      expect(planAllows('free', f)).toBe(false)
      expect(planAllows('launch', f)).toBe(true)
      expect(planAllows('pro', f)).toBe(true) // higher tiers inherit
      expect(planAllows('enterprise', f)).toBe(true)
    }
  })

  it('gates Pro-tier automation and collaboration features', () => {
    for (const f of ['integrations', 'outboundWebhooks', 'apiAccess', 'negotiation', 'analyticsHistory', 'teamCollaboration'] as const) {
      expect(planAllows('launch', f)).toBe(false)
      expect(planAllows('pro', f)).toBe(true)
      expect(planAllows('scale', f)).toBe(true)
    }
  })

  it('keeps prioritySupport as the Scale badge', () => {
    expect(planAllows('pro', 'prioritySupport')).toBe(false)
    expect(planAllows('scale', 'prioritySupport')).toBe(true)
    expect(planAllows('enterprise', 'prioritySupport')).toBe(true)
  })

  it('gates SSO to Enterprise only', () => {
    expect(planAllows('scale', 'sso')).toBe(false)
    expect(planAllows('enterprise', 'sso')).toBe(true)
  })

  it('treats null/unknown plan as Free (fail-safe - denies paid features)', () => {
    expect(planAllows(null, 'customDomain')).toBe(false)
    expect(planAllows(undefined, 'aiFeatures')).toBe(false)
    expect(planAllows('bogus' as PlanId, 'integrations')).toBe(false)
  })

  it('keeps the full plan × feature allocation explicit and cumulative', () => {
    expect(Object.keys(PLAN_FEATURE_MATRIX)).toEqual(['free', 'launch', 'pro', 'scale', 'enterprise'])
    for (const planId of ['free', 'launch', 'pro', 'scale', 'enterprise'] as const) {
      expect(Object.keys(PLAN_FEATURE_MATRIX[planId])).toEqual(PLAN_FEATURES)
    }
  })

  it('separates foundational checkout from paid plan features', () => {
    expect(PLAN_FEATURES).not.toContain('agenticCheckout')
  })
})

describe('minPlanForFeature (the "Upgrade to X" target)', () => {
  it('resolves the cheapest plan that unlocks each feature', () => {
    expect(minPlanForFeature('customDomain').id).toBe('launch')
    expect(minPlanForFeature('aiFeatures').id).toBe('launch')
    expect(minPlanForFeature('integrations').id).toBe('pro')
    expect(minPlanForFeature('negotiation').id).toBe('pro')
    expect(minPlanForFeature('teamCollaboration').id).toBe('pro')
    expect(minPlanForFeature('whiteLabel').id).toBe('launch')
    expect(minPlanForFeature('prioritySupport').id).toBe('scale')
    expect(minPlanForFeature('sso').id).toBe('enterprise')
  })
})

describe('shared upgrade decisions', () => {
  it('returns one serializable feature decision for enforcement and UX copy', () => {
    expect(getFeatureUpgradeDecision('free', 'whiteLabel')).toEqual({
      kind: 'feature',
      feature: 'whiteLabel',
      currentPlanId: 'free',
      allowed: false,
      minimumPlanId: 'launch',
      upgradePlanId: 'launch',
    })
    expect(getFeatureUpgradeDecision('pro', 'whiteLabel').upgradePlanId).toBeNull()
  })

  it('targets the lowest plan that can contain requested usage', () => {
    expect(getLimitUpgradeDecision('free', 'publishedListings', 2)).toMatchObject({
      allowed: false,
      currentLimit: 1,
      minimumPlanId: 'launch',
      upgradePlanId: 'launch',
    })
    expect(getLimitUpgradeDecision('pro', 'publishedListings', 26)).toMatchObject({
      allowed: false,
      minimumPlanId: 'scale',
      upgradePlanId: 'scale',
    })
    expect(getLimitUpgradeDecision('scale', 'storefronts', 11)).toMatchObject({
      allowed: false,
      minimumPlanId: 'enterprise',
      upgradePlanId: 'enterprise',
    })
    expect(getLimitUpgradeDecision('enterprise', 'teamSeats', 100_000)).toMatchObject({
      allowed: true,
      currentLimit: null,
      upgradePlanId: null,
    })
  })

  it('rejects invalid usage inputs instead of failing open', () => {
    expect(() => getLimitUpgradeDecision('free', 'storefronts', -1)).toThrow(RangeError)
    expect(() => getLimitUpgradeDecision('free', 'storefronts', 1.5)).toThrow(RangeError)
  })
})

describe('getPlanRank', () => {
  it('orders the tiers and defaults unknown to 0 (free)', () => {
    expect(getPlanRank('free')).toBe(0)
    expect(getPlanRank('pro')).toBe(2)
    expect(getPlanRank('enterprise')).toBe(4)
    expect(getPlanRank(null)).toBe(0)
    expect(getPlanRank('nope')).toBe(0)
  })
})

describe('getBillingPlan', () => {
  it('looks up by id, undefined for unknown', () => {
    expect(getBillingPlan('pro')?.name).toBe('Pro')
    expect(getBillingPlan('nope')).toBeUndefined()
  })
})

// The account settings page advertised "Private API keys: Planned for Scale" long
// after keys shipped, and after apiAccess moved Scale -> Pro (rank 3 -> 2). That copy
// is now derived from minPlanForFeature rather than written by hand; these pin the
// tiers the product surfaces actually claim, so a future rank move is caught here
// instead of by a customer reading a stale promise.
describe('tiers the UI advertises', () => {
  it('apiAccess is Pro, not Scale', () => {
    expect(minPlanForFeature('apiAccess').name).toBe('Pro')
  })

  it('the Pro automation and collaboration bundle is consistent', () => {
    for (const feature of ['teamCollaboration', 'integrations', 'outboundWebhooks', 'negotiation', 'analyticsHistory'] as const) {
      expect(minPlanForFeature(feature).name).toBe('Pro')
    }
  })

  it('customDomain and whiteLabel are Launch', () => {
    expect(minPlanForFeature('customDomain').name).toBe('Launch')
    expect(minPlanForFeature('whiteLabel').name).toBe('Launch')
  })

  it('Scale and Enterprise still own what is genuinely theirs', () => {
    expect(minPlanForFeature('prioritySupport').name).toBe('Scale')
    expect(minPlanForFeature('sso').name).toBe('Enterprise')
  })
})
