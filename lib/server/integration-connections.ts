import 'server-only'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

// The per-listing integration connection state that drives the unified
// Integrations panel. Service-role read; NEVER returns any credential value —
// only booleans + timestamps the client is allowed to see.

export type IntegrationConnectionKind = 'token' | 'connect'
export type IntegrationConnectionState = {
  provider: 'calendly' | 'shopify' | 'stripe'
  label: string
  connected: boolean
  /** 'token' = a stored per-page credential (connect/disconnect/sync here);
   *  'connect' = Stripe Connect (managed in billing, auto price sync). */
  kind: IntegrationConnectionKind
  /** A background cron/webhook keeps this fresh without a manual sync. */
  autoSync: boolean
  /** A stored-credential "Sync now" is available (no token re-entry). */
  canSync: boolean
  lastSyncedAt: string | null
}

/**
 * Resolve every integration's connection state for a page in one read. Reflects
 * the stored-credential columns (Calendly PAT, Shopify creds) + the owner's
 * Stripe Connect status. Empty when the service role isn't configured.
 */
export async function getPageIntegrationConnections(pageId: string, ownerId: string | null): Promise<IntegrationConnectionState[]> {
  if (!hasSupabaseAdminEnv()) return []
  const admin = createAdminClient()

  const { data: secrets } = await admin
    .from('page_secrets')
    .select('calendly_pat_encrypted, shopify_credentials_encrypted, calendly_synced_at')
    .eq('page_id', pageId)
    .maybeSingle<{ calendly_pat_encrypted: string | null; shopify_credentials_encrypted: string | null; calendly_synced_at: string | null }>()

  let stripeConnected = false
  if (ownerId) {
    const { data: billing } = await admin
      .from('billing_subscriptions')
      .select('stripe_connect_account_id, stripe_connect_charges_enabled')
      .eq('owner_id', ownerId)
      .maybeSingle<{ stripe_connect_account_id: string | null; stripe_connect_charges_enabled: boolean | null }>()
    stripeConnected = Boolean(billing?.stripe_connect_account_id && billing.stripe_connect_charges_enabled)
  }

  return [
    { provider: 'calendly', label: 'Calendly', connected: Boolean(secrets?.calendly_pat_encrypted), kind: 'token', autoSync: true, canSync: true, lastSyncedAt: secrets?.calendly_synced_at ?? null },
    { provider: 'shopify', label: 'Shopify', connected: Boolean(secrets?.shopify_credentials_encrypted), kind: 'token', autoSync: false, canSync: true, lastSyncedAt: null },
    { provider: 'stripe', label: 'Stripe', connected: stripeConnected, kind: 'connect', autoSync: true, canSync: false, lastSyncedAt: null },
  ]
}
