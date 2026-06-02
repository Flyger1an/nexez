import { NextResponse } from 'next/server'

/**
 * Square Integration Stub (Phase 3 Consumer Track)
 * 
 * Square is one of the most common booking/payment tools for consumer/local services
 * (hair, massage, fitness, pet grooming, plumbing, etc.).
 * 
 * This is the starting stub per ROADMAP "consumer-specific: Square, Acuity, or Booksy exploration".
 * 
 * Current: Returns realistic rich OfferItem[] with consumer fields (duration, serviceArea, isMobile, travelFee, tiers).
 * Future: Real Square Catalog API + Booking API integration using OAuth or Access Token.
 * 
 * Accepts optional `accessToken` or `locationId` for future real calls.
 * For now it returns high-quality demo data that feels like a real Square import.
 */

type SquareImportRequest = {
  accessToken?: string
  locationId?: string
  merchantId?: string
}

export async function POST(request: Request) {
  let body: SquareImportRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // In real future we would call Square Catalog API + Booking API here.
  // For now: high-fidelity stub that demonstrates the consumer service contract perfectly.

  const structuredOffers = [
    {
      name: '60-min Deep Tissue Massage',
      description: 'Therapeutic deep tissue work targeting chronic tension. Includes hot towels and essential oils.',
      price: '$95',
      duration: '60 min',
      serviceArea: 'Metro area + 15mi radius',
      isMobile: true,
      travelFee: '$15 outside 10mi',
      source: 'square' as const,
      confidence: 0.96,
      metadata: {
        square_item_id: 'demo-item-001',
        imported_at: new Date().toISOString(),
        square_variation_id: 'demo-var-001',
      },
      tiers: [
        { name: 'Standard', price: '$95', description: '60 minutes' },
        { name: '90 min Premium', price: '$135', description: 'Extended session' },
      ],
    },
    {
      name: 'Swedish Relaxation Massage',
      description: 'Classic full-body Swedish massage for stress relief and circulation.',
      price: '$75',
      duration: '60 min',
      serviceArea: 'In-studio or mobile',
      isMobile: true,
      travelFee: '$10',
      source: 'square' as const,
      confidence: 0.94,
      metadata: {
        square_item_id: 'demo-item-002',
        imported_at: new Date().toISOString(),
      },
    },
    {
      name: 'Signature Facial + LED Therapy',
      description: 'Custom facial with extractions, mask, and LED light therapy.',
      price: '$110',
      duration: '75 min',
      serviceArea: 'Studio only',
      isMobile: false,
      source: 'square' as const,
      confidence: 0.91,
      metadata: {
        square_item_id: 'demo-item-003',
        imported_at: new Date().toISOString(),
      },
      tiers: [
        { name: 'Basic', price: '$110' },
        { name: 'Deluxe with Peel', price: '$145' },
      ],
    },
    {
      name: 'Mobile Home Service Call (Plumbing)',
      description: 'Diagnostic + minor repair visit for residential plumbing issues.',
      price: '$149',
      duration: '45-90 min',
      serviceArea: 'City + suburbs',
      isMobile: true,
      travelFee: 'Included within 20mi',
      source: 'square' as const,
      confidence: 0.88,
      metadata: {
        square_item_id: 'demo-item-plumb-01',
        imported_at: new Date().toISOString(),
      },
    },
  ]

  return NextResponse.json({
    success: true,
    source: 'square',
    structuredOffers,
    lines: structuredOffers.map(o => 
      `${o.name} | ${o.price} | ${o.description} | | ${o.duration} | ${o.serviceArea} | ${o.isMobile ? 'mobile' : ''} | ${o.travelFee || ''}`
    ),
    note: 'This is a high-quality Phase 3 consumer stub. Real Square Catalog + Booking API integration coming next.',
  })
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Square consumer booking integration stub. POST with optional accessToken/locationId for future real sync.',
  })
}
