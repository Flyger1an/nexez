import { describe, it, expect } from 'vitest'
import {
  billingPlans,
  getBillingPlan,
  getPlanLimits,
  getPlanRank,
  minPlanForFeature,
  planAllows,
  type PlanId,
} from '../billing'

describe('billing catalog', () => {
  it('has the five tiers in ascending rank with a clean prices/ids', () => {
    expect(billingPlans.map((p) => p.id)).toEqual(['free', 'launch', 'pro', 'scale', 'enterprise'])
    expect(billingPlans.map((p) => p.rank)).toEqual([0, 1, 2, 3, 4])
  })

  it('commission steps DOWN monotonically as the plan steps up (upgrade incentive)', () => {
    const rates = billingPlans.map((p) => p.commissionPercent)
    expect(rates).toEqual([15, 8, 6, 4, 2])
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeLessThan(rates[i - 1])
  })

  it('page limits ladder up; enterprise is unlimited', () => {
    expect(getPlanLimits('free').pages).toBe(1)
    expect(getPlanLimits('launch').pages).toBe(3)
    expect(getPlanLimits('pro').pages).toBe(25)
    expect(getPlanLimits('scale').pages).toBe(100)
    expect(getPlanLimits('enterprise').pages).toBe(Number.POSITIVE_INFINITY)
    // unknown/null falls back to Free limits (fail-safe)
    expect(getPlanLimits(null).pages).toBe(1)
    expect(getPlanLimits('bogus').pages).toBe(1)
  })

  it('team-seat quotas ladder up (the new differentiator for Scale/Enterprise)', () => {
    expect(getPlanLimits('launch').teamSeats).toBe(0) // team collab not available below Pro
    expect(getPlanLimits('pro').teamSeats).toBe(3)
    expect(getPlanLimits('scale').teamSeats).toBe(10)
    expect(getPlanLimits('enterprise').teamSeats).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('planAllows (cumulative feature gating)', () => {
  it('gates Launch-tier features (customDomain / aiFeatures / removeBadge)', () => {
    for (const f of ['customDomain', 'aiFeatures', 'removeBadge'] as const) {
      expect(planAllows('free', f)).toBe(false)
      expect(planAllows('launch', f)).toBe(true)
      expect(planAllows('pro', f)).toBe(true) // higher tiers inherit
      expect(planAllows('enterprise', f)).toBe(true)
    }
  })

  it('gates Pro-tier features - incl. team collaboration + white-label (moved down from Scale)', () => {
    for (const f of ['integrations', 'outboundWebhooks', 'apiAccess', 'negotiation', 'analyticsHistory', 'teamCollaboration', 'whiteLabel'] as const) {
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
})

describe('minPlanForFeature (the "Upgrade to X" target)', () => {
  it('resolves the cheapest plan that unlocks each feature', () => {
    expect(minPlanForFeature('customDomain').id).toBe('launch')
    expect(minPlanForFeature('aiFeatures').id).toBe('launch')
    expect(minPlanForFeature('integrations').id).toBe('pro')
    expect(minPlanForFeature('negotiation').id).toBe('pro')
    expect(minPlanForFeature('teamCollaboration').id).toBe('pro') // moved down from Scale
    expect(minPlanForFeature('whiteLabel').id).toBe('pro')
    expect(minPlanForFeature('prioritySupport').id).toBe('scale')
    expect(minPlanForFeature('sso').id).toBe('enterprise')
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
