import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'
import type { OfferItem } from '../../../../lib/agent-page'

/**
 * Phase 3: Stripe webhook listener — now ACTIVE for price updates.
 * Uses the stable stripe_price_id / stripe_product_id stored in offer metadata during import
 * to find and update affected offers across pages without duplicates.
 *
 * On price.updated / price.created:
 *  - Format new price string consistently with the Stripe import route.
 *  - Scan pages' services/products JSONB for matching metadata IDs (source-aware).
 *  - Protected update: only touch offers that still have source 'stripe' and a different price.
 *  - Log a durable 'stripe_price_sync' event (visible in analytics).
 *  - The editor Re-sync and public pages immediately see the fresh prices.
 *
 * This delivers the "Prices update on ... webhook" roadmap item.
 */

export async function POST(request: NextRequest) {
  const sig = request.headers.get('stripe-signature')
  let body: any

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = body.type || 'unknown'

  // Active price sync logic (Phase 3)
  if (eventType === 'price.updated' || eventType === 'price.created') {
    const priceObj = body.data?.object || {}
    const priceId = priceObj.id
    const productId = priceObj.product
    const unitAmount = priceObj.unit_amount
    const currency = (priceObj.currency || 'usd').toUpperCase()
    const interval = priceObj.recurring?.interval ? ` / ${priceObj.recurring.interval}` : ''

    const formattedPrice = unitAmount
      ? `$${(unitAmount / 100).toFixed(0)}${interval}`
      : 'Custom'

    console.log('[Stripe Webhook] Price event received (active sync path):', {
      type: eventType,
      price_id: priceId,
      product_id: productId,
      new_price: formattedPrice,
    })

    // Scan pages for offers carrying the matching stable IDs (import stores them in metadata).
    // Broad but safe scan — pages table is small and webhooks are infrequent.
    const { data: pages } = await supabase
      .from('pages')
      .select('id, slug, services, products, owner_id')

    let updates = 0
    const changedOffers: Array<{ slug: string; name: string; old: string; new: string }> = []

    if (pages) {
      for (const pg of pages) {
        let services = (pg.services || []) as OfferItem[]
        let products = (pg.products || []) as OfferItem[]
        let pageChanged = false

        const matcher = (o: OfferItem) =>
          o?.metadata &&
          ((o.metadata as any).stripe_price_id === priceId ||
            (o.metadata as any).stripe_product_id === productId ||
            (o.metadata as any).stripe_price_id === priceObj.id)

        const applyPrice = (arr: OfferItem[]) =>
          arr.map((o) => {
            if (matcher(o) && o.source === 'stripe' && o.price !== formattedPrice) {
              changedOffers.push({ slug: pg.slug, name: o.name, old: o.price || '', new: formattedPrice })
              pageChanged = true
              updates++
              return { ...o, price: formattedPrice, metadata: { ...(o.metadata || {}), last_stripe_sync: new Date().toISOString() } }
            }
            return o
          })

        services = applyPrice(services)
        products = applyPrice(products)

        if (pageChanged) {
          try {
            await supabase
              .from('pages')
              .update({ services, products })
              .eq('id', pg.id)

            // Durable audit event (appears in analytics + can drive further automation)
            await supabase.from('checkout_events').insert({
              page_id: pg.id,
              owner_id: pg.owner_id || null,
              slug: pg.slug,
              offer_key: 'stripe:price-sync',
              offer_name: `Stripe price sync (${changedOffers.filter(c => c.slug === pg.slug).map(c => c.name).join(', ')})`,
              offer_kind: 'product',
              event_type: 'stripe_price_sync',
              agent_user_agent: 'Stripe-Webhook',
              metadata: {
                source: 'stripe_webhook',
                price_id: priceId,
                product_id: productId,
                new_price: formattedPrice,
                changes: changedOffers.filter(c => c.slug === pg.slug),
              },
              created_at: new Date().toISOString(),
            })
          } catch (e: any) {
            console.warn('[Stripe Webhook] Failed to persist price sync for page', pg.slug, e?.message)
          }
        }
      }
    }

    console.log('[Stripe Webhook] Active price sync complete', {
      price_id: priceId,
      pages_scanned: pages?.length || 0,
      offers_updated: updates,
      examples: changedOffers.slice(0, 3),
    })
  }

  // Always acknowledge quickly
  return NextResponse.json({ received: true, type: eventType }, { status: 200 })
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Stripe webhook receiver (price updates stub). POST events here.',
  })
}
