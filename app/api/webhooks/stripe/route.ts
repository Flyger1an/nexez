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
    // In a future iteration this would query pages where offers have
    // metadata.stripe_price_id === price.id and trigger updates.
    console.log('[Stripe Webhook] Price change ready for offer sync (using stored stable IDs)')
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
