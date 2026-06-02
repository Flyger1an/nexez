import Stripe from 'stripe'
import { NextRequest, NextResponse } from 'next/server'
import type { OfferItem } from '../../../../lib/agent-page'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'placeholder')

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const signature = request.headers.get('stripe-signature')

  if (!webhookSecret) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET is not configured.' }, { status: 412 })
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
  })
}

function formatStripePrice(price: Stripe.Price) {
  const interval = price.recurring?.interval ? ` / ${price.recurring.interval}` : ''
  return typeof price.unit_amount === 'number'
    ? `$${(price.unit_amount / 100).toFixed(0)}${interval}`
    : 'Custom'
}
