import 'server-only'
import { ensureBearerCiphertext } from './bearer-token'
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
  commissionPercent: number
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
    application_fee_cents: input.applicationFeeCents || null,
    commission_percent: input.commissionPercent || null,
    stripe_livemode: input.livemode,
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

  // access_token is minted by a column DEFAULT (kept that way so a redelivered
  // upsert cannot clobber a token already emailed to the buyer), so the ciphertext
  // has to be written straight after, against whatever value the DB chose.
  await ensureBearerCiphertext(admin, 'checkout_orders', 'stripe_payment_intent_id', input.paymentIntentId)

  const { data } = await admin
    .from('checkout_orders')
    .select('access_token')
    .eq('stripe_payment_intent_id', input.paymentIntentId)
    .maybeSingle<{ access_token: string | null }>()
  return data?.access_token ?? null
}
