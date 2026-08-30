import type { BillingSubscription, OwnerPlanEntitlements } from '@/src/types/nexez'
import {
  isCurrentMobileEntitlementSnapshot,
  MOBILE_ENTITLEMENT_SNAPSHOT_MAX_AGE_MS,
} from './entitlement-snapshot'
import {
  MOBILE_CONNECTOR_CATALOG,
  type MobileConnectorProvider,
} from './mobile-connector-catalog'

export type MobileIntegrationId =
  | 'stripe-payouts'
  | 'stripe-catalog'
  | 'calendly'
  | 'google-calendar'
  | 'shopify-app'
  | 'shopify-admin'
  | 'square'
  | 'acuity'
  | 'woocommerce'
  | 'servicem8'
  | 'website-importer'

export type MobileIntegrationRow = {
  id: MobileIntegrationId
  provider: MobileConnectorProvider | null
  name: string
  description: string
  webPath: string
  premium: boolean
  locked: boolean
  ready: boolean
  actionLabel: 'Connect' | 'Finish setup' | 'Import' | 'Manage' | 'Set up' | 'Upgrade'
}

type MobileIntegrationDefinition = Omit<MobileIntegrationRow, 'locked' | 'ready' | 'actionLabel'>

export const MOBILE_INTEGRATION_ENTITLEMENT_MAX_AGE_MS = MOBILE_ENTITLEMENT_SNAPSHOT_MAX_AGE_MS

const PREMIUM_INTEGRATIONS: readonly MobileIntegrationDefinition[] = [
  {
    id: 'stripe-catalog',
    provider: 'stripe',
    name: 'Stripe catalog',
    description: 'Import and sync Stripe products and prices',
    webPath: '/dashboard/tools',
    premium: true,
  },
  {
    id: 'calendly',
    provider: 'calendly',
    name: MOBILE_CONNECTOR_CATALOG.calendly.label,
    description: MOBILE_CONNECTOR_CATALOG.calendly.description,
    webPath: MOBILE_CONNECTOR_CATALOG.calendly.webPath,
    premium: MOBILE_CONNECTOR_CATALOG.calendly.premium,
  },
  {
    id: 'google-calendar',
    provider: 'google_calendar',
    name: MOBILE_CONNECTOR_CATALOG.google_calendar.label,
    description: MOBILE_CONNECTOR_CATALOG.google_calendar.description,
    webPath: MOBILE_CONNECTOR_CATALOG.google_calendar.webPath,
    premium: MOBILE_CONNECTOR_CATALOG.google_calendar.premium,
  },
  {
    id: 'shopify-admin',
    provider: 'shopify',
    name: 'Shopify manual credentials',
    description: 'Manual Admin API import requires Pro; the installed Shopify app is available on every plan',
    webPath: '/dashboard/tools',
    premium: true,
  },
  {
    id: 'square',
    provider: 'square',
    name: MOBILE_CONNECTOR_CATALOG.square.label,
    description: MOBILE_CONNECTOR_CATALOG.square.description,
    webPath: MOBILE_CONNECTOR_CATALOG.square.webPath,
    premium: MOBILE_CONNECTOR_CATALOG.square.premium,
  },
  {
    id: 'acuity',
    provider: 'acuity',
    name: MOBILE_CONNECTOR_CATALOG.acuity.label,
    description: MOBILE_CONNECTOR_CATALOG.acuity.description,
    webPath: MOBILE_CONNECTOR_CATALOG.acuity.webPath,
    premium: MOBILE_CONNECTOR_CATALOG.acuity.premium,
  },
  {
    id: 'woocommerce',
    provider: 'woocommerce',
    name: MOBILE_CONNECTOR_CATALOG.woocommerce.label,
    description: MOBILE_CONNECTOR_CATALOG.woocommerce.description,
    webPath: MOBILE_CONNECTOR_CATALOG.woocommerce.webPath,
    premium: MOBILE_CONNECTOR_CATALOG.woocommerce.premium,
  },
  {
    id: 'servicem8',
    provider: 'servicem8',
    name: MOBILE_CONNECTOR_CATALOG.servicem8.label,
    description: MOBILE_CONNECTOR_CATALOG.servicem8.description,
    webPath: MOBILE_CONNECTOR_CATALOG.servicem8.webPath,
    premium: MOBILE_CONNECTOR_CATALOG.servicem8.premium,
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
    provider: 'stripe',
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
        : 'Connect'
      : 'Upgrade',
  }))

  return [
    payouts,
    {
      id: 'shopify-app',
      provider: 'shopify',
      name: MOBILE_CONNECTOR_CATALOG.shopify.label,
      description: MOBILE_CONNECTOR_CATALOG.shopify.description,
      webPath: MOBILE_CONNECTOR_CATALOG.shopify.webPath,
      premium: MOBILE_CONNECTOR_CATALOG.shopify.premium,
      locked: false,
      ready: false,
      actionLabel: 'Set up',
    },
    ...premiumRows,
    {
      id: 'website-importer',
      provider: null,
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
