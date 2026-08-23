import { describe, expect, it } from 'vitest'
import type { OfferItem, OwnerPlanEntitlements, PlanId } from '@/src/types/nexez'
import {
  applyMobileAutoRules,
  clearMobilePaidNegotiationConfiguration,
  mobileNegotiationAuthoringAllowed,
} from './negotiation-entitlements'

const OWNER = 'owner-1'
const NOW = new Date('2026-08-22T18:01:00.000Z')

function entitlements(planId: PlanId, negotiation: boolean): OwnerPlanEntitlements {
  const rank = { free: 0, launch: 1, pro: 2, scale: 3, enterprise: 4 }[planId]
  return {
    schemaVersion: 1,
    evaluatedAt: '2026-08-22T18:00:00.000Z',
    ownerId: OWNER,
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
      negotiation,
      analyticsHistory: false,
      teamCollaboration: false,
      prioritySupport: false,
      sso: false,
    },
    commissionBps: 900,
    commissionSource: 'plan_default',
  }
}

const retained: OfferItem = {
  name: 'Retained offer',
  offerType: 'negotiable',
  rules: {
    minPrice: '$800',
    maxDiscountPercent: 10,
    autoAccept: true,
    autoAcceptWithinPercent: 5,
    autoCounter: true,
    autoSettleMax: '$900',
    minNoticeHours: 48,
    includedScope: 'Setup',
    futureCoreRule: 'keep',
  } as never,
}

describe('mobile negotiation auto-rule entitlements', () => {
  it('removes exactly the paid posture and six paid rule keys', () => {
    expect(clearMobilePaidNegotiationConfiguration(retained)).toEqual({
      name: 'Retained offer',
      rules: { minNoticeHours: 48, includedScope: 'Setup', futureCoreRule: 'keep' },
    })
  })

  it('drops the rules object when cleanup leaves no core rules', () => {
    expect(clearMobilePaidNegotiationConfiguration({
      name: 'Only paid rules',
      offerType: 'negotiable',
      rules: { minPrice: '$800', autoAccept: false },
    })).toEqual({ name: 'Only paid rules' })
  })

  it('keeps downgrade cleanup available without an entitlement snapshot', () => {
    expect(applyMobileAutoRules([retained], {
      enabled: false,
      floor: '',
      authoringAllowed: false,
    })).toEqual([{
      name: 'Retained offer',
      rules: { minNoticeHours: 48, includedScope: 'Setup', futureCoreRule: 'keep' },
    }])
  })

  it('fails closed instead of adding or mutating paid configuration', () => {
    const fixed: OfferItem[] = [{ name: 'Core offer', rules: { minNoticeHours: 24 } }]
    expect(applyMobileAutoRules(fixed, {
      enabled: true,
      floor: '$700',
      authoringAllowed: false,
    })).toBe(fixed)
  })

  it('allows Pro authoring and trims the shared floor', () => {
    expect(applyMobileAutoRules([{ name: 'Core offer', rules: { minNoticeHours: 24 } }], {
      enabled: true,
      floor: '  $700  ',
      authoringAllowed: true,
    })).toEqual([{
      name: 'Core offer',
      offerType: 'negotiable',
      rules: { minNoticeHours: 24, minPrice: '$700', autoAccept: true },
    }])
  })

  it('requires a valid owner-bound Pro-or-higher snapshot', () => {
    expect(mobileNegotiationAuthoringAllowed(entitlements('pro', true), OWNER, NOW)).toBe(true)
    expect(mobileNegotiationAuthoringAllowed(entitlements('free', false), OWNER, NOW)).toBe(false)
    expect(mobileNegotiationAuthoringAllowed(null, OWNER, NOW)).toBe(false)
    expect(mobileNegotiationAuthoringAllowed(entitlements('pro', true), 'other-owner', NOW)).toBe(false)
    expect(mobileNegotiationAuthoringAllowed({ ...entitlements('pro', true), featurePlanRank: 3 }, OWNER, NOW)).toBe(false)
    expect(mobileNegotiationAuthoringAllowed({ ...entitlements('pro', true), evaluatedAt: '2026-08-22T17:55:59.000Z' }, OWNER, NOW)).toBe(false)
  })
})
