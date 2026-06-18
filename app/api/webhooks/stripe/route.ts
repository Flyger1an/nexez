import Stripe from 'stripe'
import { NextRequest, NextResponse, after } from 'next/server'
import { getBaseUrl, type OfferItem } from '../../../../lib/agent-page'
import {
  buildBillingSubscriptionRow,
  getSubscriptionPriceId,
  stripeObjectId,
} from '../../../../lib/stripe-billing'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { minorToStripeAmount, formatCurrencyAmount } from '../../../../lib/currency'
import {
  buildBuyerReceiptEmail,
  buildBuyerStatusEmail,
  buildEscrowFundedEmail,
  buildMoneyEventEmail,
  buildStripeConnectedEmail,
  hasEmailEnv,
  sendEmail,
} from '../../../../lib/email'
import { resolveOwnerNotifyEmail } from '../../../../lib/server/owner-email'
import { sendOnceSystemEmail } from '../../../../lib/server/system-email'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'placeholder')

export async function POST(request: NextRequest) {
  // A Connect platform needs TWO endpoints — one for "your account" events
  // (subscriptions) and one for "connected account" events (the escrow charges,
  // refunds, disputes) — and Stripe gives each its OWN signing secret. Verify
  // against every configured secret so both endpoints' events are accepted.
  // STRIPE_WEBHOOK_SECRET_CONNECT is the connected-accounts endpoint's secret;
  // either var may also hold a comma-separated list (e.g. during a rotation).
  const webhookSecrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_WEBHOOK_SECRET_CONNECT]
    .filter((s): s is string => Boolean(s))
    .flatMap((s) => s.split(',').map((p) => p.trim()).filter(Boolean))
  const signature = request.headers.get('stripe-signature')

  if (!webhookSecrets.length) {
    return NextResponse.json({ error: 'Stripe webhook signing secret is not configured.' }, { status: 412 })
  }

  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature.' }, { status: 400 })
  }

  let event: Stripe.Event | null = null
  const rawBody = await request.text()

  let lastError = 'Invalid Stripe webhook signature.'
  for (const secret of webhookSecrets) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret)
      break
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError
    }
  }
  if (!event) {
    console.warn('[Stripe Webhook] Signature verification failed against all configured secrets:', lastError)
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
      const expectedSettlementState = autoSettle ? 'auto' : 'approved'
      const { data: negotiation } = await admin
        .from('agent_negotiations')
        .select('id, status, amount_cents, currency, settlement_state, stripe_checkout_session_id, offer_name, slug, page_id, buyer_agent, status_token')
        .eq('id', session.metadata.nexez_negotiation_id)
        .maybeSingle<{
          id: string
          status: string
          amount_cents: number | null
          currency: string | null
          settlement_state: string | null
          stripe_checkout_session_id: string | null
          offer_name: string | null
          slug: string | null
          page_id: string | null
          buyer_agent: string | null
          status_token: string | null
        }>()

      if (!negotiation) {
        return NextResponse.json({ received: true, type: event.type, matched: false }, { status: 200 })
      }

      const paid = !session.payment_status || session.payment_status === 'paid'
      // amount_cents is 2-decimal minor units; the charge (pay route) sends Stripe's
      // smallest unit via minorToStripeAmount, so validate against the same conversion
      // — otherwise zero-decimal currencies (JPY/KRW) never match and never settle.
      const expectedChargeAmount = minorToStripeAmount(negotiation.amount_cents ?? 0, negotiation.currency)
      const amountMatches = session.amount_total === expectedChargeAmount
      const currencyMatches = (session.currency || '').toLowerCase() === (negotiation.currency || 'usd').toLowerCase()
      const sessionMatches = negotiation.stripe_checkout_session_id === session.id
      const settlementMatches = negotiation.settlement_state === expectedSettlementState
      if (!paid || !amountMatches || !currencyMatches || !sessionMatches || !settlementMatches) {
        return NextResponse.json(
          {
            received: true,
            type: event.type,
            negotiation: negotiation.id,
            ignored: true,
            reason: 'stale_or_mismatched_checkout_session',
          },
          { status: 200 },
        )
      }

      const nextStatus = autoSettle ? 'complete' : 'held'
      const nextEscrowMode = autoSettle ? 'captured' : 'manual_capture_created'
      // Capture the buyer's email (Stripe collected it, or the pay route prefilled +
      // stamped it in metadata) so we can email a receipt + future status updates.
      // Only ever ADDED — never overwritten with null.
      const buyerEmail = session.customer_details?.email || session.customer_email || session.metadata?.nexez_buyer_email || null
      const { error: settleErr } = await admin
        .from('agent_negotiations')
        .update({
          status: nextStatus,
          escrow_mode: nextEscrowMode,
          stripe_payment_intent_id: piId,
          ...(buyerEmail ? { buyer_email: buyerEmail } : {}),
        })
        .eq('id', session.metadata.nexez_negotiation_id)
        .eq('stripe_checkout_session_id', session.id)
      if (settleErr) {
        console.warn('[Stripe Webhook] escrow settle update failed:', settleErr.message)
        // Release the idempotency claim so Stripe's retry reprocesses this event
        // (the settle update is idempotent), and signal a retry with a non-200.
        await admin.from('stripe_webhook_events').delete().eq('event_id', event.id)
        return NextResponse.json({ error: 'escrow settle failed', type: event.type }, { status: 500 })
      }

      // Notify the seller that a buyer funded the deal — mirrors the Calendly
      // booking email. Owner email = the page's contact_email. Gated on RESEND
      // env (dormant otherwise) and fired via after() so it never blocks the 200.
      if (hasEmailEnv() && negotiation.page_id) {
        after(async () => {
          const { data: page } = await admin
            .from('pages')
            .select('name, contact_email, owner_id')
            .eq('id', negotiation.page_id as string)
            .maybeSingle<{ name: string | null; contact_email: string | null; owner_id: string | null }>()
          const ownerEmail = await resolveOwnerNotifyEmail({ contactEmail: page?.contact_email, ownerId: page?.owner_id })
          if (!ownerEmail || !page) return
          const mail = await buildEscrowFundedEmail({
            businessName: page.name || negotiation.slug || 'your page',
            offerName: negotiation.offer_name || 'Agreement',
            amount: formatCurrencyAmount(session.amount_total ?? expectedChargeAmount, negotiation.currency || 'usd'),
            held: !autoSettle,
            buyerAgent: negotiation.buyer_agent,
            inboxUrl: `${getBaseUrl()}/dashboard/negotiations`,
          })
          await sendEmail({ to: ownerEmail, subject: mail.subject, html: mail.html, text: mail.text })
        })
      }
      // Buyer receipt + portal link (negotiation buyers reuse status_token as their
      // portal credential). Only when we captured a buyer email this funding.
      if (hasEmailEnv() && buyerEmail && negotiation.status_token) {
        const token = negotiation.status_token
        after(async () => {
          const { data: page } = await admin
            .from('pages')
            .select('name')
            .eq('id', negotiation.page_id as string)
            .maybeSingle<{ name: string | null }>()
          const mail = await buildBuyerReceiptEmail({
            businessName: page?.name || negotiation.slug || 'the seller',
            offerName: negotiation.offer_name || 'Agreement',
            amount: formatCurrencyAmount(session.amount_total ?? expectedChargeAmount, negotiation.currency || 'usd'),
            manageUrl: `${getBaseUrl()}/orders/${token}`,
          })
          await sendEmail({ to: buyerEmail, subject: mail.subject, html: mail.html, text: mail.text })
        })
      }
      return NextResponse.json({ received: true, type: event.type, negotiation: session.metadata.nexez_negotiation_id, status: nextStatus, ok: true }, { status: 200 })
    }

    // Both the hosted checkout ('billing_page') and the embedded subscription
    // flow ('embedded_billing') are Nexez plan checkouts — sync either one.
    if (session.metadata?.nexez_source === 'billing_page' || session.metadata?.nexez_source === 'embedded_billing') {
      return syncBillingCheckoutSession(event, session)
    }

    // Direct agent checkout (non-negotiation): persist a durable ORDER record so the
    // sale can be refunded / dispute-tracked in-app, and notify the seller.
    if (session.metadata?.nexez_source === 'agent_checkout') {
      if (!hasSupabaseAdminEnv()) {
        return NextResponse.json({ received: true, type: event.type, note: 'SUPABASE_SERVICE_ROLE_KEY required' }, { status: 200 })
      }
      const paid = !session.payment_status || session.payment_status === 'paid'
      const ownerId = session.metadata.nexez_owner_id || null
      const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null
      if (!paid || !ownerId || !session.amount_total) {
        return NextResponse.json({ received: true, type: event.type, order: false, reason: 'unpaid or missing owner/amount' }, { status: 200 })
      }
      const admin = createAdminClient()
      // Capture buyer identity. Stripe's collected email wins; the agent-declared
      // email (carried in metadata) fills the gap for a headless purchase where Stripe
      // collected none. All buyer fields are added, never nulled, so a re-delivery
      // without them can't wipe a value. access_token is minted by the column DEFAULT
      // (so this upsert can't clobber it on a re-delivery).
      const buyerEmail = session.customer_details?.email || session.customer_email || session.metadata.nexez_buyer_email || null
      const orderRow = {
        owner_id: ownerId,
        page_id: session.metadata.nexez_page_id || null,
        slug: session.metadata.nexez_page_slug || null,
        offer_name: session.metadata.nexez_offer_name || null,
        offer_key: session.metadata.nexez_offer_key || null,
        stripe_session_id: session.id,
        stripe_payment_intent_id: piId,
        stripe_connect_account_id: (event as { account?: string }).account ?? null,
        amount_cents: session.amount_total,
        currency: (session.currency || 'usd').toLowerCase(),
        application_fee_cents: Number(session.metadata.nexez_application_fee_cents || 0) || null,
        status: 'paid',
        ...(buyerEmail ? { buyer_email: buyerEmail } : {}),
        ...(session.metadata.nexez_buyer_name ? { buyer_name: session.metadata.nexez_buyer_name } : {}),
        ...(session.metadata.nexez_buyer_reference ? { buyer_reference: session.metadata.nexez_buyer_reference } : {}),
        ...(session.metadata.nexez_buyer_agent ? { buyer_agent: session.metadata.nexez_buyer_agent } : {}),
      }
      const { error: orderErr } = await admin.from('checkout_orders').upsert(orderRow, { onConflict: 'stripe_session_id' })
      if (orderErr) {
        console.warn('[Stripe Webhook] checkout_orders upsert failed:', orderErr.message)
        await admin.from('stripe_webhook_events').delete().eq('event_id', event.id)
        return NextResponse.json({ error: 'order persist failed', type: event.type }, { status: 500 })
      }
      // Email the buyer a receipt + portal link. The portal token is the row's
      // access_token (DB-minted on insert); read it back so the link is correct even
      // on a re-delivery. Gated on a captured buyer email + RESEND env.
      if (hasEmailEnv() && buyerEmail) {
        after(async () => {
          const { data: row } = await admin
            .from('checkout_orders')
            .select('access_token')
            .eq('stripe_session_id', session.id)
            .maybeSingle<{ access_token: string | null }>()
          if (!row?.access_token) return
          const { data: page } = orderRow.page_id
            ? await admin.from('pages').select('name').eq('id', orderRow.page_id as string).maybeSingle<{ name: string | null }>()
            : { data: null }
          const mail = await buildBuyerReceiptEmail({
            businessName: page?.name || orderRow.slug || 'the seller',
            offerName: orderRow.offer_name || 'Your purchase',
            amount: formatCurrencyAmount(orderRow.amount_cents, orderRow.currency),
            manageUrl: `${getBaseUrl()}/orders/${row.access_token}`,
          })
          await sendEmail({ to: buyerEmail, subject: mail.subject, html: mail.html, text: mail.text })
        })
      }
      if (hasEmailEnv() && orderRow.page_id) {
        after(async () => {
          const { data: page } = await admin.from('pages').select('name, contact_email, owner_id').eq('id', orderRow.page_id as string).maybeSingle<{ name: string | null; contact_email: string | null; owner_id: string | null }>()
          const ownerEmail = await resolveOwnerNotifyEmail({ contactEmail: page?.contact_email, ownerId: page?.owner_id })
          if (!ownerEmail || !page) return
          const mail = await buildEscrowFundedEmail({
            businessName: page.name || orderRow.slug || 'your page',
            offerName: orderRow.offer_name || 'Your offer',
            amount: formatCurrencyAmount(orderRow.amount_cents, orderRow.currency),
            held: false,
            buyerAgent: null,
            inboxUrl: `${getBaseUrl()}/dashboard/finance`,
          })
          await sendEmail({ to: ownerEmail, subject: mail.subject, html: mail.html, text: mail.text })
        })
      }
      return NextResponse.json({ received: true, type: event.type, order: true, status: 'paid' }, { status: 200 })
    }

    return NextResponse.json({ received: true, type: event.type }, { status: 200 })
  }

  // Subscription invoice lifecycle — keep plan status fresh on payment success and
  // failure (dunning). A failed payment flips the subscription to past_due/unpaid;
  // a paid invoice restores active. We re-sync the underlying subscription so
  // billing_subscriptions.status always reflects Stripe, not just the periodic
  // subscription.updated event.
  if (
    event.type === 'invoice.payment_failed' ||
    event.type === 'invoice.paid' ||
    event.type === 'invoice.payment_succeeded'
  ) {
    if (!hasSupabaseAdminEnv()) {
      return NextResponse.json({ received: true, type: event.type, note: 'SUPABASE_SERVICE_ROLE_KEY required' }, { status: 200 })
    }
    const invoice = event.data.object as Stripe.Invoice
    const subId = stripeObjectId((invoice as { subscription?: string | { id?: string } | null }).subscription)
    if (subId && process.env.STRIPE_SECRET_KEY) {
      try {
        const sub = await stripe.subscriptions.retrieve(subId, { expand: ['items.data.price'] })
        return syncBillingSubscription(event, sub)
      } catch (error) {
        console.warn('[Stripe Webhook] invoice subscription retrieve failed:', error instanceof Error ? error.message : error)
      }
    }
    return NextResponse.json({ received: true, type: event.type, billing: false, reason: 'no subscription on invoice' }, { status: 200 })
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
      .select('id, status, metadata, offer_name, page_id, currency, buyer_agent, slug, buyer_email, status_token')
      .eq('stripe_payment_intent_id', piId)
      .maybeSingle<{
        id: string
        status: string
        metadata: Record<string, unknown> | null
        offer_name: string | null
        page_id: string | null
        currency: string | null
        buyer_agent: string | null
        slug: string | null
        buyer_email: string | null
        status_token: string | null
      }>()
    if (!neg) {
      // Not a negotiation — try a direct-checkout ORDER (same PI matching). This is
      // what closes the "direct-checkout disputes/refunds vanish silently" hole.
      const { data: order } = await admin
        .from('checkout_orders')
        .select('id, status, metadata, offer_name, page_id, currency, slug, buyer_email, access_token')
        .eq('stripe_payment_intent_id', piId)
        .maybeSingle<{ id: string; status: string; metadata: Record<string, unknown> | null; offer_name: string | null; page_id: string | null; currency: string | null; slug: string | null; buyer_email: string | null; access_token: string | null }>()
      if (!order) {
        return NextResponse.json({ received: true, type: event.type, matched: false }, { status: 200 })
      }
      const oMeta = (order.metadata as Record<string, unknown>) || {}
      const oNow = new Date().toISOString()
      let oUpdate: Record<string, unknown> | null = null
      let oNotify: { kind: 'refund' | 'dispute_opened' | 'dispute_closed'; amountCents: number | null; detail: string | null } | null = null
      // Buyer-facing status update (sent to the buyer's captured email). Distinct from
      // the seller notify: we skip dispute_opened (the buyer started it via their bank).
      let oBuyerNotify: { kind: 'refunded' | 'partial_refund' | 'dispute_update'; amountCents: number | null; detail: string | null } | null = null
      if (event.type === 'charge.refunded') {
        // A PARTIAL refund (e.g. from the Stripe dashboard) must NOT mark the order
        // fully refunded — keep it 'paid' so the owner can still refund the remainder
        // in-app; only a full refund flips status. (Stripe never double-refunds.)
        const fullyRefunded = obj.amount == null || obj.amount_refunded == null || obj.amount_refunded >= obj.amount
        // Reconcile the cumulative-refunded ledger to Stripe's authoritative total
        // (covers out-of-band Stripe-dashboard refunds + confirms in-app ones).
        const refundedLedger = obj.amount_refunded != null ? { refunded_cents: obj.amount_refunded } : {}
        oUpdate = fullyRefunded
          ? { status: 'refunded', ...refundedLedger, metadata: { ...oMeta, refund: { source: 'stripe_webhook', amount_cents: obj.amount_refunded ?? null, at: oNow } } }
          : { ...refundedLedger, metadata: { ...oMeta, partial_refund: { amount_cents: obj.amount_refunded ?? null, at: oNow } } }
        oNotify = { kind: 'refund', amountCents: obj.amount_refunded ?? null, detail: fullyRefunded ? null : 'Partial refund — the order stays open for the remainder.' }
        // Only email the buyer on a NEW transition — a lost dispute already fired a
        // 'refunded' email, and Stripe sends a separate charge.refunded for the same PI
        // (distinct event id → not collapsed by the ledger), which would double-email.
        if (fullyRefunded) {
          if (order.status !== 'refunded') oBuyerNotify = { kind: 'refunded', amountCents: obj.amount_refunded ?? null, detail: null }
        } else if (!oMeta.partial_refund) {
          oBuyerNotify = { kind: 'partial_refund', amountCents: obj.amount_refunded ?? null, detail: null }
        }
      } else if (event.type === 'charge.dispute.created') {
        oUpdate = { status: 'disputed', metadata: { ...oMeta, dispute: { reason: obj.reason ?? null, amount_cents: obj.amount ?? null, at: oNow } } }
        oNotify = { kind: 'dispute_opened', amountCents: obj.amount ?? null, detail: obj.reason ? `Reason: ${obj.reason}` : null }
      } else if (event.type === 'charge.dispute.closed') {
        const won = obj.status === 'won'
        oUpdate = { status: won ? 'dispute_won' : 'refunded', metadata: { ...oMeta, dispute_outcome: { result: won ? 'won' : obj.status ?? 'lost', at: oNow } } }
        oNotify = { kind: 'dispute_closed', amountCents: obj.amount ?? null, detail: won ? 'You won — funds retained.' : `Lost (${obj.status ?? 'lost'}) — refunded to the buyer.` }
        if (won) {
          if (order.status !== 'dispute_won') oBuyerNotify = { kind: 'dispute_update', amountCents: obj.amount ?? null, detail: 'The dispute was resolved.' }
        } else if (order.status !== 'refunded') {
          oBuyerNotify = { kind: 'refunded', amountCents: obj.amount ?? null, detail: null }
        }
      }
      if (!oUpdate) {
        return NextResponse.json({ received: true, type: event.type, order: order.id, changed: false }, { status: 200 })
      }
      oUpdate.updated_at = oNow
      const { error: oErr } = await admin.from('checkout_orders').update(oUpdate).eq('id', order.id)
      if (oErr) {
        console.warn('[Stripe Webhook] order reversal update failed:', oErr.message)
        await admin.from('stripe_webhook_events').delete().eq('event_id', event.id)
        return NextResponse.json({ error: 'order reversal update failed', type: event.type }, { status: 500 })
      }
      if (oNotify && hasEmailEnv() && order.page_id) {
        const on = oNotify
        after(async () => {
          const { data: page } = await admin.from('pages').select('name, contact_email, owner_id').eq('id', order.page_id as string).maybeSingle<{ name: string | null; contact_email: string | null; owner_id: string | null }>()
          const ownerEmail = await resolveOwnerNotifyEmail({ contactEmail: page?.contact_email, ownerId: page?.owner_id })
          if (!ownerEmail || !page) return
          const mail = await buildMoneyEventEmail({
            kind: on.kind,
            businessName: page.name || order.slug || 'your page',
            offerName: order.offer_name || 'Your offer',
            amount: on.amountCents != null ? formatCurrencyAmount(on.amountCents, order.currency || 'usd') : null,
            detail: on.detail,
            inboxUrl: `${getBaseUrl()}/dashboard/finance`,
          })
          await sendEmail({ to: ownerEmail, subject: mail.subject, html: mail.html, text: mail.text })
        })
      }
      // Buyer-facing status update (refund processed / dispute resolved).
      if (oBuyerNotify && hasEmailEnv() && order.buyer_email && order.access_token) {
        const bn = oBuyerNotify
        const buyerTo = order.buyer_email
        const token = order.access_token
        after(async () => {
          const { data: page } = order.page_id
            ? await admin.from('pages').select('name').eq('id', order.page_id as string).maybeSingle<{ name: string | null }>()
            : { data: null }
          const mail = await buildBuyerStatusEmail({
            kind: bn.kind,
            businessName: page?.name || order.slug || 'the seller',
            offerName: order.offer_name || 'Your purchase',
            amount: bn.amountCents != null ? formatCurrencyAmount(bn.amountCents, order.currency || 'usd') : null,
            detail: bn.detail,
            manageUrl: `${getBaseUrl()}/orders/${token}`,
          })
          await sendEmail({ to: buyerTo, subject: mail.subject, html: mail.html, text: mail.text })
        })
      }
      return NextResponse.json({ received: true, type: event.type, order: order.id, status: oUpdate.status }, { status: 200 })
    }

    const baseMeta = (neg.metadata as Record<string, unknown>) || {}
    const now = new Date().toISOString()
    let update: Record<string, unknown> | null = null
    // Seller notification descriptor (time-sensitive for disputes). null = no email.
    let notify: { kind: 'refund' | 'dispute_opened' | 'dispute_closed'; amountCents: number | null; detail: string | null } | null = null
    // Buyer-facing status update (skips dispute_opened — the buyer started it).
    let buyerNotify: { kind: 'refunded' | 'partial_refund' | 'dispute_update'; amountCents: number | null; detail: string | null } | null = null

    if (event.type === 'charge.refunded') {
      // A PARTIAL refund keeps the deal 'complete' (remainder still refundable);
      // only a full refund closes it. Mirrors the direct-order handler above.
      const fullyRefunded = obj.amount == null || obj.amount_refunded == null || obj.amount_refunded >= obj.amount
      // Reconcile the cumulative-refunded ledger to Stripe's authoritative total.
      const refundedLedger = obj.amount_refunded != null ? { refunded_cents: obj.amount_refunded } : {}
      update = fullyRefunded
        ? { status: 'refunded', ...refundedLedger, metadata: { ...baseMeta, refund: { source: 'stripe_webhook', amount_cents: obj.amount_refunded ?? null, at: now } } }
        : { ...refundedLedger, metadata: { ...baseMeta, partial_refund: { amount_cents: obj.amount_refunded ?? null, at: now } } }
      notify = { kind: 'refund', amountCents: obj.amount_refunded ?? null, detail: fullyRefunded ? null : 'Partial refund — the deal stays open for the remainder.' }
      // Email the buyer only on a NEW transition (avoid the lost-dispute + charge.refunded double).
      if (fullyRefunded) {
        if (neg.status !== 'refunded') buyerNotify = { kind: 'refunded', amountCents: obj.amount_refunded ?? null, detail: null }
      } else if (!baseMeta.partial_refund) {
        buyerNotify = { kind: 'partial_refund', amountCents: obj.amount_refunded ?? null, detail: null }
      }
    } else if (event.type === 'charge.dispute.created') {
      update = { status: 'disputed', metadata: { ...baseMeta, dispute: { reason: obj.reason ?? null, amount_cents: obj.amount ?? null, status: obj.status ?? null, at: now } } }
      notify = { kind: 'dispute_opened', amountCents: obj.amount ?? null, detail: obj.reason ? `Reason: ${obj.reason}` : null }
    } else if (event.type === 'charge.dispute.closed') {
      const won = obj.status === 'won'
      update = won
        ? { status: 'complete', metadata: { ...baseMeta, dispute_outcome: { result: 'won', at: now } } }
        : { status: 'refunded', metadata: { ...baseMeta, dispute_outcome: { result: obj.status ?? 'lost', at: now } } }
      notify = { kind: 'dispute_closed', amountCents: obj.amount ?? null, detail: won ? 'You won — funds retained.' : `Lost (${obj.status ?? 'lost'}) — refunded to the buyer.` }
      if (won) {
        if (neg.status !== 'complete') buyerNotify = { kind: 'dispute_update', amountCents: obj.amount ?? null, detail: 'The dispute was resolved.' }
      } else if (neg.status !== 'refunded') {
        buyerNotify = { kind: 'refunded', amountCents: obj.amount ?? null, detail: null }
      }
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

    // Notify the seller — refunds are informational; a dispute is time-sensitive
    // (evidence deadline), so silent DB-only handling risked auto-lost disputes.
    if (notify && hasEmailEnv() && neg.page_id) {
      const n = notify
      after(async () => {
        const { data: page } = await admin
          .from('pages')
          .select('name, contact_email, owner_id')
          .eq('id', neg.page_id as string)
          .maybeSingle<{ name: string | null; contact_email: string | null; owner_id: string | null }>()
        const ownerEmail = await resolveOwnerNotifyEmail({ contactEmail: page?.contact_email, ownerId: page?.owner_id })
        if (!ownerEmail || !page) return
        const mail = await buildMoneyEventEmail({
          kind: n.kind,
          businessName: page.name || neg.slug || 'your page',
          offerName: neg.offer_name || 'Agreement',
          amount: n.amountCents != null ? formatCurrencyAmount(n.amountCents, neg.currency || 'usd') : null,
          detail: n.detail,
          inboxUrl: `${getBaseUrl()}/dashboard/negotiations`,
        })
        await sendEmail({ to: ownerEmail, subject: mail.subject, html: mail.html, text: mail.text })
      })
    }
    // Buyer-facing status update for the negotiation buyer (status_token = portal credential).
    if (buyerNotify && hasEmailEnv() && neg.buyer_email && neg.status_token) {
      const bn = buyerNotify
      const buyerTo = neg.buyer_email
      const token = neg.status_token
      after(async () => {
        const { data: page } = neg.page_id
          ? await admin.from('pages').select('name').eq('id', neg.page_id as string).maybeSingle<{ name: string | null }>()
          : { data: null }
        const mail = await buildBuyerStatusEmail({
          kind: bn.kind,
          businessName: page?.name || neg.slug || 'the seller',
          offerName: neg.offer_name || 'Agreement',
          amount: bn.amountCents != null ? formatCurrencyAmount(bn.amountCents, neg.currency || 'usd') : null,
          detail: bn.detail,
          manageUrl: `${getBaseUrl()}/orders/${token}`,
        })
        await sendEmail({ to: buyerTo, subject: mail.subject, html: mail.html, text: mail.text })
      })
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
      .select('owner_id, stripe_connect_charges_enabled')
      .eq('stripe_connect_account_id', account.id)
      .maybeSingle<{ owner_id: string; stripe_connect_charges_enabled: boolean | null }>()

    if (billing?.owner_id) {
      const update = {
        stripe_connect_status: account.details_submitted ? 'complete' : 'pending',
        stripe_connect_details_submitted: account.details_submitted,
        stripe_connect_charges_enabled: account.charges_enabled,
        stripe_connect_payouts_enabled: account.payouts_enabled,
      }
      const { error: connectErr } = await admin.from('billing_subscriptions').update(update).eq('owner_id', billing.owner_id)
      if (connectErr) {
        // Don't 200 a failed sync (the Connect-id-bug class): release the idempotency
        // claim and signal a retry so Stripe redelivers and the status isn't left stale.
        console.warn('[Stripe Webhook] account.updated connect sync failed:', connectErr.message)
        await admin.from('stripe_webhook_events').delete().eq('event_id', event.id)
        return NextResponse.json({ error: 'connect sync failed', type: event.type }, { status: 500 })
      }
      // Charges just turned on (false/unset → true): tell the owner they can accept
      // agent payments now. Send-once-guarded (account.updated fires repeatedly).
      const justEnabled = !billing.stripe_connect_charges_enabled && account.charges_enabled === true
      if (justEnabled && hasEmailEnv()) {
        const ownerId = billing.owner_id
        after(async () => {
          const to = await resolveOwnerNotifyEmail({ ownerId })
          if (!to) return
          await sendOnceSystemEmail({
            ownerId,
            kind: 'stripe_connected',
            to,
            build: () => buildStripeConnectedEmail({ financeUrl: `${getBaseUrl()}/dashboard/finance` }),
          })
        })
      }
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
