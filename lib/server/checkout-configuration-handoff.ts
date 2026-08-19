import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { actionRequestHash } from '../action-approval'
import type { OfferTransactionConfiguration } from '../offer-transaction-configuration'

export const STRIPE_OFFER_CONFIGURATION_HASH_KEY = 'nexez_offer_configuration_hash'

const HANDOFF_TTL_MS = 48 * 60 * 60 * 1_000

export function hasOfferTransactionConfiguration(configuration: OfferTransactionConfiguration): boolean {
  return Object.keys(configuration).length > 0
}

/**
 * Fingerprint only the normalized buyer configuration. The existing checkout
 * approval token separately hashes the entire action payload (slug/offer/query +
 * configuration), so this Stripe-safe digest is traceability, not a second
 * approval system.
 */
export function offerTransactionConfigurationFingerprint(configuration: OfferTransactionConfiguration): string {
  return actionRequestHash('checkout', { offerConfiguration: configuration })
}

export type PersistCheckoutConfigurationHandoffInput = {
  stripeSessionId: string
  pageId: string
  offerKey: string
  configuration: OfferTransactionConfiguration
  now?: Date
}

export type PersistCheckoutConfigurationHandoffResult =
  | { ok: true; fingerprint: string }
  | { ok: false; fingerprint: string; error: string }

/**
 * Store the exact checkout-time buyer configuration in a private service-role
 * table before a payable Stripe URL leaves Nexez. A DB trigger later merges this
 * row into checkout_orders.metadata in the same transaction as the existing
 * webhook order upsert, then consumes it.
 */
export async function persistCheckoutConfigurationHandoff(
  db: SupabaseClient,
  input: PersistCheckoutConfigurationHandoffInput,
): Promise<PersistCheckoutConfigurationHandoffResult> {
  const fingerprint = offerTransactionConfigurationFingerprint(input.configuration)
  const now = input.now ?? new Date()
  const expiresAt = new Date(now.getTime() + HANDOFF_TTL_MS)
  const { error } = await db.from('checkout_configuration_handoffs').upsert(
    {
      stripe_session_id: input.stripeSessionId,
      page_id: input.pageId,
      offer_key: input.offerKey,
      configuration: input.configuration,
      configuration_fingerprint: fingerprint,
      updated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    },
    { onConflict: 'stripe_session_id' },
  )

  if (error) return { ok: false, fingerprint, error: error.message }
  return { ok: true, fingerprint }
}
