import { describe, expect, it } from 'vitest'
import type { OwnerPlanEntitlements, PlanId } from '@/src/types/nexez'
import type { IntakeGap } from '@/src/types/intake'
import { buildMobileIntakeQuickAnswers, mobileIntakeNegotiationAllowed } from './intake-entitlements'

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

const postureGap: IntakeGap = {
  id: 'offer:services-0:posture',
  field: 'offerType',
  offerKey: 'services-0',
  question: 'Fixed or open?',
  why: 'Choose a posture.',
  priority: 210,
  kind: 'opportunity',
}

describe('mobile intake negotiation entitlement', () => {
  it.each([
    ['free', false],
    ['launch', false],
    ['pro', true],
    ['scale', true],
    ['enterprise', true],
  ] as const)('maps %s to the authoritative negotiation capability', (planId, allowed) => {
    expect(mobileIntakeNegotiationAllowed(entitlements(planId, allowed), OWNER, NOW)).toBe(allowed)
  })

  it('fails closed for missing, cross-owner, rank-spoofed, stale, and flag-spoofed snapshots', () => {
    expect(mobileIntakeNegotiationAllowed(null, OWNER, NOW)).toBe(false)
    expect(mobileIntakeNegotiationAllowed({ ...entitlements('pro', true), ownerId: 'other' }, OWNER, NOW)).toBe(false)
    expect(mobileIntakeNegotiationAllowed({ ...entitlements('pro', true), featurePlanRank: 3 }, OWNER, NOW)).toBe(false)
    expect(mobileIntakeNegotiationAllowed({ ...entitlements('pro', true), evaluatedAt: '2026-08-22T17:55:59.000Z' }, OWNER, NOW)).toBe(false)
    expect(mobileIntakeNegotiationAllowed(entitlements('free', true), OWNER, NOW)).toBe(false)
    expect(mobileIntakeNegotiationAllowed(entitlements('pro', false), OWNER, NOW)).toBe(false)
  })

  it('keeps Fixed and Skip usable while locking only Open to offers below Pro', () => {
    const answers = buildMobileIntakeQuickAnswers(postureGap, false)
    expect(answers.map(({ label, locked }) => ({ label, locked: Boolean(locked) }))).toEqual([
      { label: 'Fixed price', locked: false },
      { label: 'Open to offers', locked: true },
      { label: 'Skip', locked: false },
    ])
    expect(answers[1].answer.fields?.[0]).toMatchObject({ field: 'offerType', value: 'negotiable' })
  })

  it('unlocks the structured negotiable answer on Pro', () => {
    expect(buildMobileIntakeQuickAnswers(postureGap, true).find((answer) => answer.label === 'Open to offers')?.locked).toBe(false)
  })
})
