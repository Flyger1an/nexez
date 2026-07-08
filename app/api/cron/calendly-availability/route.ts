import { NextResponse } from 'next/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { deriveAvailabilityWindows } from '../../../../lib/integrations'
import { applyOfferAvailability } from '../../../../lib/calendly-availability'
import { fetchCalendlyBusy } from '../../../../lib/server/calendly-write'
import { getCalendlyPat, integrationCredentialsConfigured } from '../../../../lib/server/page-integration-credentials'
import { parseAvailabilityWindows, type OfferItem } from '../../../../lib/agent-page'
import { captureEvent } from '../../../../lib/observability'

export const maxDuration = 60

// Calendly API calls per run — one per connected page — kept polite/bounded.
const PAGE_LIMIT = 15
// Availability horizon (Calendly caps busy-times at 7 days per request).
const HORIZON_DAYS = 7

type CalPage = { id: string; slug: string; services: OfferItem[] | null; products: OfferItem[] | null; next_available: string | null }

/**
 * Calendly write-side calendar blocking (Vercel cron). For every published page
 * with a stored, encrypted Calendly PAT, pull the seller's REAL busy times, turn
 * them into open availability windows, publish those windows on the listing
 * (next_available → agent.json), and BLOCK (sold_out) the Calendly-sourced
 * offers when the calendar shows no open slots in the horizon — un-blocking them
 * when it frees up. This is calendar truth, superseding the booking-count
 * heuristic for connected pages.
 *
 * Dormant without INTEGRATION_SECRET_KEY (the PATs can't be decrypted).
 * Protected: scheduled runs must send Authorization: Bearer ${CRON_SECRET}.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'cron_secret_not_configured' }, { status: 503 })
  }
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasSupabaseAdminEnv()) return NextResponse.json({ ok: false, error: 'service_role_required' }, { status: 503 })
  if (!integrationCredentialsConfigured()) {
    return NextResponse.json({ ok: false, error: 'credential_storage_not_configured' }, { status: 503 })
  }

  const admin = createAdminClient()
  // Fair rotation: take the PAGE_LIMIT least-recently-synced connected pages
  // (NULLs = never synced, first). Without this ordering, LIMIT returned the
  // same arbitrary N every run and starved later sellers permanently.
  const { data: secretRows } = await admin
    .from('page_secrets')
    .select('page_id')
    .not('calendly_pat_encrypted', 'is', null)
    .order('calendly_synced_at', { ascending: true, nullsFirst: true })
    .limit(PAGE_LIMIT)
  const selectedIds = (secretRows ?? []).map((r: { page_id: string }) => r.page_id)
  if (!selectedIds.length) {
    return NextResponse.json({ ok: true, connected: 0, synced: 0, ran_at: new Date().toISOString() })
  }

  const { data: pages, error } = await admin
    .from('pages')
    .select('id, slug, services, products, next_available')
    .in('id', selectedIds)
    .eq('is_published', true)
    .returns<CalPage[]>()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  let synced = 0
  let offersBlocked = 0
  let offersFreed = 0
  let failed = 0
  const nowIso = new Date().toISOString()

  for (const page of pages ?? []) {
    const pat = await getCalendlyPat(page.id)
    if (!pat) {
      failed += 1
      continue
    }
    const busy = await fetchCalendlyBusy(pat, { days: HORIZON_DAYS })
    if (busy === null) {
      // Couldn't reach Calendly — leave the listing untouched (don't blank it).
      failed += 1
      continue
    }

    const windows = deriveAvailabilityWindows(busy, { days: HORIZON_DAYS })
    const note = windows.length
      ? `Next open slots: ${windows.slice(0, 3).map((w) => w.label).join(', ')} (synced from Calendly)`
      : `No open slots in the next ${HORIZON_DAYS} days (synced from Calendly)`
    const nextAvailable = `${note} ||WINDOWS||${JSON.stringify(windows)}`

    // Only write when the open slots actually changed (avoid churn / updated_at
    // bumps) — OR when the listing has no Calendly-synced marker yet, so the
    // first sync (even a fully-booked "no slots") always publishes.
    const priorWindows = parseAvailabilityWindows(page.next_available)
    const windowsChanged = priorWindows === null || JSON.stringify(priorWindows) !== JSON.stringify(windows)

    // Block/unblock the Calendly-sourced offers from calendar truth.
    const availability = windows.length ? 'available' : 'sold_out'
    const update: Record<string, unknown> = {}
    for (const col of ['services', 'products'] as const) {
      let offers = page[col] ?? []
      let changed = false
      for (let i = 0; i < offers.length; i++) {
        if (offers[i]!.source !== 'calendly') continue
        const applied = applyOfferAvailability(offers, i, availability, nowIso)
        if (applied.changed) {
          offers = applied.offers
          changed = true
          if (availability === 'sold_out') offersBlocked += 1
          else offersFreed += 1
        }
      }
      if (changed) update[col] = offers
    }

    if (windowsChanged) update.next_available = nextAvailable
    if (Object.keys(update).length === 0) continue // nothing changed for this page

    const { error: updateErr } = await admin.from('pages').update(update).eq('id', page.id)
    if (updateErr) {
      console.warn('[calendly-availability] update failed for', page.slug, updateErr.message)
      failed += 1
      continue
    }
    synced += 1
  }

  // Advance the rotation cursor for the WHOLE selected batch — including
  // unpublished/failed ones — so they move to the back of the queue and the
  // next run picks up the next least-recently-synced pages (no starvation).
  await admin.from('page_secrets').update({ calendly_synced_at: nowIso }).in('page_id', selectedIds)

  captureEvent('cron.calendly_availability', {
    batch: selectedIds.length,
    processed: pages?.length ?? 0,
    synced,
    offersBlocked,
    offersFreed,
    failed,
  })
  return NextResponse.json({
    ok: true,
    batch: selectedIds.length,
    processed: pages?.length ?? 0,
    synced,
    offers_blocked: offersBlocked,
    offers_freed: offersFreed,
    failed,
    ran_at: nowIso,
  })
}
