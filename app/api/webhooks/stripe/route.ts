import Stripe from 'stripe'
import { NextRequest, NextResponse } from 'next/server'
import type { OfferItem } from '../../../../lib/agent-page'
import {
  buildBillingSubscriptionRow,
  getSubscriptionPriceId,
  stripeObjectId,
} from '../../../../lib/stripe-billing'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'placeholder')

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const signature = request.headers.get('stripe-signature')

  if (!webhookSecret) {
    return NextResponse.json({ error: 'Stripe webhook signing secret is not configured.' }, { status: 412 })
  }

  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature.' }, { status: 400 })
  }

  let event: Stripe.Event
  const rawBody = await request.text()

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid Stripe webhook signature.'
    console.warn('[Stripe Webhook] Signature verification failed:', message)
    return NextResponse.json({ error: 'Invalid Stripe signature.' }, { status: 401 })
  }

  // Idempotency: record each event id once; a conflict means we already processed it
  // (Stripe retry / redelivery) so we no-op. Covers escrow + billing handlers below.
  if (hasSupabaseAdminEnv()) {
    const ledger = createAdminClient()
    const { error: ledgerErr } = await ledger
      .from('stripe_webhook_events')
      .insert({ event_id: event.id, type: event.type, account: (event as { account?: string }).account ?? null })
    if (ledgerErr) {
      if (ledgerErr.code === '23505') {
        return NextResponse.json({ received: true, type: event.type, duplicate: true }, { status: 200 })
      }
      // Don't block processing on a ledger hiccup — log and continue.
      console.warn('[Stripe Webhook] event ledger insert failed:', ledgerErr.message)
    }
  }

  // Negotiation escrow: a buyer-funded Checkout completed.
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.metadata?.nexez_kind === 'negotiation_escrow' && session.metadata?.nexez_negotiation_id) {
      if (!hasSupabaseAdminEnv()) {
        return NextResponse.json({ received: true, type: event.type, note: 'SUPABASE_SERVICE_ROLE_KEY required' }, { status: 200 })
      }
      const admin = createAdminClient()
      const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null
      // Hybrid settlement: 'auto' captured immediately -> complete; 'hold' authorized -> held.
      // (Legacy escrow sessions carry no nexez_settlement; treat them as holds.)
      const autoSettle = session.metadata?.nexez_settlement === 'auto'
      const nextStatus = autoSettle ? 'complete' : 'held'
      const nextEscrowMode = autoSettle ? 'captured' : 'manual_capture_created'
      const { error: settleErr } = await admin
        .from('agent_negotiations')
        .update({ status: nextStatus, escrow_mode: nextEscrowMode, stripe_payment_intent_id: piId })
        .eq('id', session.metadata.nexez_negotiation_id)
      if (settleErr) {
        console.warn('[Stripe Webhook] escrow settle update failed:', settleErr.message)
        // Release the idempotency claim so Stripe's retry reprocesses this event
        // (the settle update is idempotent), and signal a retry with a non-200.
        await admin.from('stripe_webhook_events').delete().eq('event_id', event.id)
        return NextResponse.json({ error: 'escrow settle failed', type: event.type }, { status: 500 })
      }
      return NextResponse.json({ received: true, type: event.type, negotiation: session.metadata.nexez_negotiation_id, status: nextStatus, ok: true }, { status: 200 })
    }

    if (session.metadata?.nexez_source === 'billing_page') {
      return syncBillingCheckoutSession(event, session)
    }

    return NextResponse.json({ received: true, type: event.type }, { status: 200 })
  }

  // Negotiation escrow reversals — matched to a negotiation by its stored payment
  // intent (works for connected-account events, which carry the same PI). All behind
  // the event-id idempotency ledger above.
  if (
    event.type === 'charge.refunded' ||
    event.type === 'charge.dispute.created' ||
    event.type === 'charge.dispute.closed' ||
    event.type === 'payment_intent.canceled'
  ) {
    if (!hasSupabaseAdminEnv()) {
      return NextResponse.json({ received: true, type: event.type, note: 'SUPABASE_SERVICE_ROLE_KEY required' }, { status: 200 })
    }
    const admin = createAdminClient()
    const obj = event.data.object as {
      id?: string
      payment_intent?: string | { id?: string } | null
      amount?: number
      amount_refunded?: number
      reason?: string
      status?: string
    }
    const piId =
      typeof obj.payment_intent === 'string'
        ? obj.payment_intent
        : obj.payment_intent?.id ?? (event.type === 'payment_intent.canceled' ? obj.id ?? null : null)
    if (!piId) {
      return NextResponse.json({ received: true, type: event.type, matched: false }, { status: 200 })
    }

    const { data: neg } = await admin
      .from('agent_negotiations')
      .select('id, status, metadata')
      .eq('stripe_payment_intent_id', piId)
      .maybeSingle<{ id: string; status: string; metadata: Record<string, unknown> | null }>()
    if (!neg) {
      return NextResponse.json({ received: true, type: event.type, matched: false }, { status: 200 })
    }

    const baseMeta = (neg.metadata as Record<string, unknown>) || {}
    const now = new Date().toISOString()
    let update: Record<string, unknown> | null = null

    if (event.type === 'charge.refunded') {
      update = { status: 'refunded', metadata: { ...baseMeta, refund: { source: 'stripe_webhook', amount_cents: obj.amount_refunded ?? null, at: now } } }
    } else if (event.type === 'charge.dispute.created') {
      update = { status: 'disputed', metadata: { ...baseMeta, dispute: { reason: obj.reason ?? null, amount_cents: obj.amount ?? null, status: obj.status ?? null, at: now } } }
    } else if (event.type === 'charge.dispute.closed') {
      const won = obj.status === 'won'
      update = won
        ? { status: 'complete', metadata: { ...baseMeta, dispute_outcome: { result: 'won', at: now } } }
        : { status: 'refunded', metadata: { ...baseMeta, dispute_outcome: { result: obj.status ?? 'lost', at: now } } }
    } else if (event.type === 'payment_intent.canceled') {
      // Only meaningful if we still think funds are held (hold released out-of-band).
      if (neg.status === 'held') update = { status: 'declined' }
    }

    if (!update) {
      return NextResponse.json({ received: true, type: event.type, negotiation: neg.id, changed: false }, { status: 200 })
    }
    update.updated_at = now
    const { error: upErr } = await admin.from('agent_negotiations').update(update).eq('id', neg.id)
    if (upErr) {
      console.warn('[Stripe Webhook] reversal update failed:', upErr.message)
      await admin.from('stripe_webhook_events').delete().eq('event_id', event.id)
      return NextResponse.json({ error: 'reversal update failed', type: event.type }, { status: 500 })
    }
    return NextResponse.json({ received: true, type: event.type, negotiation: neg.id, status: update.status }, { status: 200 })
  }

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    return syncBillingSubscription(event, event.data.object as Stripe.Subscription)
  }

  // Stripe Connect account status updates (details_submitted, charges_enabled, payouts_enabled).
  // These fire after user completes onboarding or Stripe reviews/enables features.
  // Keeps billing_subscriptions in sync without manual refresh.
  if (event.type === 'account.updated') {
    if (!hasSupabaseAdminEnv()) {
      return NextResponse.json({ received: true, type: event.type, note: 'SUPABASE_SERVICE_ROLE_KEY required for Connect sync' }, { status: 200 })
    }
    const account = event.data.object as Stripe.Account
    const admin = createAdminClient()
    const { data: billing } = await admin
      .from('billing_subscriptions')
      .select('owner_id')
      .eq('stripe_connect_account_id', account.id)
      .maybeSingle<{ owner_id: string }>()

    if (billing?.owner_id) {
      const update = {
        stripe_connect_status: account.details_submitted ? 'complete' : 'pending',
        stripe_connect_details_submitted: account.details_submitted,
        stripe_connect_charges_enabled: account.charges_enabled,
        stripe_connect_payouts_enabled: account.payouts_enabled,
      }
      await admin.from('billing_subscriptions').update(update).eq('owner_id', billing.owner_id)
      return NextResponse.json({ received: true, type: event.type, connect_synced: true, owner_id: billing.owner_id })
    }
    return NextResponse.json({ received: true, type: event.type, connect_synced: false, reason: 'no matching billing row' }, { status: 200 })
  }

  if (event.type !== 'price.updated' && event.type !== 'price.created') {
    return NextResponse.json({ received: true, type: event.type }, { status: 200 })
  }

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is required for Stripe webhook sync.' }, { status: 412 })
  }

  const priceObj = event.data.object as Stripe.Price
  const priceId = priceObj.id
  const productId = typeof priceObj.product === 'string' ? priceObj.product : priceObj.product?.id
  const formattedPrice = formatStripePrice(priceObj)
  const supabase = createAdminClient()

  const { data: pages, error: pageError } = await supabase
    .from('pages')
    .select('id, slug, services, products, owner_id')

  if (pageError) {
    console.warn('[Stripe Webhook] Page scan failed:', pageError.message)
    return NextResponse.json({ error: 'Could not scan pages for Stripe price sync.' }, { status: 500 })
  }

  let updates = 0
  const changedOffers: Array<{ slug: string; name: string; old: string; new: string }> = []

  for (const pg of pages || []) {
    let services = (pg.services || []) as OfferItem[]
    let products = (pg.products || []) as OfferItem[]
    let pageChanged = false

    const matcher = (offer: OfferItem) => {
      const metadata = offer.metadata || {}
      return metadata.stripe_price_id === priceId || (productId && metadata.stripe_product_id === productId)
    }

    const applyPrice = (offers: OfferItem[]) =>
      offers.map((offer) => {
        if (matcher(offer) && offer.source === 'stripe' && offer.price !== formattedPrice) {
          changedOffers.push({ slug: pg.slug, name: offer.name, old: offer.price || '', new: formattedPrice })
          pageChanged = true
          updates += 1
          return {
            ...offer,
            price: formattedPrice,
            metadata: {
              ...(offer.metadata || {}),
              last_stripe_sync: new Date().toISOString(),
            },
          }
        }

        return offer
      })

    services = applyPrice(services)
    products = applyPrice(products)

    if (!pageChanged) continue

    const { error: updateError } = await supabase
      .from('pages')
      .update({ services, products })
      .eq('id', pg.id)

    if (updateError) {
      console.warn('[Stripe Webhook] Failed to update page', pg.slug, updateError.message)
      continue
    }

    const pageChanges = changedOffers.filter((change) => change.slug === pg.slug)
    const { error: eventError } = await supabase.from('checkout_events').insert({
      page_id: pg.id,
      owner_id: pg.owner_id || null,
      slug: pg.slug,
      offer_key: 'stripe:price-sync',
      offer_name: `Stripe price sync (${pageChanges.map((change) => change.name).join(', ')})`,
      offer_kind: 'products',
      event_type: 'stripe_price_sync',
      agent_user_agent: 'Stripe-Webhook',
      metadata: {
        source: 'stripe_webhook',
        price_id: priceId,
        product_id: productId,
        new_price: formattedPrice,
        changes: pageChanges,
      },
    })

    if (eventError) {
      console.warn('[Stripe Webhook] Failed to log price sync for page', pg.slug, eventError.message)
    }
  }

  return NextResponse.json({
    received: true,
    type: event.type,
    price_id: priceId,
    pages_scanned: pages?.length || 0,
    offers_updated: updates,
  })
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Stripe webhook receiver is live. POST signed Stripe events here.',
    configured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    secretKeyConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    serviceRoleConfigured: hasSupabaseAdminEnv(),
  })
}

async function syncBillingCheckoutSession(event: Stripe.Event, session: Stripe.Checkout.Session) {
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ received: true, type: event.type, note: 'SUPABASE_SERVICE_ROLE_KEY required' }, { status: 200 })
  }

  const ownerId = session.metadata?.nexez_user_id || session.client_reference_id
  if (!ownerId) {
    return NextResponse.json({ received: true, type: event.type, billing: false, reason: 'missing owner metadata' }, { status: 200 })
  }

  let subscription: Stripe.Subscription | null = null
  const subscriptionId = stripeObjectId(session.subscription)

  if (subscriptionId && process.env.STRIPE_SECRET_KEY) {
    try {
      subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price'] })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not retrieve subscription.'
      console.warn('[Stripe Webhook] subscription retrieve failed:', message)
    }
  }

  const supabase = createAdminClient()
  const row = buildBillingSubscriptionRow({
    ownerId,
    session,
    subscription,
    fallbackPlanId: session.metadata?.nexez_plan,
    fallbackPriceId: session.metadata?.nexez_price_id,
    eventId: event.id,
    eventType: event.type,
  })

  const { error } = await supabase
    .from('billing_subscriptions')
    .upsert(row, { onConflict: 'owner_id' })

  if (error) {
    console.warn('[Stripe Webhook] billing checkout sync failed:', error.message)
    return NextResponse.json({ error: 'Could not sync billing checkout.' }, { status: 500 })
  }

  return NextResponse.json({
    received: true,
    type: event.type,
    billing: true,
    owner_id: ownerId,
    subscription_id: row.stripe_subscription_id,
    plan_id: row.plan_id,
    status: row.status,
  })
}

async function syncBillingSubscription(event: Stripe.Event, subscription: Stripe.Subscription) {
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ received: true, type: event.type, note: 'SUPABASE_SERVICE_ROLE_KEY required' }, { status: 200 })
  }

  const supabase = createAdminClient()
  const customerId = stripeObjectId(subscription.customer)
  let ownerId = subscription.metadata?.nexez_user_id || null

  if (!ownerId) {
    const bySubscription = await supabase
      .from('billing_subscriptions')
      .select('owner_id')
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle<{ owner_id: string }>()

    ownerId = bySubscription.data?.owner_id || null
  }

  if (!ownerId && customerId) {
    const byCustomer = await supabase
      .from('billing_subscriptions')
      .select('owner_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle<{ owner_id: string }>()

    ownerId = byCustomer.data?.owner_id || null
  }

  if (!ownerId) {
    return NextResponse.json({ received: true, type: event.type, billing: false, reason: 'no matching owner' }, { status: 200 })
  }

  const priceId = getSubscriptionPriceId(subscription) ?? subscription.metadata?.nexez_price_id ?? null
  const row = buildBillingSubscriptionRow({
    ownerId,
    subscription,
    fallbackPlanId: subscription.metadata?.nexez_plan,
    fallbackPriceId: priceId,
    eventId: event.id,
    eventType: event.type,
  })

  const { error } = await supabase
    .from('billing_subscriptions')
    .upsert(row, { onConflict: 'owner_id' })

  if (error) {
    console.warn('[Stripe Webhook] subscription lifecycle sync failed:', error.message)
    return NextResponse.json({ error: 'Could not sync billing subscription.' }, { status: 500 })
  }

  return NextResponse.json({
    received: true,
    type: event.type,
    billing: true,
    owner_id: ownerId,
    subscription_id: subscription.id,
    plan_id: row.plan_id,
    status: row.status,
  })
}

function formatStripePrice(price: Stripe.Price) {
  const interval = price.recurring?.interval ? ` / ${price.recurring.interval}` : ''
  return typeof price.unit_amount === 'number'
    ? `$${(price.unit_amount / 100).toFixed(0)}${interval}`
    : 'Custom'
}
