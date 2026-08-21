import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../../../utils/supabase/server'
import { createAdminClient } from '../../../../../../utils/supabase/admin'
import { gateIntegrationImport, importCalendlyOffers } from '../../../../../../lib/server/integration-importers'
import { getCalendlyPat, integrationCredentialsConfigured } from '../../../../../../lib/server/page-integration-credentials'
import { fetchCalendlyEventTypeAvailability } from '../../../../../../lib/server/calendly-write'
import { smartMergeOffers } from '../../../../../../lib/editor-merge'
import { applyEventTypeAvailability, buildCalendlyNextAvailable, calendlyEventTypeRefs } from '../../../../../../lib/calendly-availability'
import { parseAvailabilityWindows, type OfferItem } from '../../../../../../lib/agent-page'
import { enforceRateLimit } from '../../../../../../lib/rate-limit'
import { captureEvent } from '../../../../../../lib/observability'

const HORIZON_DAYS = 7

/**
 * Sync this page's Calendly offers + availability from the STORED per-page PAT —
 * no re-entering the token. Closes the gap where connecting Calendly (Settings)
 * stored a credential nothing then used: this pulls the seller's live event types
 * in as `source: 'calendly'` offers (each stamped with its event-type URI, which
 * single-use link minting needs) and refreshes advertised availability from the
 * real event-type availability, exactly like the background cron.
 *
 * Owner/editor + Pro gated (same as every Calendly import surface). Dormant
 * without INTEGRATION_SECRET_KEY; a 400 if no PAT is connected yet.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(request, 'calendly-sync', 10, 60_000)
  if (limited) return limited

  const { id: pageId } = await ctx.params
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Page-access + Pro gate — identical to the token-based Calendly import route.
  const gate = await gateIntegrationImport({
    supabase,
    user,
    pageId,
    proMessage: 'Syncing from Calendly is a Pro feature. Upgrade to pull live event types + availability.',
  })
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  if (!integrationCredentialsConfigured()) {
    return NextResponse.json({ error: 'Calendly credential storage is not configured on this deployment.' }, { status: 503 })
  }
  const pat = await getCalendlyPat(pageId)
  if (!pat) {
    return NextResponse.json({ error: 'Connect Calendly in Settings before syncing.' }, { status: 400 })
  }

  // 1) Live event types → offers, each carrying its event-type URI in metadata.
  const imported = await importCalendlyOffers(pat)
  if (!imported.ok) {
    return NextResponse.json({ error: imported.error }, { status: 502 })
  }

  const admin = createAdminClient()
  const { data: page } = await admin
    .from('pages')
    .select('id, slug, services, next_available')
    .eq('id', pageId)
    .maybeSingle<{ id: string; slug: string; services: OfferItem[] | null; next_available: string | null }>()
  if (!page) return NextResponse.json({ error: 'Page not found.' }, { status: 404 })

  // 2) Merge Calendly offers in. CRITICAL: only ever manage CALENDLY-sourced
  // offers. smartMergeOffers('all') joins by name and would overwrite a
  // same-named manual offer's price/URL/description/source — a common collision
  // ("Consultation", "Intro Call") that would silently destroy owner-authored
  // pricing. So scope the merge to the EXISTING Calendly offers and leave every
  // manually-authored offer exactly as-is; a same-named event type is added as a
  // separate Calendly offer rather than clobbering the manual one.
  const existingOffers = page.services ?? []
  const managed = existingOffers.filter((o) => o.source === 'calendly')
  const untouched = existingOffers.filter((o) => o.source !== 'calendly')
  const mergedCalendly = smartMergeOffers(managed, imported.offers, 'all')
  // smartMergeOffers drops metadata on a name-collision merge — reconcile the
  // event-type URI onto the matched Calendly offer (single-use minting needs it).
  for (const inc of imported.offers) {
    const uri = inc.metadata?.calendly_event_type
    if (!uri) continue
    const match = mergedCalendly.find((o) => o.name.toLowerCase() === inc.name.toLowerCase())
    if (match) match.metadata = { ...(match.metadata ?? {}), calendly_event_type: uri }
  }
  let services = [...untouched, ...mergedCalendly]

  // 3) Availability from Calendly's real event-type slots (mirrors the cron).
  // Calendly has already applied the owner's timezone, business hours, date
  // overrides, conflicts, and booking rules. A failed fetch leaves the current
  // availability untouched (never blanks it).
  const nowIso = new Date().toISOString()
  const eventTypeAvailability = await fetchCalendlyEventTypeAvailability(
    pat,
    calendlyEventTypeRefs(services),
    { days: HORIZON_DAYS },
  )
  let windows: Array<{ label: string }> = []
  const update: Record<string, unknown> = {}
  if (eventTypeAvailability) {
    windows = eventTypeAvailability.windows
    services = applyEventTypeAvailability(services, eventTypeAvailability.availabilityByEventType, nowIso)
    // Refresh the free-text availability note from Calendly — but NEVER stomp a
    // note the seller hand-wrote. Only write when the current value is empty or
    // already Calendly-managed (has the ||WINDOWS|| marker), and skip a no-op
    // write (churn), mirroring the cron.
    const priorIsManual = parseAvailabilityWindows(page.next_available) === null && Boolean(page.next_available && page.next_available.trim())
    if (!priorIsManual && (eventTypeAvailability.complete || windows.length > 0)) {
      const next = buildCalendlyNextAvailable(windows, HORIZON_DAYS)
      if (next !== page.next_available) update.next_available = next
    }
  }
  update.services = services

  const { error: writeErr } = await admin.from('pages').update(update).eq('id', pageId)
  if (writeErr) {
    return NextResponse.json({ error: 'Could not save the synced offers.' }, { status: 500 })
  }
  // Advance the rotation cursor so the background cron doesn't immediately re-run it.
  await admin.from('page_secrets').update({ calendly_synced_at: nowIso }).eq('page_id', pageId)

  captureEvent('integration.calendly_manual_sync', { slug: page.slug, imported: imported.offers.length, windows: windows.length })
  return NextResponse.json({
    ok: true,
    imported: imported.offers.length,
    windows: windows.length,
    availability_synced: Boolean(eventTypeAvailability),
    note: imported.note,
  })
}
