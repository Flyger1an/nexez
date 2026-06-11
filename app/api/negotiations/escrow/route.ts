import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { getBaseUrl } from '../../../../lib/agent-page'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import type { AgentNegotiation } from '../../../../lib/negotiations'

/**
 * Negotiation escrow — real Stripe manual-capture (authorization hold).
 *
 * Seller-driven, gated on STRIPE_SECRET_KEY:
 *  - action 'hold'    → a Checkout Session that authorizes (holds) the buyer's
 *                       card with capture_method:'manual'. The held status +
 *                       payment_intent_id are recorded by the Stripe webhook
 *                       (checkout.session.completed) once the buyer authorizes.
 *  - action 'capture' → captures a held authorization → status 'complete'.
 *  - action 'cancel'  → releases the hold → status 'declined'.
 */
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, 'negotiation-escrow', 20, 60_000)
  if (limited) return limited

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    return NextResponse.json(
      { error: 'Escrow is not available yet. Enable Stripe payments to use manual-capture holds.' },
      { status: 412 },
    )
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { negotiationId?: string; action?: 'hold' | 'capture' | 'cancel' }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { negotiationId, action } = body
  if (!negotiationId || !action) {
    return NextResponse.json({ error: 'negotiationId and action are required.' }, { status: 400 })
  }

  // Load the negotiation — RLS ensures the caller can only read their own.
  const { data: negotiation, error } = await supabase
    .from('agent_negotiations')
    .select('*')
    .eq('id', negotiationId)
    .eq('owner_id', user.id)
    .maybeSingle<AgentNegotiation>()

  if (error || !negotiation) {
    return NextResponse.json({ error: 'Negotiation not found.' }, { status: 404 })
  }

  const stripe = new Stripe(secret)

  try {
    if (action === 'hold') {
      if (negotiation.status !== 'agreement_proposed') {
        return NextResponse.json({ error: 'Propose an agreement before placing an escrow hold.' }, { status: 409 })
      }
      if (!negotiation.amount_cents || negotiation.amount_cents < 50) {
        return NextResponse.json({ error: 'A valid agreed amount is required to hold funds.' }, { status: 409 })
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: negotiation.currency || 'usd',
              unit_amount: negotiation.amount_cents,
              product_data: { name: `${negotiation.offer_name} — escrow hold` },
            },
            quantity: 1,
          },
        ],
        payment_intent_data: { capture_method: 'manual' },
        success_url: `${getBaseUrl()}/dashboard/negotiations?escrow=held`,
        cancel_url: `${getBaseUrl()}/dashboard/negotiations?escrow=cancelled`,
        metadata: { nexez_negotiation_id: negotiation.id, nexez_kind: 'negotiation_escrow' },
      })
      return NextResponse.json({ ok: true, action, url: session.url, sessionId: session.id })
    }

    if (action === 'capture') {
      if (negotiation.status !== 'held' || !negotiation.stripe_payment_intent_id) {
        return NextResponse.json({ error: 'No held authorization to capture.' }, { status: 409 })
      }
      await stripe.paymentIntents.capture(negotiation.stripe_payment_intent_id)
      await supabase
        .from('agent_negotiations')
        .update({ status: 'complete' })
        .eq('id', negotiation.id)
        .eq('owner_id', user.id)
      return NextResponse.json({ ok: true, action, status: 'complete' })
    }

    if (action === 'cancel') {
      if (negotiation.stripe_payment_intent_id) {
        await stripe.paymentIntents.cancel(negotiation.stripe_payment_intent_id).catch(() => {})
      }
      await supabase
        .from('agent_negotiations')
        .update({ status: 'declined' })
        .eq('id', negotiation.id)
        .eq('owner_id', user.id)
      return NextResponse.json({ ok: true, action, status: 'declined' })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Escrow action failed.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
