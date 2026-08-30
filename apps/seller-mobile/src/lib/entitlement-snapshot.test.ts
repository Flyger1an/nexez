import { describe, expect, it } from 'vitest'
import { PLAN_FEATURES, billingPlans } from '../../../../lib/billing'
import type { OwnerPlanEntitlements, PlanId } from '@/src/types/nexez'
import {
  isCurrentMobileEntitlementSnapshot,
  MOBILE_ENTITLEMENT_FEATURE_KEYS,
  MOBILE_ENTITLEMENT_SCHEMA_VERSION,
  MOBILE_ENTITLEMENT_SNAPSHOT_MAX_AGE_MS,
  MOBILE_PLAN_RANK,
  mobileEntitlementSnapshotExpiresAt,
} from './entitlement-snapshot'

const NOW = new Date('2026-08-22T18:00:00.000Z')
const OWNER = 'owner-1'

function entitlements(planId: PlanId = 'pro'): OwnerPlanEntitlements {
  const rank = { free: 0, launch: 1, pro: 2, scale: 3, enterprise: 4 }[planId]
  return {
    schemaVersion: 1,
    evaluatedAt: NOW.toISOString(),
    ownerId: OWNER,
    featurePlanId: planId,
    featurePlanRank: rank,
    featurePlanSource: planId === 'free' ? 'free' : 'subscription',
    commercialPlanId: planId,
    commercialPlanRank: rank,
    commercialPlanSource: planId === 'free' ? 'free' : 'subscription',
    billing: { chosenPlanId: planId === 'free' ? null : planId, status: 'active', confers: planId !== 'free', trialEndsAt: null },
    promotion: null,
    limits: { listings: 25, customDomains: 5, teamSeats: 3, storefronts: 3 },
    features: {
      customDomain: true,
      aiFeatures: true,
      removeBadge: true,
      whiteLabel: true,
      integrations: true,
      outboundWebhooks: true,
      apiAccess: true,
      negotiation: true,
      analyticsHistory: true,
      teamCollaboration: true,
      prioritySupport: false,
      sso: false,
    },
    commissionBps: 500,
    commissionSource: 'plan_default',
  }
}

describe('shared mobile entitlement snapshot validation', () => {
  it('keeps the mobile plan ranks and feature schema synchronized with the web catalog', () => {
    expect(MOBILE_ENTITLEMENT_SCHEMA_VERSION).toBe(1)
    expect(MOBILE_PLAN_RANK).toEqual(Object.fromEntries(billingPlans.map((plan) => [plan.id, plan.rank])))
    expect([...MOBILE_ENTITLEMENT_FEATURE_KEYS].sort()).toEqual([...PLAN_FEATURES].sort())
  })

  it.each([
    ['free', 0],
    ['launch', 1],
    ['pro', 2],
    ['scale', 3],
    ['enterprise', 4],
  ] as const)('accepts the exact %s plan/rank pair', (planId, rank) => {
    expect(isCurrentMobileEntitlementSnapshot({
      ...entitlements(planId),
      featurePlanRank: rank,
      commercialPlanRank: rank,
    }, OWNER, NOW)).toBe(true)
  })

  it('rejects non-exact feature and commercial plan/rank pairs', () => {
    const current = entitlements('pro')
    expect(isCurrentMobileEntitlementSnapshot({ ...current, featurePlanRank: 3 }, OWNER, NOW)).toBe(false)
    expect(isCurrentMobileEntitlementSnapshot({ ...current, commercialPlanRank: 3 }, OWNER, NOW)).toBe(false)
    expect(isCurrentMobileEntitlementSnapshot({ ...current, featurePlanId: 'unknown' }, OWNER, NOW)).toBe(false)
  })

  it('rejects cross-owner, stale, future, malformed-feature, and wrong-schema snapshots', () => {
    const current = entitlements()
    const staleAt = new Date(NOW.getTime() - MOBILE_ENTITLEMENT_SNAPSHOT_MAX_AGE_MS - 1).toISOString()
    const futureAt = new Date(NOW.getTime() + MOBILE_ENTITLEMENT_SNAPSHOT_MAX_AGE_MS + 1).toISOString()

    expect(isCurrentMobileEntitlementSnapshot(current, 'other-owner', NOW)).toBe(false)
    expect(isCurrentMobileEntitlementSnapshot({ ...current, evaluatedAt: staleAt }, OWNER, NOW)).toBe(false)
    expect(isCurrentMobileEntitlementSnapshot({ ...current, evaluatedAt: futureAt }, OWNER, NOW)).toBe(false)
    expect(isCurrentMobileEntitlementSnapshot({ ...current, features: { integrations: true } }, OWNER, NOW)).toBe(false)
    expect(isCurrentMobileEntitlementSnapshot({ ...current, schemaVersion: 2 }, OWNER, NOW)).toBe(false)
  })

  it('exposes the exact expiry used by cached mobile surfaces', () => {
    expect(mobileEntitlementSnapshotExpiresAt(entitlements())).toBe(
      NOW.getTime() + MOBILE_ENTITLEMENT_SNAPSHOT_MAX_AGE_MS,
    )
    expect(mobileEntitlementSnapshotExpiresAt({ evaluatedAt: 'invalid' })).toBeNull()
  })
})
