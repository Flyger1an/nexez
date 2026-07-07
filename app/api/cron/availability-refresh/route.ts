import { NextResponse } from 'next/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { applyOfferAvailability, computeAvailability, offerBookingCap } from '../../../../lib/calendly-availability'
import { countRecentBookings } from '../../../../lib/server/booking-count'
import { getCheckoutOfferKey, type OfferItem } from '../../../../lib/agent-page'
import { captureEvent } from '../../../../lib/observability'

export const maxDuration = 60

type CronPage = { id: string; slug: string; services: OfferItem[] | null; products: OfferItem[] | null }

/**
 * Availability refresh (Vercel cron - see vercel.json). The Calendly webhook
 * flips an offer's advertised availability when a booking lands or cancels,
 * but a rolling-week cap also frees up as time passes with NO event to
 * trigger a recompute - a sold-out week would stay sold_out forever without
 * this sweep. Recomputes every sync-MANAGED offer (a positive booking cap +
 * the metadata.last_calendly_sync stamp the webhook writes on first sync) so
 * manually set availability on unmanaged offers is never touched.
 *
 * Protected: scheduled runs must send `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'cron_secret_not_configured' }, { status: 503 })
  }

  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ ok: false, error: 'service_role_required' }, { status: 503 })
  }

  const admin = createAdminClient()
  const { data: pages, error } = await admin
    .from('pages')
    .select('id, slug, services, products')
    .eq('is_published', true)
    .returns<CronPage[]>()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  let checked = 0
  let updated = 0
  for (const page of pages ?? []) {
    for (const kind of ['services', 'products'] as const) {
      const offers = page[kind] ?? []
      let current = offers
      let changed = false
      for (let index = 0; index < offers.length; index++) {
        const offer = offers[index]!
        const cap = offerBookingCap(offer)
        if (cap == null || !offer.metadata?.last_calendly_sync) continue
        checked += 1
        const booked = await countRecentBookings(admin, {
          slug: page.slug,
          offerKey: getCheckoutOfferKey(kind, index),
          offerName: offer.name,
        })
        const applied = applyOfferAvailability(current, index, computeAvailability(cap, booked), new Date().toISOString())
        if (applied.changed) {
          current = applied.offers
          changed = true
        }
      }
      if (changed) {
        const { error: updateError } = await admin.from('pages').update({ [kind]: current }).eq('id', page.id)
        if (updateError) console.warn('[availability-refresh] update failed for', page.slug, updateError.message)
        else updated += 1
      }
    }
  }

  captureEvent('cron.availability_refresh', { pages: pages?.length ?? 0, offersChecked: checked, columnsUpdated: updated })
  return NextResponse.json({ ok: true, pages: pages?.length ?? 0, offersChecked: checked, columnsUpdated: updated })
}
