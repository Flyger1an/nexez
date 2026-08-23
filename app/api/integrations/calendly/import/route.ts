import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../../utils/supabase/server'
import { gateIntegrationImport, importCalendlyOffers } from '../../../../../lib/server/integration-importers'

/**
 * Calendly Integration for Nexez - import booking/event types as structured offers.
 * Flow: user pastes a Calendly Personal Access Token; we fetch their event types.
 * The fetch + parse now lives in lib/server/integration-importers (shared with the
 * interview's /ingest); this route is auth + Pro gate + response shaping.
 */
export async function POST(request: Request) {
  // Require auth + the `integrations` (Pro) capability ON THE EFFECTIVE OWNER: this
  // route makes an authenticated outbound call with a caller-supplied token, so it
  // must not be anonymously abusable, and live third-party sync is a Pro feature.
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in to import from Calendly.' }, { status: 401 })
  }

  let body: { token?: string; pageId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const gate = await gateIntegrationImport({
    supabase,
    user,
    pageId: body.pageId,
    proMessage: 'Connecting Calendly is a Pro feature. Upgrade to sync live event types, or add offers manually / upload a CSV (free).',
  })
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  if (!body.token) {
    return NextResponse.json({ error: 'Calendly Personal Access Token is required' }, { status: 400 })
  }

  const result = await importCalendlyOffers(body.token)
  if (!result.ok) {
    return NextResponse.json(
      result.upstreamStatus != null ? { error: result.error, status: result.upstreamStatus } : { error: result.error },
      { status: result.status },
    )
  }
  if (result.offers.length === 0) {
    return NextResponse.json({ lines: [], message: result.note })
  }
  const lines = result.lines ?? []
  return NextResponse.json({
    ok: true,
    count: lines.length,
    lines, // legacy compat
    structuredOffers: result.offers,
    message: result.note,
  })
}
