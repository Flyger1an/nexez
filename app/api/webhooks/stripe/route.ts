import { NextRequest, NextResponse } from 'next/server'

/**
 * Phase 3: Lightweight Stripe webhook listener (price updates foundation).
 * Currently a stub that verifies basic events and logs price changes.
 * Future: Use stable stripe_price_id from offers to intelligently update pages.
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

  // Basic logging for now (production would verify signature with webhook secret)
  if (eventType === 'price.updated' || eventType === 'price.created') {
    const price = body.data?.object || {}
    console.log('[Stripe Webhook] Price event received:', {
      type: eventType,
      price_id: price.id,
      product_id: price.product,
      unit_amount: price.unit_amount,
      currency: price.currency,
    })

    // Phase 3: Structured logging + preparation for auto price sync
    // The stable stripe_price_id / product_id stored on offers during import
    // allows us to intelligently find and update affected pages/offers.
    console.log('[Stripe Webhook] Price change ready for offer sync', {
      price_id: price.id,
      product_id: price.product,
      new_amount: price.unit_amount,
      currency: price.currency,
    })

    // Future real action: Query pages with offers containing this stripe_price_id
    // in metadata and trigger a targeted re-sync or direct price update on the page.
    // For now we log a structured event that downstream systems (or future code)
    // can use to keep prices fresh.
    console.log('[Stripe Webhook] Structured price event ready for sync pipeline', {
      event: 'price.updated',
      price_id: price.id,
      product_id: price.product,
      unit_amount: price.unit_amount,
      currency: price.currency,
      timestamp: new Date().toISOString(),
    })

    // Phase 3: Log as a potential re-sync trigger (can be consumed by future automation)
    console.log('[Stripe Webhook] Price change event logged for potential offer sync (stable IDs available)')
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
