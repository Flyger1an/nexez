import 'server-only'
import { actionRequestHash } from '../action-approval'
import {
  parseOfferTransactionConfigurationSnapshot,
  type OfferTransactionConfiguration,
} from '../offer-transaction-configuration'

export const OFFER_CONFIGURATION_METADATA_KEY = 'offer_configuration'
export const OFFER_CONFIGURATION_HASH_METADATA_KEY = 'offer_configuration_hash'
export const STRIPE_OFFER_CONFIGURATION_HASH_KEY = 'nexez_offer_configuration_hash'

export function hasOfferTransactionConfiguration(configuration: OfferTransactionConfiguration): boolean {
  return Object.keys(configuration).length > 0
}

/**
 * Fingerprint only the normalized transaction configuration. The same canonical
 * JSON machinery that binds action approvals also makes this insensitive to
 * object key insertion order while preserving already-canonicalized arrays.
 */
export function offerTransactionConfigurationFingerprint(configuration: OfferTransactionConfiguration): string {
  return actionRequestHash('checkout', { offerConfiguration: configuration })
}

export function checkoutConfigurationHandoffMetadata(configuration: OfferTransactionConfiguration) {
  const fingerprint = offerTransactionConfigurationFingerprint(configuration)
  return {
    [OFFER_CONFIGURATION_METADATA_KEY]: configuration,
    [OFFER_CONFIGURATION_HASH_METADATA_KEY]: fingerprint,
  }
}

type CheckoutEventRow = {
  metadata?: Record<string, unknown> | null
}

type HandoffDb = {
  from: (table: string) => any
}

export type CheckoutConfigurationHandoffResult =
  | { ok: true; configuration: OfferTransactionConfiguration | null }
  | { ok: false; reason: 'invalid_fingerprint' | 'lookup_failed' | 'missing_or_mismatched' }

/**
 * Resolve the server-side pre-payment handoff by Stripe session id and verify it
 * against the fingerprint stored on the trusted Stripe session. checkout_events
 * permits public inserts for published pages, so the DB row alone is never
 * authority for transaction configuration.
 */
export async function loadCheckoutConfigurationHandoff(
  db: HandoffDb,
  stripeSessionId: string,
  expectedFingerprint: string | null | undefined,
): Promise<CheckoutConfigurationHandoffResult> {
  if (!expectedFingerprint) return { ok: true, configuration: null }
  if (!/^[a-f0-9]{64}$/.test(expectedFingerprint)) return { ok: false, reason: 'invalid_fingerprint' }

  const { data, error } = await db
    .from('checkout_events')
    .select('metadata')
    .eq('event_type', 'stripe_session_created')
    .eq('stripe_session_id', stripeSessionId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) return { ok: false, reason: 'lookup_failed' }
  const rows = Array.isArray(data) ? (data as CheckoutEventRow[]) : []
  for (const row of rows) {
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : null
    if (!metadata) continue
    const configuration = parseOfferTransactionConfigurationSnapshot(metadata[OFFER_CONFIGURATION_METADATA_KEY])
    if (!configuration) continue
    const storedFingerprint = metadata[OFFER_CONFIGURATION_HASH_METADATA_KEY]
    if (storedFingerprint !== expectedFingerprint) continue
    if (offerTransactionConfigurationFingerprint(configuration) !== expectedFingerprint) continue
    return { ok: true, configuration }
  }

  return { ok: false, reason: 'missing_or_mismatched' }
}
