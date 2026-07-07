import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { escapeLike } from './sql-escape'

export const BOOKING_WINDOW_DAYS = 7

/**
 * Rolling-week booking count for one offer - the ONE counter shared by the
 * checkout-time cap gate (rules.maxBookingsPerWeek) and the Calendly
 * availability sync, so the advertised availability and the enforced cap can
 * never disagree. Counts:
 *  - direct checkout bookings on the offer's key (stripe_session_created /
 *    provider_redirect), PLUS
 *  - Calendly webhook bookings (invitee.created rows, logged under the
 *    'calendly:webhook' key and joined by offer name) MINUS Calendly
 *    cancellations in the window. A cancel whose booking predates the window
 *    under-counts by design - the cap fails open, never phantom-blocks.
 * Needs the service-role client: checkout_events are owner-only under RLS.
 */
export async function countRecentBookings(
  admin: SupabaseClient,
  input: { slug: string; offerKey: string; offerName: string },
): Promise<number> {
  const since = new Date(Date.now() - BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const base = () =>
    admin
      .from('checkout_events')
      .select('id', { count: 'exact', head: true })
      .eq('slug', input.slug)
      .gte('created_at', since)

  // Owner test-mode pings (x-nexez-test-mode) are synthetic - they must never
  // count toward the cap or flip real availability. Every calendly:webhook row
  // carries metadata.test_mode, so a plain neq is safe here.
  const calendlyLeg = (eventType: string) =>
    base()
      .eq('offer_key', 'calendly:webhook')
      .ilike('offer_name', escapeLike(input.offerName))
      .eq('metadata->>calendly_event_type', eventType)
      .neq('metadata->>test_mode', 'true')

  const [checkout, created, canceled] = await Promise.all([
    base()
      .eq('offer_key', input.offerKey)
      .in('event_type', ['stripe_session_created', 'provider_redirect']),
    calendlyLeg('invitee.created'),
    calendlyLeg('invitee.canceled'),
  ])

  // A failed leg counts as 0 (the cap fails open, never phantom-blocks) - but
  // it must be VISIBLE, or a broken filter silently disables calendar
  // protection forever.
  for (const leg of [checkout, created, canceled]) {
    if (leg.error) console.warn('[booking-count] count leg failed (fails open):', leg.error.message)
  }

  return (checkout.count ?? 0) + Math.max(0, (created.count ?? 0) - (canceled.count ?? 0))
}
