import { describe, expect, it, vi } from 'vitest'
import type { OwnerPlanEntitlements, PlanId } from '@/src/types/nexez'
import {
  allowsMobileAnalyticsHistory,
  effectiveMobileAnalyticsRange,
  loadMobileAnalytics,
} from './plan-aware-analytics'

const NOW = new Date('2026-08-22T18:00:00.000Z')
const OWNER_ID = 'owner-123'
const DAY_MS = 86_400_000

function entitlements(planId: PlanId, analyticsHistory: boolean): OwnerPlanEntitlements {
  const rank = { free: 0, launch: 1, pro: 2, scale: 3, enterprise: 4 }[planId]
  return {
    schemaVersion: 1,
    evaluatedAt: NOW.toISOString(),
    ownerId: OWNER_ID,
    featurePlanId: planId,
    featurePlanRank: rank,
    featurePlanSource: planId === 'free' ? 'free' : 'subscription',
    commercialPlanId: planId,
    commercialPlanRank: rank,
    commercialPlanSource: planId === 'free' ? 'free' : 'subscription',
    billing: { chosenPlanId: planId === 'free' ? null : planId, status: planId === 'free' ? null : 'active', confers: planId !== 'free', trialEndsAt: null },
    promotion: null,
    limits: { listings: 1, customDomains: 0, teamSeats: 0, storefronts: 1 },
    features: {
      customDomain: false,
      aiFeatures: false,
      removeBadge: false,
      whiteLabel: false,
      integrations: false,
      outboundWebhooks: false,
      apiAccess: false,
      negotiation: false,
      analyticsHistory,
      teamCollaboration: false,
      prioritySupport: false,
      sso: false,
    },
    commissionBps: 900,
    commissionSource: 'plan_default',
  }
}

describe('mobile analytics history entitlement', () => {
  it.each([
    ['Free', entitlements('free', false)],
    ['Launch', entitlements('launch', false)],
  ])('%s cannot unlock 90-day history', (_label, snapshot) => {
    expect(allowsMobileAnalyticsHistory(snapshot, OWNER_ID, NOW)).toBe(false)
    expect(effectiveMobileAnalyticsRange(90, false)).toBe(30)
    expect(effectiveMobileAnalyticsRange(null, false)).toBe(30)
  })

  it.each([
    ['Pro', entitlements('pro', true)],
    ['Scale', entitlements('scale', true)],
    ['Enterprise', entitlements('enterprise', true)],
  ])('allows %s to select 90-day history', (_label, snapshot) => {
    expect(allowsMobileAnalyticsHistory(snapshot, OWNER_ID, NOW)).toBe(true)
    expect(effectiveMobileAnalyticsRange(90, true)).toBe(90)
    expect(effectiveMobileAnalyticsRange(null, true)).toBeNull()
  })

  it('fails closed for stale, malformed, cross-owner, and inconsistent snapshots', () => {
    const stale = { ...entitlements('pro', true), evaluatedAt: new Date(NOW.getTime() - 5 * 60_000 - 1).toISOString() }
    const malformed = { ...entitlements('pro', true), features: null }
    const crossOwner = { ...entitlements('pro', true), ownerId: 'another-owner' }
    const inconsistent = { ...entitlements('free', false), features: { ...entitlements('free', false).features, analyticsHistory: true } }
    const rankMismatch = { ...entitlements('pro', true), featurePlanRank: 3 }

    for (const snapshot of [stale, malformed, crossOwner, inconsistent, rankMismatch]) {
      expect(allowsMobileAnalyticsHistory(snapshot, OWNER_ID, NOW)).toBe(false)
    }
  })
})

describe('loadMobileAnalytics', () => {
  it.each([
    ['Free', entitlements('free', false), 30],
    ['Launch', entitlements('launch', false), 30],
    ['Pro', entitlements('pro', true), 90],
  ] as const)('uses the effective outbound cutoff for %s', async (_label, snapshot, expectedDays) => {
    const getRollup = vi.fn(async () => ({ total: 12 }))
    const result = await loadMobileAnalytics(
      OWNER_ID,
      90,
      { getEntitlements: async () => snapshot, getRollup },
      NOW,
    )

    expect(result.effectiveRangeDays).toBe(expectedDays)
    expect(result.fullHistory).toBe(expectedDays === 90)
    expect(getRollup).toHaveBeenCalledOnce()
    expect(getRollup).toHaveBeenCalledWith(new Date(NOW.getTime() - expectedDays * DAY_MS))
  })

  it('keeps baseline analytics available but clamps to 30 days when entitlement lookup fails', async () => {
    const getRollup = vi.fn(async () => ({ total: 4 }))
    const result = await loadMobileAnalytics(
      OWNER_ID,
      90,
      { getEntitlements: async () => { throw new Error('network unavailable') }, getRollup },
      NOW,
    )

    expect(result).toEqual({
      rollup: { total: 4 },
      effectiveRangeDays: 30,
      fullHistory: false,
      asOf: NOW.toISOString(),
    })
    expect(getRollup).toHaveBeenCalledWith(new Date(NOW.getTime() - 30 * DAY_MS))
  })

  it('normalizes unsupported range inputs before issuing the query', async () => {
    const getRollup = vi.fn(async () => ({ total: 1 }))
    const result = await loadMobileAnalytics(
      OWNER_ID,
      365,
      { getEntitlements: async () => entitlements('enterprise', true), getRollup },
      NOW,
    )

    expect(result.effectiveRangeDays).toBe(30)
    expect(getRollup).toHaveBeenCalledWith(new Date(NOW.getTime() - 30 * DAY_MS))
  })

  it('uses the canonical epoch cutoff for an entitled All time request', async () => {
    const getRollup = vi.fn(async () => ({ total: 9 }))
    const result = await loadMobileAnalytics(
      OWNER_ID,
      null,
      { getEntitlements: async () => entitlements('pro', true), getRollup },
      NOW,
    )

    expect(result.effectiveRangeDays).toBeNull()
    expect(result.fullHistory).toBe(true)
    expect(getRollup).toHaveBeenCalledWith(new Date(0))
  })

  it('clamps an unentitled All time request to the trailing 30 days', async () => {
    const getRollup = vi.fn(async () => ({ total: 2 }))
    const result = await loadMobileAnalytics(
      OWNER_ID,
      null,
      { getEntitlements: async () => entitlements('launch', false), getRollup },
      NOW,
    )

    expect(result.effectiveRangeDays).toBe(30)
    expect(result.fullHistory).toBe(false)
    expect(getRollup).toHaveBeenCalledWith(new Date(NOW.getTime() - 30 * DAY_MS))
  })
})
