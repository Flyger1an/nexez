import { NextResponse } from 'next/server'
import { formatOfferLines, type OfferItem } from '../../../../../lib/agent-page'

/**
 * Acuity Scheduling Integration Stub (Phase 3 Consumer Track)
 * 
 * Acuity is a very popular scheduling tool for consumer services (coaching, beauty, wellness, medical, fitness).
 * This is the second consumer booking integration started in the "build as much as possible" / full throttle phase.
 * 
 * Returns rich OfferItem[] with strong scheduling/consumer fields.
 * Future: Real Acuity API integration (OAuth + calendar + appointment types).
 */

export async function POST(request: Request) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const structuredOffers = [
    {
      name: 'Discovery Call (30 min)',
      description: 'Free initial call to explore fit for coaching or consulting engagement.',
      price: '$0',
      duration: '30 min',
      source: 'acuity' as const,
      confidence: 0.95,
      metadata: {
        acuity_appointment_type_id: 'demo-001',
        imported_at: new Date().toISOString(),
      },
      tiers: [
        { name: 'Free Intro', price: '$0', description: '30 minutes' },
      ],
    },
    {
      name: 'Strategy Session',
      description: 'Deep-dive strategy session for business or personal development goals.',
      price: '$250',
      duration: '90 min',
      source: 'acuity' as const,
      confidence: 0.93,
      metadata: {
        acuity_appointment_type_id: 'demo-002',
        imported_at: new Date().toISOString(),
      },
    },
    {
      name: 'Mobile Waxing Service - Full Body',
      description: 'Professional mobile waxing service in the comfort of your home.',
      price: '$120',
      duration: '60 min',
      serviceArea: 'City metro area',
      isMobile: true,
      travelFee: '$15',
      source: 'acuity' as const,
      confidence: 0.89,
      metadata: {
        acuity_appointment_type_id: 'demo-wax-01',
        imported_at: new Date().toISOString(),
      },
    },
    {
      name: 'Personal Training - In Studio',
      description: 'One-on-one personal training session tailored to your goals.',
      price: '$85',
      duration: '60 min',
      serviceArea: 'Studio only',
      isMobile: false,
      source: 'acuity' as const,
      confidence: 0.91,
      metadata: {
        acuity_appointment_type_id: 'demo-pt-01',
        imported_at: new Date().toISOString(),
      },
      tiers: [
        { name: 'Single Session', price: '$85' },
        { name: '5-Pack', price: '$375', description: '$75 per session' },
      ],
    },
  ]

  return NextResponse.json({
    success: true,
    source: 'acuity',
    structuredOffers,
    lines: formatOfferLines(structuredOffers as any),
    note: 'Acuity Scheduling consumer stub. Excellent for appointment-heavy consumer services. Uses full formatOfferLines for fidelity.',
  })
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Acuity consumer scheduling stub. POST for import.',
  })
}
