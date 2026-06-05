import { NextResponse } from 'next/server'
import { formatOfferLines, type OfferItem } from '../../../../../lib/agent-page'
import { mapSquareCatalogToOffers } from '../../../../../lib/integrations'

/**
 * Square integration (Phase 3 consumer track).
 *
 * Real path: POST { accessToken } → live Square Catalog API
 * (GET /v2/catalog/list?types=ITEM) mapped to rich OfferItem[] (variations →
 * tiers, price_money → price). Falls back to sample data when no token is
 * supplied or the call fails, so the flow always demonstrates the contract.
 */

type SquareImportRequest = {
  accessToken?: string
  locationId?: string
  merchantId?: string
}

async function fetchSquareCatalog(accessToken: string): Promise<OfferItem[] | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 9000)
  try {
    const res = await fetch('https://connect.squareup.com/v2/catalog/list?types=ITEM', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Square-Version': '2024-06-04',
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    const offers = mapSquareCatalogToOffers(Array.isArray(data?.objects) ? data.objects : [])
    return offers.length ? offers : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function sampleOffers(): OfferItem[] {
  return [
    {
      name: '60-min Deep Tissue Massage',
      description: 'Therapeutic deep tissue work targeting chronic tension. Includes hot towels and essential oils.',
      price: '$95',
      url: '',
      duration: '60 min',
      serviceArea: 'Metro area + 15mi radius',
      isMobile: true,
      travelFee: '$15 outside 10mi',
      source: 'square',
      confidence: 0.96,
      tiers: [
        { name: 'Standard', price: '$95', description: '60 minutes' },
        { name: '90 min Premium', price: '$135', description: 'Extended session' },
      ],
    },
    {
      name: 'Swedish Relaxation Massage',
      description: 'Classic full-body Swedish massage for stress relief and circulation.',
      price: '$75',
      url: '',
      duration: '60 min',
      serviceArea: 'In-studio or mobile',
      isMobile: true,
      travelFee: '$10',
      source: 'square',
      confidence: 0.94,
    },
    {
      name: 'Signature Facial + LED Therapy',
      description: 'Custom facial with extractions, mask, and LED light therapy.',
      price: '$110',
      url: '',
      duration: '75 min',
      serviceArea: 'Studio only',
      isMobile: false,
      source: 'square',
      confidence: 0.91,
      tiers: [
        { name: 'Basic', price: '$110' },
        { name: 'Deluxe with Peel', price: '$145' },
      ],
    },
  ]
}

export async function POST(request: Request) {
  let body: SquareImportRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const accessToken = (body?.accessToken || '').trim()

  if (accessToken) {
    const live = await fetchSquareCatalog(accessToken)
    if (live && live.length) {
      return NextResponse.json({
        success: true,
        source: 'square',
        connected: true,
        structuredOffers: live,
        lines: formatOfferLines(live),
        note: `Imported ${live.length} item(s) live from your Square catalog.`,
      })
    }
  }

  const offers = sampleOffers()
  return NextResponse.json({
    success: true,
    source: 'square',
    connected: false,
    structuredOffers: offers,
    lines: formatOfferLines(offers),
    note: accessToken
      ? 'Could not reach Square (check the access token and Catalog read permission). Showing sample data.'
      : 'Sample Square catalog. POST { accessToken } to import your live items.',
  })
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Square Catalog import. POST { accessToken } to sync live items, or POST {} for sample data.',
  })
}
