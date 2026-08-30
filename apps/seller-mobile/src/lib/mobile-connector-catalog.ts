export const MOBILE_CONNECTOR_PROVIDERS = [
  'calendly',
  'shopify',
  'square',
  'acuity',
  'stripe',
  'google_calendar',
  'woocommerce',
  'servicem8',
] as const

export type MobileConnectorProvider = (typeof MOBILE_CONNECTOR_PROVIDERS)[number]

export type MobileConnectorCapability =
  | 'catalog'
  | 'inventory'
  | 'orders'
  | 'payments'
  | 'settlements'
  | 'availability'
  | 'booking_profiles'
  | 'bookings'
  | 'job_templates'
  | 'jobs'
  | 'webhooks'

export type MobileConnectorAuthKind = 'oauth' | 'app_authorization' | 'connect'

type MobileConnectorCatalogEntry = {
  provider: MobileConnectorProvider
  label: string
  auth: MobileConnectorAuthKind
  capabilities: readonly MobileConnectorCapability[]
  description: string
  webPath: '/dashboard/integrations' | '/dashboard/shopify' | '/dashboard/billing'
  premium: boolean
}

/**
 * Dependency-free mirror of the platform connector contract. Metro consumes
 * this copy, while a root parity test prevents it from drifting from the web
 * manifest.
 */
export const MOBILE_CONNECTOR_CATALOG = {
  calendly: {
    provider: 'calendly',
    label: 'Calendly',
    auth: 'oauth',
    capabilities: ['catalog', 'availability', 'bookings', 'webhooks'],
    description: 'Connect with OAuth to import event types, sync availability and bookings, and receive updates',
    webPath: '/dashboard/integrations',
    premium: true,
  },
  shopify: {
    provider: 'shopify',
    label: 'Shopify App Store',
    auth: 'oauth',
    capabilities: ['catalog', 'inventory', 'orders', 'webhooks'],
    description: 'Install Nexez from Shopify admin for catalog, inventory, order, and webhook sync on every plan',
    webPath: '/dashboard/shopify',
    premium: false,
  },
  square: {
    provider: 'square',
    label: 'Square',
    auth: 'oauth',
    capabilities: ['catalog', 'booking_profiles', 'bookings'],
    description: 'Connect with OAuth to import catalog items and booking profiles while preserving live booking links',
    webPath: '/dashboard/integrations',
    premium: true,
  },
  acuity: {
    provider: 'acuity',
    label: 'Acuity Scheduling',
    auth: 'oauth',
    capabilities: ['catalog'],
    description: 'Connect with OAuth to import live appointment types as offers',
    webPath: '/dashboard/integrations',
    premium: true,
  },
  stripe: {
    provider: 'stripe',
    label: 'Stripe payouts',
    auth: 'connect',
    capabilities: ['catalog', 'payments', 'settlements', 'webhooks'],
    description: 'Use Stripe Connect for payments, settlements, and payout readiness',
    webPath: '/dashboard/billing',
    premium: false,
  },
  google_calendar: {
    provider: 'google_calendar',
    label: 'Google Calendar',
    auth: 'oauth',
    capabilities: ['availability'],
    description: 'Connect with OAuth to use live free/busy availability without reading event details',
    webPath: '/dashboard/integrations',
    premium: true,
  },
  woocommerce: {
    provider: 'woocommerce',
    label: 'WooCommerce',
    auth: 'app_authorization',
    capabilities: ['catalog', 'inventory', 'orders'],
    description: 'Authorize read-only catalog, inventory, and order access from your WooCommerce store',
    webPath: '/dashboard/integrations',
    premium: true,
  },
  servicem8: {
    provider: 'servicem8',
    label: 'ServiceM8',
    auth: 'oauth',
    capabilities: ['job_templates', 'jobs'],
    description: 'Connect with OAuth to import active job templates and verify live job access',
    webPath: '/dashboard/integrations',
    premium: true,
  },
} as const satisfies Record<MobileConnectorProvider, MobileConnectorCatalogEntry>
