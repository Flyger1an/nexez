import 'server-only'
import { bearerTokenColumns, ensureBearerCiphertext, mintBearerToken, recoverBearerToken } from './bearer-token'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionBuyer } from '../commerce/checkout-session-core'

// Synchronous order persistence for the ACP/UCP /complete endpoints. After the
// settlement bridge captures the charge, /complete must return an order with a real
// permalink NOW - so it writes the durable checkout_orders row itself (and reads back
// the DB-minted access_token for the buyer portal). The Stripe webhook's
// payment_intent.succeeded branch upserts the SAME row (onConflict
// stripe_payment_intent_id), so the two converge idempotently: whichever lands first
// wins, the other is a no-op. Channel-neutral so both protocol adapters share it.

export type CommerceOrderInput = {
  channel: 'acp' | 'ucp'
  ownerId: string
  pageId: string | null
  slug: string | null
  offerName: string | null
  offerKey: string | null
  paymentIntentId: string
  connectAccountId: string | null
  amountCents: number
  currency: string
  applicationFeeCents: number
  commissionBps: number
  commissionPercent: number
  planIdAtPurchase: import('../billing').PlanId
  commissionSource: import('./plan').CommissionResolution['source']
  livemode: boolean
  buyer: SessionBuyer | null
}

/** Upsert the protocol order (keyed on the PaymentIntent) and return the buyer-portal
 * access token. Buyer fields are only ADDED (never nulled) so a later webhook
 * re-delivery can't wipe a value; access_token is column-DEFAULT-minted. */
export async function persistCommerceOrder(admin: Pick<SupabaseClient, 'from'>, input: CommerceOrderInput): Promise<string | null> {
  const buyer = input.buyer
  const row = {
    owner_id: input.ownerId,
    page_id: input.pageId,
    slug: input.slug,
    offer_name: input.offerName ? input.offerName.slice(0, 500) : null,
    offer_key: input.offerKey ? input.offerKey.slice(0, 500) : null,
    stripe_payment_intent_id: input.paymentIntentId,
    stripe_connect_account_id: input.connectAccountId,
    amount_cents: input.amountCents,
    currency: (input.currency || 'usd').toLowerCase(),
    application_fee_cents: input.applicationFeeCents,
    commission_bps: input.commissionBps,
    commission_percent: input.commissionPercent,
    plan_id_at_purchase: input.planIdAtPurchase,
    commission_source: input.commissionSource,
    stripe_livemode: input.livemode,
    // Minted here rather than by a column DEFAULT, so the hash and ciphertext can be
    // written in the same statement. Safe against redelivery: the preserve-token
    // trigger coalesces to the existing values on UPDATE.
    ...bearerTokenColumns(mintBearerToken(), 'access_token'),
    status: 'paid',
    channel: input.channel,
    ...(buyer?.email ? { buyer_email: buyer.email.toLowerCase() } : {}),
    ...(buyer?.name ? { buyer_name: buyer.name } : {}),
    ...(buyer?.reference ? { buyer_reference: buyer.reference } : {}),
    ...(buyer?.agent ? { buyer_agent: buyer.agent } : {}),
  }

  const { error } = await admin.from('checkout_orders').upsert(row, { onConflict: 'stripe_payment_intent_id' })
  if (error) {
    console.warn(`[${input.channel}] checkout_orders upsert failed:`, error.message)
    return null
  }

  // Belt and braces while the plaintext column still exists: rows minted by the old
  // column DEFAULT (or by a writer that has not been updated yet) get their
  // ciphertext filled in here. A no-op once the row already carries one.
  await ensureBearerCiphertext(admin, 'checkout_orders', 'stripe_payment_intent_id', input.paymentIntentId)

  // Read the token BACK rather than returning the one minted above. On a Stripe
  // redelivery the upsert is an UPDATE, and the preserve-token trigger keeps the
  // ORIGINAL token, which is the one already emailed to the buyer. Returning the
  // freshly minted value would hand the caller a token that does not open anything.
  const { data } = await admin
    .from('checkout_orders')
    .select('access_token_encrypted')
    .eq('stripe_payment_intent_id', input.paymentIntentId)
    .maybeSingle<{ access_token_encrypted: string | null }>()
  return recoverBearerToken({ encrypted: data?.access_token_encrypted })
}
