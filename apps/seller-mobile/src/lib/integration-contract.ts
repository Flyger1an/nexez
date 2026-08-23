import type { BillingSubscription, OwnerPlanEntitlements } from '@/src/types/nexez'
import {
  isCurrentMobileEntitlementSnapshot,
  MOBILE_ENTITLEMENT_SNAPSHOT_MAX_AGE_MS,
} from './entitlement-snapshot'

export type MobileIntegrationId =
  | 'stripe-payouts'
  | 'stripe-catalog'
  | 'calendly'
  | 'google-calendar'
  | 'shopify-app'
  | 'shopify-admin'
  | 'square'
  | 'acuity'
  | 'website-importer'

export type MobileIntegrationRow = {
  id: MobileIntegrationId
  name: string
  description: string
  webPath: string
  premium: boolean
  locked: boolean
  ready: boolean
  actionLabel: 'Connect' | 'Finish setup' | 'Import' | 'Manage' | 'Open listings' | 'Set up' | 'Upgrade'
}

type MobileIntegrationDefinition = Omit<MobileIntegrationRow, 'locked' | 'ready' | 'actionLabel'>

export const MOBILE_INTEGRATION_ENTITLEMENT_MAX_AGE_MS = MOBILE_ENTITLEMENT_SNAPSHOT_MAX_AGE_MS

const PREMIUM_INTEGRATIONS: readonly MobileIntegrationDefinition[] = [
  {
    id: 'stripe-catalog',
    name: 'Stripe catalog',
    description: 'Import and sync Stripe products and prices',
    webPath: '/dashboard/tools',
    premium: true,
  },
  {
    id: 'calendly',
    name: 'Calendly',
    description: 'Import event types and booking links',
    webPath: '/dashboard/integrations',
    premium: true,
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Generate sample availability windows; no Google Calendar connection or sync',
    webPath: '/dashboard',
    premium: true,
  },
  {
    id: 'shopify-admin',
    name: 'Shopify manual credentials',
    description: 'Manual Admin API import requires Pro; the installed Shopify app is available on every plan',
    webPath: '/dashboard/integrations',
    premium: true,
  },
  {
    id: 'square',
    name: 'Square',
    description: 'Import POS and inventory context',
    webPath: '/dashboard/integrations',
    premium: true,
  },
  {
    id: 'acuity',
    name: 'Acuity Scheduling',
    description: 'Import appointment types and durations',
    webPath: '/dashboard/integrations',
    premium: true,
  },
]

/** Keep this dependency-free for Metro. It intentionally mirrors the web
 * settlement contract: account id + charges + payouts, all explicit. */
function getMobileStripeConnectPayoutReadiness(
  billing: BillingSubscription | null | undefined,
) {
  const accountCreated = typeof billing?.stripe_connect_account_id === 'string'
    && billing.stripe_connect_account_id.trim().length > 0
  const chargesEnabled = billing?.stripe_connect_charges_enabled === true
  const payoutsEnabled = billing?.stripe_connect_payouts_enabled === true
  return {
    accountCreated,
    ready: accountCreated && chargesEnabled && payoutsEnabled,
  }
}

/** Entitlements come from get_my_plan_entitlements. Anything except an explicit
 * true is treated as no premium integration access. */
export function mobilePremiumIntegrationsAllowed(
  value: unknown,
  ownerId: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return isCurrentMobileEntitlementSnapshot(value, ownerId, now)
    && value.featurePlanRank >= 2
    && value.features.integrations === true
}

/**
 * Build the mobile integration catalog from the authoritative entitlement
 * snapshot. Stripe payouts and the installed Shopify App Store connector are
 * deliberately separate from premium catalog sync and stay accessible on Free.
 */
export function buildMobileIntegrationRows(input: {
  ownerId: string | null | undefined
  entitlements: OwnerPlanEntitlements | null | undefined
  billing: BillingSubscription | null | undefined
  now?: Date
}): MobileIntegrationRow[] {
  const premiumAllowed = mobilePremiumIntegrationsAllowed(input.entitlements, input.ownerId, input.now)
  const payoutReadiness = getMobileStripeConnectPayoutReadiness(input.billing)
  const payoutAction = payoutReadiness.ready
    ? 'Manage'
    : payoutReadiness.accountCreated
      ? 'Finish setup'
      : 'Set up'

  const payouts: MobileIntegrationRow = {
    id: 'stripe-payouts',
    name: 'Stripe payouts',
    description: payoutReadiness.ready
      ? 'Charges and payouts are enabled'
      : payoutReadiness.accountCreated
        ? 'Complete Stripe setup to enable charges and payouts'
        : 'Receive agent-driven transaction revenue',
    webPath: '/dashboard/billing',
    premium: false,
    locked: false,
    ready: payoutReadiness.ready,
    actionLabel: payoutAction,
  }

  const premiumRows: MobileIntegrationRow[] = PREMIUM_INTEGRATIONS.map((integration) => ({
    ...integration,
    locked: !premiumAllowed,
    ready: false,
    actionLabel: premiumAllowed
      ? integration.id === 'stripe-catalog'
        ? 'Import'
        : integration.id === 'google-calendar'
          ? 'Open listings'
          : 'Connect'
      : 'Upgrade',
  }))

  return [
    payouts,
    {
      id: 'shopify-app',
      name: 'Shopify App Store',
      description: 'Install Nexez from Shopify admin for catalog sync on every plan',
      webPath: '/dashboard/shopify',
      premium: false,
      locked: false,
      ready: false,
      actionLabel: 'Set up',
    },
    ...premiumRows,
    {
      id: 'website-importer',
      name: 'Website importer',
      description: 'Build a draft from your public website',
      webPath: '/create',
      premium: false,
      locked: false,
      ready: false,
      actionLabel: 'Import',
    },
  ]
}

/** Locked connectors route to the canonical Pro upgrade; every unlocked row
 * keeps its actual setup or management destination. */
export function mobileIntegrationDestination(row: MobileIntegrationRow): string {
  return row.locked ? '/dashboard/billing?plan=pro' : row.webPath
}
