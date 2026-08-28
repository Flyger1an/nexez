export const CONNECTOR_PROVIDERS = [
  'calendly',
  'shopify',
  'square',
  'acuity',
  'stripe',
  'google_calendar',
  'woocommerce',
  'servicem8',
] as const

export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number]

export type ConnectorCapability =
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
  | 'scheduling'
  | 'webhooks'

export type ConnectorAuthKind = 'token' | 'oauth' | 'app_authorization' | 'connect'

export type ConnectorManifestEntry = {
  provider: ConnectorProvider
  label: string
  auth: ConnectorAuthKind
  capabilities: readonly ConnectorCapability[]
  syncsOffers: boolean
  autoSync: boolean
  plan: 'core' | 'integrations'
}

export const CONNECTOR_MANIFEST = {
  calendly: {
    provider: 'calendly',
    label: 'Calendly',
    auth: 'oauth',
    capabilities: ['catalog', 'availability', 'bookings', 'webhooks'],
    syncsOffers: true,
    autoSync: true,
    plan: 'integrations',
  },
  shopify: {
    provider: 'shopify',
    label: 'Shopify',
    auth: 'oauth',
    capabilities: ['catalog', 'inventory', 'orders', 'webhooks'],
    syncsOffers: true,
    autoSync: true,
    plan: 'core',
  },
  square: {
    provider: 'square',
    label: 'Square',
    auth: 'oauth',
    capabilities: ['catalog', 'booking_profiles', 'bookings'],
    syncsOffers: true,
    autoSync: false,
    plan: 'integrations',
  },
  acuity: {
    provider: 'acuity',
    label: 'Acuity',
    auth: 'oauth',
    capabilities: ['catalog'],
    syncsOffers: true,
    autoSync: false,
    plan: 'integrations',
  },
  stripe: {
    provider: 'stripe',
    label: 'Stripe payouts',
    auth: 'connect',
    capabilities: ['catalog', 'payments', 'settlements', 'webhooks'],
    syncsOffers: false,
    autoSync: true,
    plan: 'core',
  },
  google_calendar: {
    provider: 'google_calendar',
    label: 'Google Calendar',
    auth: 'oauth',
    capabilities: ['availability'],
    syncsOffers: false,
    autoSync: false,
    plan: 'integrations',
  },
  woocommerce: {
    provider: 'woocommerce',
    label: 'WooCommerce',
    auth: 'app_authorization',
    capabilities: ['catalog', 'inventory', 'orders'],
    syncsOffers: true,
    autoSync: false,
    plan: 'integrations',
  },
  servicem8: {
    provider: 'servicem8',
    label: 'ServiceM8',
    auth: 'oauth',
    capabilities: ['job_templates', 'jobs'],
    syncsOffers: true,
    autoSync: false,
    plan: 'integrations',
  },
} as const satisfies Record<ConnectorProvider, ConnectorManifestEntry>

export function isConnectorProvider(value: string): value is ConnectorProvider {
  return (CONNECTOR_PROVIDERS as readonly string[]).includes(value)
}

export function connectorCapabilities(provider: ConnectorProvider): readonly ConnectorCapability[] {
  return CONNECTOR_MANIFEST[provider].capabilities
}
