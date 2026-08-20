import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { actionRequestHash } from '../action-approval'
import type { ConditionalFulfillmentEvaluation } from '../conditional-fulfillment'
import type { OfferConfigurationPricingSnapshot } from '../offer-configuration-pricing'
import type { OfferTransactionConfiguration } from '../offer-transaction-configuration'

export const STRIPE_OFFER_CONFIGURATION_HASH_KEY = 'nexez_offer_configuration_hash'
export const STRIPE_OFFER_PRICING_HASH_KEY = 'nexez_offer_pricing_hash'
export const STRIPE_OFFER_FULFILLMENT_HASH_KEY = 'nexez_offer_fulfillment_hash'

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

/**
 * Fingerprint the exact deterministic price snapshot used to authorize and
 * charge the configured checkout. Raw pricing provenance stays in the private
 * handoff; Stripe receives this digest only.
 */
export function offerConfigurationPricingFingerprint(pricing: OfferConfigurationPricingSnapshot): string {
  return actionRequestHash('checkout', { offerPricing: pricing })
}

/** Fingerprint the exact checkout-time merchant fulfillment decision. */
export function offerFulfillmentFingerprint(fulfillment: ConditionalFulfillmentEvaluation): string {
  return actionRequestHash('checkout', { offerFulfillment: fulfillment })
}

export type PersistCheckoutConfigurationHandoffInput = {
  stripeSessionId: string
  pageId: string
  offerKey: string
  configuration: OfferTransactionConfiguration
  pricing?: OfferConfigurationPricingSnapshot | null
  fulfillment?: ConditionalFulfillmentEvaluation | null
  now?: Date
}

export type PersistCheckoutConfigurationHandoffResult =
  | { ok: true; fingerprint: string; pricingFingerprint: string | null; fulfillmentFingerprint: string | null }
  | { ok: false; fingerprint: string; pricingFingerprint: string | null; fulfillmentFingerprint: string | null; error: string }

/**
 * Store the exact checkout-time buyer configuration, deterministic price, and
 * merchant-authored fulfillment decision in a private service-role table before
 * a payable Stripe URL leaves Nexez. A DB trigger later merges this row into
 * checkout_orders.metadata in the same transaction as the existing webhook
 * order upsert, then consumes it.
 */
export async function persistCheckoutConfigurationHandoff(
  db: SupabaseClient,
  input: PersistCheckoutConfigurationHandoffInput,
): Promise<PersistCheckoutConfigurationHandoffResult> {
  const fingerprint = offerTransactionConfigurationFingerprint(input.configuration)
  const pricingFingerprint = input.pricing
    ? offerConfigurationPricingFingerprint(input.pricing)
    : null
  const fulfillmentFingerprint = input.fulfillment
    ? offerFulfillmentFingerprint(input.fulfillment)
    : null
  const now = input.now ?? new Date()
  const expiresAt = new Date(now.getTime() + HANDOFF_TTL_MS)
  const { error } = await db.from('checkout_configuration_handoffs').upsert(
    {
      stripe_session_id: input.stripeSessionId,
      page_id: input.pageId,
      offer_key: input.offerKey,
      configuration: input.configuration,
      configuration_fingerprint: fingerprint,
      ...(input.pricing
        ? {
            pricing_snapshot: input.pricing,
            pricing_fingerprint: pricingFingerprint,
          }
        : {}),
      ...(input.fulfillment
        ? {
            fulfillment_snapshot: input.fulfillment,
            fulfillment_fingerprint: fulfillmentFingerprint,
          }
        : {}),
      updated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    },
    { onConflict: 'stripe_session_id' },
  )

  if (error) return { ok: false, fingerprint, pricingFingerprint, fulfillmentFingerprint, error: error.message }
  return { ok: true, fingerprint, pricingFingerprint, fulfillmentFingerprint }
}