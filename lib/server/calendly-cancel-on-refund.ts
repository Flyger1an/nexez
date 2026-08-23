import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cancelCalendlyEvent, calendlyEventUuid } from './calendly-write'
import { getCalendlyPat, integrationCredentialsConfigured } from './page-integration-credentials'
import { captureEvent } from '../observability'

export type CancelForRefundResult =
  | { cancelled: true }
  | { cancelled: false; reason: 'not_configured' | 'no_page' | 'no_event' | 'already_cancelled' | 'no_pat' | 'bad_uri' | 'calendly_failed' }

/**
 * Cancel the Calendly event linked to a refunded negotiation.
 *
 * The linkage is EXACT: the negotiation's scheduling link was tagged with
 * `utm_content=nz_neg_<id>`, Calendly echoed it back on the invitee webhook, and
 * we recorded the resulting event URI on this row. So there is no wrong-booking
 * hazard - we cancel exactly the event the buyer booked from this negotiation.
 *
 * Idempotent via `calendly_cancelled_at`: stamped only after a CONFIRMED cancel,
 * so a transient Calendly failure leaves the row eligible for a later retry, and
 * a re-delivered event never double-cancels.
 *
 * Best-effort and fully dormant without INTEGRATION_SECRET_KEY (no PAT to decrypt).
 */
export async function cancelCalendlyForRefund(
  admin: SupabaseClient,
  neg: { id: string; page_id: string | null; calendly_event_uri: string | null; calendly_cancelled_at: string | null },
): Promise<CancelForRefundResult> {
  if (!integrationCredentialsConfigured()) return { cancelled: false, reason: 'not_configured' }
  if (!neg.page_id) return { cancelled: false, reason: 'no_page' }
  if (!neg.calendly_event_uri) return { cancelled: false, reason: 'no_event' }
  if (neg.calendly_cancelled_at) return { cancelled: false, reason: 'already_cancelled' }

  const uuid = calendlyEventUuid(neg.calendly_event_uri)
  if (!uuid) {
    captureEvent('integration.calendly_cancel_skipped', { negotiationId: neg.id, reason: 'bad_uri' })
    return { cancelled: false, reason: 'bad_uri' }
  }

  const pat = await getCalendlyPat(neg.page_id)
  if (!pat) return { cancelled: false, reason: 'no_pat' }

  const ok = await cancelCalendlyEvent(pat, uuid, 'Booking cancelled - the Nexez order was refunded.')
  if (!ok) {
    captureEvent('integration.calendly_cancel_failed', { negotiationId: neg.id })
    return { cancelled: false, reason: 'calendly_failed' }
  }

  // Stamp only on a confirmed cancel (leaves a failed attempt retryable).
  await admin
    .from('agent_negotiations')
    .update({ calendly_cancelled_at: new Date().toISOString() })
    .eq('id', neg.id)
    .is('calendly_cancelled_at', null)

  captureEvent('integration.calendly_cancelled_on_refund', { negotiationId: neg.id })
  return { cancelled: true }
}
