import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../../utils/supabase/server'
import { formatOfferLines, type OfferItem } from '../../../../../lib/agent-page'
import { fetchSquareCatalog, gateIntegrationImport } from '../../../../../lib/server/integration-importers'

/**
 * Square integration (Phase 3 consumer track).
 *
 * Real path: POST { accessToken } → live Square Catalog API
 * (GET /v2/catalog/list?types=ITEM) mapped to rich OfferItem[]. The live fetch
 * lives in lib/server/integration-importers (shared with the interview's
 * /ingest); this route adds the sample fallback so the demo flow always shows
 * the contract even without a token.
 */

type SquareImportRequest = {
  accessToken?: string
  locationId?: string
  merchantId?: string
  pageId?: string        // when importing INTO an existing page (collaboration)
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
  // Require auth + `integrations` (Pro) ON THE EFFECTIVE OWNER: authenticated outbound
  // call with a caller-supplied access token - not anonymously abusable, and live sync
  // is Pro. A `pageId` lets an editor-collaborator import into the owner's page (gate on
  // the owner's plan); the page-less create flow self-gates.
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in to import from Square.' }, { status: 401 })
  }

  let body: SquareImportRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const gate = await gateIntegrationImport({
    supabase,
    user,
    pageId: body.pageId,
    proMessage: 'Connecting Square is a Pro feature. Upgrade to sync your catalog, or add offers manually / upload a CSV (free).',
  })
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

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
