import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../../utils/supabase/server'
import { formatOfferLines } from '../../../../../lib/agent-page'
import { fetchAcuityTypes, gateIntegrationImport } from '../../../../../lib/server/integration-importers'

/**
 * Acuity Scheduling integration (Phase 3 consumer track).
 *
 * Real path: POST { userId, apiKey } → live Acuity API
 * (GET /api/v1/appointment-types, HTTP Basic auth) mapped to rich OfferItem[].
 * The live fetch lives in lib/server/integration-importers (shared with the
 * interview's /ingest). This route never substitutes invented sample offers.
 */

type AcuityImportRequest = {
  userId?: string
  apiKey?: string
  pageId?: string        // when importing INTO an existing page (collaboration)
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
  if (!userId || !apiKey) {
    return NextResponse.json({ error: 'An Acuity User ID and API key are required.' }, { status: 400 })
  }

  const live = await fetchAcuityTypes({ userId, apiKey })
  if (!live?.length) {
    return NextResponse.json(
      { error: 'Could not reach Acuity. Check the User ID and API key, then try again.' },
      { status: 502 },
    )
  }
  return NextResponse.json({
    success: true,
    source: 'acuity',
    connected: true,
    structuredOffers: live,
    lines: formatOfferLines(live),
    note: `Imported ${live.length} appointment type(s) live from Acuity.`,
  })
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Acuity live import. POST { userId, apiKey } to sync appointment types.',
  })
}
