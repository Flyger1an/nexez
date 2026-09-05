import 'server-only'
import { withStripeWebhookLease } from './stripe-webhook-lease'
import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { bearerTokenColumns, mintBearerToken } from './bearer-token'
import {
  commitResourceHold,
  linkResourceReservationOrder,
  releaseResourceHold,
  STRIPE_RESERVABLE_RESOURCE_KIND,
} from './reservable-resource'
import { createAdminClient } from '../../utils/supabase/admin'

type HoldRow = {
  id: string
  owner_id: string
  page_id: string
  offer_key: string
  status: string
  transaction_fingerprint: string
  allocation_fingerprint: string
  stripe_checkout_session_id: string | null
  stripe_connect_account_id: string | null
  stripe_payment_intent_id: string | null
  payment_event_id: string | null
  amount_cents: number | null
  currency: string | null
}

function eventAccount(event: Stripe.Event) {
  return (event as Stripe.Event & { account?: string }).account ?? null
}

function paymentIntentId(session: Stripe.Checkout.Session) {
  return typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id ?? null
}

function integerMetadata(value: string | undefined, min: number, max?: number) {
  if (!value || !/^-?\d+$/.test(value)) return null
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < min || (max != null && number > max)) return null
  return number
}

export function isReservableResourceStripeEvent(event: Stripe.Event) {
  if (!['checkout.session.completed', 'checkout.session.expired'].includes(event.type)) return false
  return (event.data.object as Stripe.Checkout.Session).metadata?.nexez_kind === STRIPE_RESERVABLE_RESOURCE_KIND
}

export function resourceHoldMatchesSession(input: {
  hold: HoldRow
  session: Stripe.Checkout.Session
  account: string | null
  requirePaid: boolean
}) {
  const metadata = input.session.metadata ?? {}
  const paymentIntent = paymentIntentId(input.session)
  return Boolean(
    input.account
    && input.account === input.hold.stripe_connect_account_id
    && input.hold.stripe_checkout_session_id === input.session.id
    && metadata.nexez_resource_hold_id === input.hold.id
    && metadata.nexez_resource_transaction_fingerprint === input.hold.transaction_fingerprint
    && metadata.nexez_resource_allocation_fingerprint === input.hold.allocation_fingerprint
    && metadata.nexez_owner_id === input.hold.owner_id
    && metadata.nexez_page_id === input.hold.page_id
    && metadata.nexez_offer_key === input.hold.offer_key
    && (!input.requirePaid || (
      input.session.payment_status === 'paid'
      && paymentIntent
      && input.session.amount_total === input.hold.amount_cents
      && (input.session.currency || '').toLowerCase() === input.hold.currency
    )),
  )
}

async function failRetry(event: Stripe.Event, message: string) {
  return NextResponse.json({ error: message, type: event.type }, { status: 500 })
}

async function processReservableResourceStripeEvent(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session
  const holdId = session.metadata?.nexez_resource_hold_id
  if (!holdId) return failRetry(event, 'Resource Checkout is missing hold provenance.')
  const admin = createAdminClient()
  const { data: rawHold, error: holdError } = await admin
    .from('resource_holds')
    .select('id, owner_id, page_id, offer_key, status, transaction_fingerprint, allocation_fingerprint, stripe_checkout_session_id, stripe_connect_account_id, stripe_payment_intent_id, payment_event_id, amount_cents, currency')
    .eq('id', holdId)
    .maybeSingle()
  const hold = rawHold as HoldRow | null
  if (holdError || !hold) return failRetry(event, 'Resource hold provenance was not found.')

  if (event.type === 'checkout.session.expired') {
    if (!resourceHoldMatchesSession({ hold, session, account: eventAccount(event), requirePaid: false })) {
      return NextResponse.json({ received: true, type: event.type, resources: false, reason: 'stale_or_mismatched_resource_session' })
    }
    if (hold.status === 'expired' || hold.status === 'cancelled' || hold.status === 'failed') {
      return NextResponse.json({ received: true, type: event.type, resources: true, hold: hold.id, status: hold.status })
    }
    if (hold.status !== 'payment_pending') {
      return NextResponse.json({ received: true, type: event.type, resources: false, reason: 'resource_hold_not_releasable' })
    }
    const released = await releaseResourceHold({
      admin,
      holdId: hold.id,
      reason: 'provider_expired',
      stripeCheckoutSessionId: session.id,
    })
    if (!released.ok) return failRetry(event, 'Could not release the provider-expired resource hold.')
    return NextResponse.json({ received: true, type: event.type, resources: true, hold: hold.id, status: released.status })
  }

  if (!resourceHoldMatchesSession({ hold, session, account: eventAccount(event), requirePaid: true })) {
    return NextResponse.json({ received: true, type: event.type, resources: false, reason: 'stale_or_mismatched_resource_checkout' })
  }
  const paymentIntent = paymentIntentId(session) as string
  if (hold.status === 'committed' && (
    hold.stripe_payment_intent_id !== paymentIntent || hold.payment_event_id !== event.id
  )) {
    return NextResponse.json({ received: true, type: event.type, resources: false, reason: 'resource_hold_already_committed' })
  }
  if (hold.status !== 'payment_pending' && hold.status !== 'committed') {
    return NextResponse.json({ received: true, type: event.type, resources: false, reason: 'resource_hold_not_committable' })
  }

  const committed = await commitResourceHold({
    admin,
    holdId: hold.id,
    transactionFingerprint: hold.transaction_fingerprint,
    allocationFingerprint: hold.allocation_fingerprint,
    stripeCheckoutSessionId: session.id,
    stripeConnectAccountId: eventAccount(event) as string,
    stripePaymentIntentId: paymentIntent,
    paymentEventId: event.id,
  })
  if (!committed.ok) return failRetry(event, 'Could not commit the paid resource reservation.')

  const buyerEmail = session.customer_details?.email || session.customer_email || session.metadata?.nexez_buyer_email || null
  const orderRow = {
    owner_id: hold.owner_id,
    page_id: hold.page_id,
    slug: session.metadata?.nexez_page_slug || null,
    offer_name: session.metadata?.nexez_offer_name || null,
    offer_key: hold.offer_key,
    stripe_session_id: session.id,
    stripe_payment_intent_id: paymentIntent,
    stripe_connect_account_id: eventAccount(event),
    amount_cents: hold.amount_cents,
    currency: hold.currency,
    application_fee_cents: integerMetadata(session.metadata?.nexez_application_fee_cents, 0),
    commission_bps: integerMetadata(session.metadata?.nexez_commission_bps, 0, 1000),
    commission_percent: session.metadata?.nexez_commission_percent
      ? Number(session.metadata.nexez_commission_percent)
      : null,
    plan_id_at_purchase: session.metadata?.nexez_owner_plan || null,
    commission_source: session.metadata?.nexez_commission_source || null,
    stripe_livemode: session.livemode,
    status: 'paid',
    channel: 'reservable_resource',
    resource_hold_id: hold.id,
    metadata: {
      resource_reservation_id: committed.reservationId,
      resource_transaction_fingerprint: hold.transaction_fingerprint,
      resource_allocation_fingerprint: hold.allocation_fingerprint,
    },
    ...bearerTokenColumns(mintBearerToken(), 'access_token'),
    ...(buyerEmail ? { buyer_email: buyerEmail.toLowerCase() } : {}),
    ...(session.metadata?.nexez_buyer_name ? { buyer_name: session.metadata.nexez_buyer_name } : {}),
    ...(session.metadata?.nexez_buyer_reference ? { buyer_reference: session.metadata.nexez_buyer_reference } : {}),
    ...(session.metadata?.nexez_buyer_agent ? { buyer_agent: session.metadata.nexez_buyer_agent } : {}),
  }
  const { data: rawOrder, error: orderError } = await admin
    .from('checkout_orders')
    .upsert(orderRow, { onConflict: 'stripe_session_id' })
    .select('id')
    .maybeSingle()
  const order = rawOrder as { id: string } | null
  if (orderError || !order?.id) return failRetry(event, 'Could not persist the resource-backed order.')
  const linked = await linkResourceReservationOrder({ admin, holdId: hold.id, checkoutOrderId: order.id })
  if (!linked) return failRetry(event, 'Could not link the resource reservation to its order.')

  return NextResponse.json({
    received: true,
    type: event.type,
    resources: true,
    hold: hold.id,
    reservation: committed.reservationId,
    order: order.id,
    status: 'committed',
  })
}

export async function handleReservableResourceStripeEvent(event: Stripe.Event): Promise<Response> {
  return withStripeWebhookLease(event, () => processReservableResourceStripeEvent(event))
}
