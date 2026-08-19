import 'server-only'
import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { calculateApplicationFeeCentsFromBps } from '../stripe-billing'
import { bearerTokenColumns, mintBearerToken } from './bearer-token'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import {
  agreementStatusFromSubscription,
  paidInvoicePaymentIds,
  STRIPE_SERVICE_AGREEMENT_KIND,
  subscriptionIdFromInvoice,
  subscriptionMetadataFromInvoice,
  subscriptionServicePeriod,
} from './service-agreement'

export type ServiceAgreementStripe = Pick<Stripe, 'subscriptions' | 'invoices'>

type AgreementRow = {
  id: string
  owner_id: string
  page_id: string | null
  slug: string | null
  offer_key: string
  offer_name: string
  status: string
  contract_fingerprint: string
  amount_per_period_cents: number
  currency: string
  stripe_connect_account_id: string
  stripe_checkout_session_id: string | null
  stripe_subscription_id: string | null
  commission_bps: number | null
  plan_id_at_purchase: string | null
  commission_source: string | null
  buyer_email: string | null
  buyer_name: string | null
  buyer_reference: string | null
  buyer_agent: string | null
  started_at: string | null
}

export function isServiceAgreementStripeEvent(event: Stripe.Event): boolean {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    return session.metadata?.nexez_kind === STRIPE_SERVICE_AGREEMENT_KIND
  }
  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const subscription = event.data.object as Stripe.Subscription
    return subscription.metadata?.nexez_kind === STRIPE_SERVICE_AGREEMENT_KIND
  }
  if (
    event.type === 'invoice.paid' ||
    event.type === 'invoice.payment_succeeded' ||
    event.type === 'invoice.payment_failed'
  ) {
    return subscriptionMetadataFromInvoice(event.data.object as Stripe.Invoice).nexez_kind === STRIPE_SERVICE_AGREEMENT_KIND
  }
  return false
}

function eventAccount(event: Stripe.Event): string | null {
  return (event as Stripe.Event & { account?: string }).account ?? null
}

async function claimEvent(event: Stripe.Event): Promise<'claimed' | 'duplicate' | 'unavailable'> {
  if (!hasSupabaseAdminEnv()) return 'unavailable'
  const { error } = await createAdminClient().from('stripe_webhook_events').insert({
    event_id: event.id,
    type: event.type,
    account: eventAccount(event),
  })
  if (!error) return 'claimed'
  if (error.code === '23505') return 'duplicate'
  console.warn('[Service Agreement Webhook] event ledger insert failed:', error.message)
  return 'claimed'
}

async function releaseEvent(eventId: string) {
  if (!hasSupabaseAdminEnv()) return
  await createAdminClient().from('stripe_webhook_events').delete().eq('event_id', eventId)
}

function metadataFromEvent(event: Stripe.Event): Record<string, string> {
  if (event.type === 'checkout.session.completed') {
    return (event.data.object as Stripe.Checkout.Session).metadata ?? {}
  }
  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    return (event.data.object as Stripe.Subscription).metadata
  }
  return subscriptionMetadataFromInvoice(event.data.object as Stripe.Invoice)
}

async function agreementForEvent(event: Stripe.Event): Promise<AgreementRow | null> {
  if (!hasSupabaseAdminEnv()) return null
  const metadata = metadataFromEvent(event)
  const agreementId = metadata.nexez_service_agreement_id
  const fingerprint = metadata.nexez_service_agreement_fingerprint
  const account = eventAccount(event)
  if (!agreementId || !fingerprint || !account) return null

  const { data } = await createAdminClient()
    .from('service_agreements')
    .select('id, owner_id, page_id, slug, offer_key, offer_name, status, contract_fingerprint, amount_per_period_cents, currency, stripe_connect_account_id, stripe_checkout_session_id, stripe_subscription_id, commission_bps, plan_id_at_purchase, commission_source, buyer_email, buyer_name, buyer_reference, buyer_agent, started_at')
    .eq('id', agreementId)
    .eq('contract_fingerprint', fingerprint)
    .eq('stripe_connect_account_id', account)
    .maybeSingle<AgreementRow>()
  return data ?? null
}

async function failRetry(event: Stripe.Event, message: string) {
  await releaseEvent(event.id)
  return NextResponse.json({ error: message, type: event.type }, { status: 500 })
}

async function retrieveSubscription(
  stripe: ServiceAgreementStripe,
  subscriptionId: string,
  account: string,
): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.retrieve(
      subscriptionId,
      { expand: ['items.data.price'] },
      { stripeAccount: account },
    )
  } catch (error) {
    console.warn('[Service Agreement Webhook] subscription retrieve failed:', error instanceof Error ? error.message : error)
    return null
  }
}

async function syncAgreementFromSubscription(input: {
  event: Stripe.Event
  agreement: AgreementRow
  subscription: Stripe.Subscription
  allowActivation: boolean
}) {
  const state = agreementStatusFromSubscription(input.subscription)
  const status = input.allowActivation || input.agreement.started_at
    ? state.status
    : state.status === 'canceled'
      ? 'canceled'
      : state.status === 'past_due'
        ? 'past_due'
        : 'pending'
  const update = {
    stripe_subscription_id: input.subscription.id,
    status,
    cancel_at_period_end: state.cancelAtPeriodEnd,
    current_period_start: state.periodStart,
    current_period_end: state.periodEnd,
    ...(state.canceledAt ? { canceled_at: state.canceledAt } : {}),
    updated_at: new Date().toISOString(),
  }
  const { error } = await createAdminClient()
    .from('service_agreements')
    .update(update)
    .eq('id', input.agreement.id)
    .eq('contract_fingerprint', input.agreement.contract_fingerprint)
  return error ? error.message : null
}

async function handleCheckoutCompleted(
  event: Stripe.Event,
  stripe: ServiceAgreementStripe,
  agreement: AgreementRow,
) {
  const session = event.data.object as Stripe.Checkout.Session
  const account = eventAccount(event)
  if (!account || agreement.stripe_checkout_session_id !== session.id) {
    return NextResponse.json({ received: true, type: event.type, recurring: false, reason: 'session mismatch' })
  }
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null
  if (!subscriptionId) return failRetry(event, 'Recurring Checkout completed without a subscription id.')

  const buyerEmail = session.customer_details?.email || session.customer_email || agreement.buyer_email
  const { error } = await createAdminClient()
    .from('service_agreements')
    .update({
      stripe_subscription_id: subscriptionId,
      stripe_livemode: session.livemode,
      ...(buyerEmail ? { buyer_email: buyerEmail } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', agreement.id)
    .eq('stripe_checkout_session_id', session.id)
  if (error) return failRetry(event, 'Could not bind the Stripe subscription to the recurring agreement.')

  const subscription = await retrieveSubscription(stripe, subscriptionId, account)
  if (subscription) {
    const syncError = await syncAgreementFromSubscription({ event, agreement: { ...agreement, buyer_email: buyerEmail }, subscription, allowActivation: false })
    if (syncError) return failRetry(event, 'Could not sync the recurring agreement subscription state.')
  }
  return NextResponse.json({ received: true, type: event.type, recurring: true, agreement: agreement.id, subscription: subscriptionId })
}

async function expandedPaidInvoice(
  stripe: ServiceAgreementStripe,
  invoice: Stripe.Invoice,
  account: string,
): Promise<Stripe.Invoice | null> {
  try {
    return await stripe.invoices.retrieve(
      invoice.id,
      { expand: ['payments.data.payment.payment_intent', 'payments.data.payment.charge'] } as any,
      { stripeAccount: account },
    )
  } catch (error) {
    console.warn('[Service Agreement Webhook] invoice retrieve failed:', error instanceof Error ? error.message : error)
    return null
  }
}

async function handleInvoicePaid(
  event: Stripe.Event,
  stripe: ServiceAgreementStripe,
  agreement: AgreementRow,
) {
  const account = eventAccount(event)
  if (!account) return failRetry(event, 'Recurring invoice has no connected account.')
  const rawInvoice = event.data.object as Stripe.Invoice
  const invoice = await expandedPaidInvoice(stripe, rawInvoice, account)
  if (!invoice) return failRetry(event, 'Could not retrieve the paid recurring invoice.')
  const subscriptionId = subscriptionIdFromInvoice(invoice)
  if (!subscriptionId) return failRetry(event, 'Paid recurring invoice has no subscription id.')
  if (agreement.stripe_subscription_id && agreement.stripe_subscription_id !== subscriptionId) {
    return NextResponse.json({ received: true, type: event.type, recurring: false, reason: 'subscription mismatch' })
  }

  const amount = invoice.amount_paid
  const currency = (invoice.currency || '').toLowerCase()
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount !== agreement.amount_per_period_cents || currency !== agreement.currency) {
    return failRetry(event, 'Recurring invoice amount or currency does not match the buyer-approved agreement.')
  }
  const payment = paidInvoicePaymentIds(invoice)
  if (!payment.paymentIntentId) return failRetry(event, 'Paid recurring invoice has no PaymentIntent provenance.')
  const period = subscriptionServicePeriod(invoice)
  if (!period.start || !period.end || period.end <= period.start) {
    return failRetry(event, 'Paid recurring invoice has no valid service period.')
  }

  const subscription = await retrieveSubscription(stripe, subscriptionId, account)
  if (!subscription) return failRetry(event, 'Could not retrieve the recurring subscription for a paid invoice.')
  const state = agreementStatusFromSubscription(subscription)
  const applicationFee = calculateApplicationFeeCentsFromBps(amount, agreement.commission_bps ?? 0)
  const now = new Date().toISOString()
  const orderToken = mintBearerToken()
  const orderRow = {
    owner_id: agreement.owner_id,
    page_id: agreement.page_id,
    slug: agreement.slug,
    offer_name: agreement.offer_name,
    offer_key: agreement.offer_key,
    stripe_payment_intent_id: payment.paymentIntentId,
    stripe_connect_account_id: account,
    amount_cents: amount,
    currency,
    application_fee_cents: applicationFee,
    commission_bps: agreement.commission_bps,
    commission_percent: agreement.commission_bps == null ? null : agreement.commission_bps / 100,
    plan_id_at_purchase: agreement.plan_id_at_purchase,
    commission_source: agreement.commission_source,
    stripe_livemode: invoice.livemode,
    ...bearerTokenColumns(orderToken, 'access_token'),
    status: 'paid',
    channel: 'recurring_service',
    buyer_email: agreement.buyer_email,
    buyer_name: agreement.buyer_name,
    buyer_reference: agreement.buyer_reference,
    buyer_agent: agreement.buyer_agent,
    service_agreement_id: agreement.id,
    stripe_invoice_id: invoice.id,
    service_period_start: period.start,
    service_period_end: period.end,
    metadata: {
      service_agreement_id: agreement.id,
      service_agreement_fingerprint: agreement.contract_fingerprint,
      stripe_charge_id: payment.chargeId,
      recurring_service_period: { start: period.start, end: period.end },
    },
  }
  const admin = createAdminClient()
  const { error: orderError } = await admin.from('checkout_orders').insert(orderRow)
  if (orderError && orderError.code !== '23505') {
    console.warn('[Service Agreement Webhook] recurring order insert failed:', orderError.message)
    return failRetry(event, 'Could not persist the paid recurring service occurrence.')
  }

  const { error: agreementError } = await admin
    .from('service_agreements')
    .update({
      stripe_subscription_id: subscriptionId,
      status: state.status,
      cancel_at_period_end: state.cancelAtPeriodEnd,
      current_period_start: state.periodStart ?? period.start,
      current_period_end: state.periodEnd ?? period.end,
      started_at: agreement.started_at ?? now,
      ...(state.canceledAt ? { canceled_at: state.canceledAt } : {}),
      updated_at: now,
    })
    .eq('id', agreement.id)
    .eq('contract_fingerprint', agreement.contract_fingerprint)
  if (agreementError) return failRetry(event, 'Could not activate the paid recurring service agreement.')

  return NextResponse.json({
    received: true,
    type: event.type,
    recurring: true,
    agreement: agreement.id,
    invoice: invoice.id,
    paymentIntent: payment.paymentIntentId,
    servicePeriod: period,
  })
}

async function handleInvoiceFailed(event: Stripe.Event, agreement: AgreementRow) {
  const invoice = event.data.object as Stripe.Invoice
  const subscriptionId = subscriptionIdFromInvoice(invoice)
  const period = subscriptionServicePeriod(invoice)
  const { error } = await createAdminClient()
    .from('service_agreements')
    .update({
      status: 'past_due',
      ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
      ...(period.start ? { current_period_start: period.start } : {}),
      ...(period.end ? { current_period_end: period.end } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', agreement.id)
    .eq('contract_fingerprint', agreement.contract_fingerprint)
  if (error) return failRetry(event, 'Could not record the recurring service payment failure.')
  return NextResponse.json({ received: true, type: event.type, recurring: true, agreement: agreement.id, status: 'past_due' })
}

async function handleSubscriptionLifecycle(event: Stripe.Event, agreement: AgreementRow) {
  const subscription = event.data.object as Stripe.Subscription
  const error = await syncAgreementFromSubscription({ event, agreement, subscription, allowActivation: false })
  if (error) return failRetry(event, 'Could not sync the recurring service subscription lifecycle.')
  const state = agreementStatusFromSubscription(subscription)
  return NextResponse.json({ received: true, type: event.type, recurring: true, agreement: agreement.id, status: state.status })
}

export async function handleServiceAgreementStripeEvent(
  event: Stripe.Event,
  stripe: ServiceAgreementStripe,
): Promise<Response> {
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ received: true, type: event.type, recurring: false, note: 'SUPABASE_SERVICE_ROLE_KEY required' })
  }
  const account = eventAccount(event)
  if (!account) {
    return NextResponse.json({ received: true, type: event.type, recurring: false, reason: 'service agreement event missing connected account' })
  }

  const claim = await claimEvent(event)
  if (claim === 'duplicate') {
    return NextResponse.json({ received: true, type: event.type, recurring: true, duplicate: true })
  }
  const agreement = await agreementForEvent(event)
  if (!agreement) {
    return NextResponse.json({ received: true, type: event.type, recurring: false, reason: 'agreement provenance mismatch' })
  }

  if (event.type === 'checkout.session.completed') return handleCheckoutCompleted(event, stripe, agreement)
  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
    return handleInvoicePaid(event, stripe, agreement)
  }
  if (event.type === 'invoice.payment_failed') return handleInvoiceFailed(event, agreement)
  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    return handleSubscriptionLifecycle(event, agreement)
  }
  return NextResponse.json({ received: true, type: event.type, recurring: false })
}
