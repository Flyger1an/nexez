import { describe, expect, it } from 'vitest'
import type { BillingSubscription, OwnerPlanEntitlements, PlanId } from '@/src/types/nexez'
import {
  buildMobileIntegrationRows,
  mobileIntegrationDestination,
  mobilePremiumIntegrationsAllowed,
} from './integration-contract'

const NOW = new Date('2026-08-22T18:01:00.000Z')

function catalogInput(
  snapshot: OwnerPlanEntitlements,
  subscription: BillingSubscription | null = null,
) {
  return {
    ownerId: 'owner-1',
    entitlements: snapshot,
    billing: subscription,
    now: NOW,
  }
}

function entitlements(planId: PlanId, integrations: boolean): OwnerPlanEntitlements {
  const rank = { free: 0, launch: 1, pro: 2, scale: 3, enterprise: 4 }[planId]
  return {
    schemaVersion: 1,
    evaluatedAt: '2026-08-22T18:00:00.000Z',
    ownerId: 'owner-1',
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
      integrations,
      outboundWebhooks: false,
      apiAccess: false,
      negotiation: false,
      analyticsHistory: false,
      teamCollaboration: false,
      prioritySupport: false,
      sso: false,
    },
    commissionBps: 900,
    commissionSource: 'plan_default',
  }
}

function billing(overrides: Partial<BillingSubscription> = {}): BillingSubscription {
  return {
    owner_id: 'owner-1',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_price_id: null,
    plan_id: 'free',
    status: 'active',
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    metadata: null,
    ...overrides,
  }
}

describe('mobile integration contract', () => {
  it.each([
    ['free', false],
    ['launch', false],
    ['pro', true],
    ['scale', true],
    ['enterprise', true],
  ] as const)('keeps foundational payout setup and the installed Shopify app available on %s', (planId, integrations) => {
    const rows = buildMobileIntegrationRows({
      ownerId: 'owner-1',
      entitlements: entitlements(planId, integrations),
      billing: null,
      now: NOW,
    })
    const payouts = rows.find((row) => row.id === 'stripe-payouts')
    const shopifyApp = rows.find((row) => row.id === 'shopify-app')

    expect(payouts).toMatchObject({
      id: 'stripe-payouts',
      premium: false,
      locked: false,
      webPath: '/dashboard/billing',
      actionLabel: 'Set up',
    })
    expect(shopifyApp).toMatchObject({
      premium: false,
      locked: false,
      webPath: '/dashboard/shopify',
      actionLabel: 'Set up',
    })
    expect(shopifyApp && mobileIntegrationDestination(shopifyApp)).toBe('/dashboard/shopify')
  })

  it.each([
    ['Free', entitlements('free', false)],
    ['Launch', entitlements('launch', false)],
  ])('keeps payout setup open but locks every premium connector on %s', (_label, snapshot) => {
    const rows = buildMobileIntegrationRows(catalogInput(snapshot))
    const payouts = rows.find((row) => row.id === 'stripe-payouts')
    const premium = rows.filter((row) => row.premium)

    expect(payouts).toMatchObject({ locked: false, webPath: '/dashboard/billing', actionLabel: 'Set up' })
    expect(premium.map((row) => row.id)).toEqual([
      'stripe-catalog',
      'calendly',
      'google-calendar',
      'shopify-admin',
      'square',
      'acuity',
    ])
    expect(premium.every((row) => row.locked && row.actionLabel === 'Upgrade')).toBe(true)
    expect(premium.every((row) => mobileIntegrationDestination(row) === '/dashboard/billing?plan=pro')).toBe(true)
  })

  it.each([
    ['Pro', entitlements('pro', true)],
    ['Scale', entitlements('scale', true)],
    ['Enterprise', entitlements('enterprise', true)],
  ])('unlocks premium connectors from the authoritative %s entitlement', (_label, snapshot) => {
    const rows = buildMobileIntegrationRows(catalogInput(snapshot))
    expect(rows.filter((row) => row.premium).every((row) => !row.locked)).toBe(true)
  })

  it('does not confuse charges-only Connect state with payout readiness', () => {
    const rows = buildMobileIntegrationRows({
      ownerId: 'owner-1',
      entitlements: entitlements('free', false),
      billing: billing({
        stripe_connect_account_id: 'acct_partial',
        stripe_connect_charges_enabled: true,
        stripe_connect_payouts_enabled: false,
      }),
      now: NOW,
    })

    expect(rows[0]).toMatchObject({
      id: 'stripe-payouts',
      ready: false,
      locked: false,
      actionLabel: 'Finish setup',
    })
  })

  it('labels the gated Shopify row as manual credentials, not the all-plan installed app', () => {
    const shopify = buildMobileIntegrationRows({
      ownerId: 'owner-1',
      entitlements: entitlements('free', false),
      billing: null,
      now: NOW,
    }).find((row) => row.id === 'shopify-admin')

    expect(shopify).toMatchObject({
      name: 'Shopify manual credentials',
      premium: true,
      locked: true,
      actionLabel: 'Upgrade',
    })
    expect(shopify?.description).toMatch(/installed Shopify app is available on every plan/i)
  })

  it('describes Google Calendar truthfully as sample-only and opens listings', () => {
    const google = buildMobileIntegrationRows({
      ownerId: 'owner-1',
      entitlements: entitlements('pro', true),
      billing: null,
      now: NOW,
    }).find((row) => row.id === 'google-calendar')

    expect(google).toMatchObject({
      premium: true,
      locked: false,
      webPath: '/dashboard',
      actionLabel: 'Open listings',
    })
    expect(google?.description).toMatch(/sample availability/i)
    expect(google?.description).toMatch(/no Google Calendar connection or sync/i)
    expect(google && mobileIntegrationDestination(google)).toBe('/dashboard')
  })

  it('marks payouts ready only with account, charges, and payouts', () => {
    const rows = buildMobileIntegrationRows({
      ownerId: 'owner-1',
      entitlements: entitlements('free', false),
      billing: billing({
        stripe_connect_account_id: 'acct_ready',
        stripe_connect_charges_enabled: true,
        stripe_connect_payouts_enabled: true,
      }),
      now: NOW,
    })

    expect(rows[0]).toMatchObject({ ready: true, actionLabel: 'Manage' })
  })

  it('fails premium access closed when the snapshot is missing or malformed', () => {
    expect(mobilePremiumIntegrationsAllowed(null, 'owner-1', NOW)).toBe(false)
    expect(mobilePremiumIntegrationsAllowed({ schemaVersion: 1, features: null }, 'owner-1', NOW)).toBe(false)
  })

  it('fails closed for internally inconsistent or unknown premium snapshots', () => {
    const freeWithSpoofedFlag = entitlements('free', true)
    const proWithFreeRank = { ...entitlements('pro', true), featurePlanRank: 0 }
    const proWithScaleRank = { ...entitlements('pro', true), featurePlanRank: 3 }
    const unknownPlan = { ...entitlements('pro', true), featurePlanId: 'unknown', featurePlanRank: 99 }

    expect(mobilePremiumIntegrationsAllowed(freeWithSpoofedFlag, 'owner-1', NOW)).toBe(false)
    expect(mobilePremiumIntegrationsAllowed(proWithFreeRank, 'owner-1', NOW)).toBe(false)
    expect(mobilePremiumIntegrationsAllowed(proWithScaleRank, 'owner-1', NOW)).toBe(false)
    expect(mobilePremiumIntegrationsAllowed(unknownPlan, 'owner-1', NOW)).toBe(false)
  })

  it('fails closed for a cross-owner, stale, future, or invalid entitlement snapshot', () => {
    const current = entitlements('pro', true)
    const stale = { ...current, evaluatedAt: '2026-08-22T17:55:59.000Z' }
    const future = { ...current, evaluatedAt: '2026-08-22T18:06:01.000Z' }

    expect(mobilePremiumIntegrationsAllowed(current, 'other-owner', NOW)).toBe(false)
    expect(mobilePremiumIntegrationsAllowed(stale, 'owner-1', NOW)).toBe(false)
    expect(mobilePremiumIntegrationsAllowed(future, 'owner-1', NOW)).toBe(false)
    expect(mobilePremiumIntegrationsAllowed({ ...current, evaluatedAt: 'not-a-date' }, 'owner-1', NOW)).toBe(false)
  })
})
