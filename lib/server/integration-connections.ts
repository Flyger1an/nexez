import 'server-only'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { getStripeConnectPayoutReadiness } from '../stripe-connect-readiness'
import { connectorOAuthConfigured, listMerchantConnectorRows } from './merchant-connectors'

// The per-listing integration connection state that drives the unified
// Integrations panel. Service-role read; NEVER returns any credential value -
// only booleans + timestamps the client is allowed to see.

export type IntegrationConnectionKind = 'token' | 'oauth' | 'connect'
export type IntegrationConnectionState = {
  provider: 'calendly' | 'shopify' | 'square' | 'acuity' | 'stripe' | 'google_calendar' | 'woocommerce' | 'servicem8'
  label: string
  connected: boolean
  /** 'token' = a stored per-page credential (connect/disconnect/sync here);
   *  'connect' = foundational Stripe payouts managed in Billing. */
  kind: IntegrationConnectionKind
  /** A background cron/webhook keeps this fresh without a manual sync. */
  autoSync: boolean
  /** A stored-credential "Sync now" is available (no token re-entry). */
  canSync: boolean
  lastSyncedAt: string | null
  syncStatus?: 'idle' | 'pending' | 'attention'
  syncError?: string | null
  capabilities?: string[]
}

/**
 * Resolve every integration's connection state for a page in one read. Reflects
 * managed connector rows, legacy stored credentials, and the owner's Stripe
 * Connect status. Empty when the service role isn't configured.
 */
export async function getPageIntegrationConnections(pageId: string, ownerId: string | null): Promise<IntegrationConnectionState[]> {
  if (!hasSupabaseAdminEnv()) return []
  const admin = createAdminClient()
  let shopifyInstallQuery = admin
    .from('shopify_installs')
    .select('last_synced_at, catalog_sync_pending_at, catalog_sync_error')
    .eq('page_id', pageId)
    .is('uninstalled_at', null)
  shopifyInstallQuery = ownerId
    ? shopifyInstallQuery.eq('owner_id', ownerId)
    : shopifyInstallQuery.is('owner_id', null)

  const [secretsResult, shopifyResult, billingResult, managedConnections] = await Promise.all([
    admin
      .from('page_secrets')
      .select('calendly_pat_encrypted, shopify_credentials_encrypted, square_credentials_encrypted, acuity_credentials_encrypted, calendly_synced_at')
      .eq('page_id', pageId)
      .maybeSingle<{ calendly_pat_encrypted: string | null; shopify_credentials_encrypted: string | null; square_credentials_encrypted: string | null; acuity_credentials_encrypted: string | null; calendly_synced_at: string | null }>(),
    shopifyInstallQuery
      .order('linked_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ last_synced_at: string | null; catalog_sync_pending_at: string | null; catalog_sync_error: string | null }>(),
    ownerId
      ? admin
          .from('billing_subscriptions')
          .select('stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled')
          .eq('owner_id', ownerId)
          .maybeSingle<{
            stripe_connect_account_id: string | null
            stripe_connect_charges_enabled: boolean | null
            stripe_connect_payouts_enabled: boolean | null
          }>()
      : Promise.resolve({ data: null }),
    listMerchantConnectorRows(admin, pageId),
  ])
  const secrets = secretsResult.data
  const shopifyInstall = shopifyResult.data
  const billing = billingResult.data
  const stripeConnected = getStripeConnectPayoutReadiness(billing).ready
  const managed = new Map(managedConnections.map((connection) => [connection.provider, connection]))
  const calendly = managed.get('calendly')
  const square = managed.get('square')
  const acuity = managed.get('acuity')
  const legacyCalendlyConnected = Boolean(secrets?.calendly_pat_encrypted)
  const managedCalendlyConnected = Boolean(calendly && calendly.status !== 'revoked')

  const managedState = (
    provider: 'google_calendar' | 'woocommerce' | 'servicem8',
    label: string,
    canSync: boolean,
  ): IntegrationConnectionState => {
    const connection = managed.get(provider)
    return {
      provider,
      label,
      connected: Boolean(connection && connection.status !== 'revoked'),
      kind: 'oauth',
      autoSync: false,
      canSync,
      lastSyncedAt: connection?.last_synced_at ?? null,
      syncStatus: connection?.status === 'attention' ? 'attention' : 'idle',
      syncError: connection?.last_error ?? null,
      capabilities: connection?.capabilities ?? [],
    }
  }

  return [
    {
      provider: 'calendly',
      label: 'Calendly',
      connected: managedCalendlyConnected || legacyCalendlyConnected,
      kind: managedCalendlyConnected || (connectorOAuthConfigured('calendly') && !legacyCalendlyConnected) ? 'oauth' : 'token',
      autoSync: true,
      canSync: true,
      lastSyncedAt: managedCalendlyConnected ? calendly?.last_synced_at ?? null : secrets?.calendly_synced_at ?? null,
      syncStatus: managedCalendlyConnected && calendly?.status === 'attention' ? 'attention' : 'idle',
      syncError: managedCalendlyConnected ? calendly?.last_error ?? null : null,
      capabilities: managedCalendlyConnected ? calendly?.capabilities ?? [] : [],
    },
    {
      provider: 'shopify',
      label: 'Shopify',
      connected: Boolean(shopifyInstall || secrets?.shopify_credentials_encrypted),
      kind: shopifyInstall ? 'oauth' : 'token',
      autoSync: Boolean(shopifyInstall),
      canSync: true,
      lastSyncedAt: shopifyInstall?.last_synced_at ?? null,
      syncStatus: shopifyInstall?.catalog_sync_error
        ? 'attention'
        : shopifyInstall?.catalog_sync_pending_at
          ? 'pending'
          : 'idle',
      syncError: shopifyInstall?.catalog_sync_error ?? null,
    },
    {
      provider: 'square',
      label: 'Square',
      connected: Boolean((square && square.status !== 'revoked') || secrets?.square_credentials_encrypted),
      kind: square || !secrets?.square_credentials_encrypted ? 'oauth' : 'token',
      autoSync: false,
      canSync: true,
      lastSyncedAt: square?.last_synced_at ?? null,
      syncStatus: square?.status === 'attention' ? 'attention' : 'idle',
      syncError: square?.last_error ?? null,
      capabilities: square?.capabilities ?? [],
    },
    {
      provider: 'acuity',
      label: 'Acuity',
      connected: Boolean((acuity && acuity.status !== 'revoked') || secrets?.acuity_credentials_encrypted),
      kind: acuity || (connectorOAuthConfigured('acuity') && !secrets?.acuity_credentials_encrypted) ? 'oauth' : 'token',
      autoSync: false,
      canSync: true,
      lastSyncedAt: acuity?.last_synced_at ?? null,
      syncStatus: acuity?.status === 'attention' ? 'attention' : 'idle',
      syncError: acuity?.last_error ?? null,
      capabilities: acuity?.capabilities ?? [],
    },
    managedState('google_calendar', 'Google Calendar', false),
    managedState('woocommerce', 'WooCommerce', true),
    managedState('servicem8', 'ServiceM8', true),
    { provider: 'stripe', label: 'Stripe payouts', connected: stripeConnected, kind: 'connect', autoSync: false, canSync: false, lastSyncedAt: null },
  ]
}
