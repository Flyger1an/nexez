import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../../utils/supabase/server'
import { formatOfferLines, type OfferItem } from '../../../../../lib/agent-page'
import { fetchAcuityTypes, gateIntegrationImport } from '../../../../../lib/server/integration-importers'

/**
 * Acuity Scheduling integration (Phase 3 consumer track).
 *
 * Real path: POST { userId, apiKey } → live Acuity API
 * (GET /api/v1/appointment-types, HTTP Basic auth) mapped to rich OfferItem[].
 * The live fetch lives in lib/server/integration-importers (shared with the
 * interview's /ingest); this route adds the sample fallback.
 */

type AcuityImportRequest = {
  userId?: string
  apiKey?: string
  pageId?: string        // when importing INTO an existing page (collaboration)
}

function sampleOffers(): OfferItem[] {
  return [
    {
      name: 'Discovery Call (30 min)',
      description: 'Free initial call to explore fit for a coaching or consulting engagement.',
      price: '$0',
      url: '',
      duration: '30 min',
      source: 'acuity',
      confidence: 0.95,
    },
    {
      name: 'Strategy Session',
      description: 'Deep-dive strategy session for business or personal development goals.',
      price: '$250',
      url: '',
      duration: '90 min',
      source: 'acuity',
      confidence: 0.93,
    },
    {
      name: 'Personal Training (In Studio)',
      description: 'One-on-one personal training session tailored to your goals.',
      price: '$85',
      url: '',
      duration: '60 min',
      serviceArea: 'Studio only',
      isMobile: false,
      source: 'acuity',
      confidence: 0.91,
      tiers: [
        { name: 'Single Session', price: '$85' },
        { name: '5-Pack', price: '$375', description: '$75 per session' },
      ],
    },
  ]
}

export async function POST(request: Request) {
  // Require auth + `integrations` (Pro) ON THE EFFECTIVE OWNER: authenticated outbound
  // call with a caller-supplied API key - not anonymously abusable, and live sync is
  // Pro. A `pageId` lets an editor-collaborator import into the owner's page (gate on
  // the owner's plan); the page-less create flow self-gates.
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in to import from Acuity.' }, { status: 401 })
  }

  let body: AcuityImportRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const gate = await gateIntegrationImport({
    supabase,
    user,
    pageId: body.pageId,
    proMessage: 'Connecting Acuity is a Pro feature. Upgrade to sync appointment types, or add offers manually / upload a CSV (free).',
  })
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const userId = (body?.userId || '').trim()
  const apiKey = (body?.apiKey || '').trim()

  if (userId && apiKey) {
    const live = await fetchAcuityTypes(userId, apiKey)
    if (live && live.length) {
      return NextResponse.json({
        success: true,
        source: 'acuity',
        connected: true,
        structuredOffers: live,
        lines: formatOfferLines(live),
        note: `Imported ${live.length} appointment type(s) live from Acuity.`,
      })
    }
  }

  const offers = sampleOffers()
  return NextResponse.json({
    success: true,
    source: 'acuity',
    connected: false,
    structuredOffers: offers,
    lines: formatOfferLines(offers),
    note:
      userId && apiKey
        ? 'Could not reach Acuity (check the User ID and API key). Showing sample data.'
        : 'Sample Acuity appointment types. POST { userId, apiKey } to import live.',
  })
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Acuity import. POST { userId, apiKey } to sync live appointment types, or POST {} for sample data.',
  })
}
