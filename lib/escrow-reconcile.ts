// Pure reconciliation decision: given what we believe (negotiation status) and what
// Stripe actually reports for the payment intent, decide whether to self-heal the
// negotiation, and to what. Kept framework-free so it's exhaustively unit-tested;
// the reconcile-escrow cron applies the result.
import type { NegotiationStatus } from './negotiations'

/** Stripe PaymentIntent.status values we care about (subset). */
export type StripePiStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'requires_capture'
  | 'canceled'
  | 'succeeded'

export type ReconcileInput = {
  status: NegotiationStatus
  /** null when the PI could not be retrieved (e.g., deleted / wrong account). */
  piStatus: StripePiStatus | null
  /** true when Stripe shows the charge (partially or fully) refunded. */
  refunded?: boolean
  /** true when there's an open/relevant dispute on the charge. */
  disputed?: boolean
}

export type ReconcileResult =
  | { heal: false; reason: string }
  | { heal: true; toStatus: NegotiationStatus; reason: string }
  // Drift we won't auto-resolve - surfaced for alerting instead of silent guessing.
  | { heal: false; alert: true; reason: string }

/**
 * Reconcile a negotiation's status against the true Stripe payment-intent state.
 * Only the unambiguous drifts self-heal; anything surprising is flagged for alerting
 * rather than guessed.
 */
export function reconcilePaymentState(input: ReconcileInput): ReconcileResult {
  const { status, piStatus, refunded, disputed } = input

  // A disputed/refunded charge is the source of truth regardless of our status.
  if (disputed && status !== 'disputed' && status !== 'refunded') {
    return { heal: true, toStatus: 'disputed', reason: 'stripe_dispute_open' }
  }
  if (refunded && status !== 'refunded' && status !== 'disputed') {
    return { heal: true, toStatus: 'refunded', reason: 'stripe_refunded' }
  }

  // Couldn't read the PI. If we think money is in flight (held/complete), that's
  // worth a human look; otherwise nothing to do.
  if (piStatus == null) {
    if (status === 'held' || status === 'complete') {
      return { heal: false, alert: true, reason: 'payment_intent_unreadable_while_active' }
    }
    return { heal: false, reason: 'no_pi_state' }
  }

  switch (piStatus) {
    case 'succeeded':
      // Captured at Stripe but we never recorded completion → heal forward.
      if (status === 'held' || status === 'agreement_proposed') {
        return { heal: true, toStatus: 'complete', reason: 'pi_succeeded_but_not_complete' }
      }
      return { heal: false, reason: 'consistent' }
    case 'canceled':
      // Authorization released at Stripe but we still show it live → heal to declined.
      if (status === 'held' || status === 'agreement_proposed') {
        return { heal: true, toStatus: 'declined', reason: 'pi_canceled_but_active' }
      }
      if (status === 'complete') {
        // We think it's captured but Stripe says canceled - contradictory, don't guess.
        return { heal: false, alert: true, reason: 'pi_canceled_but_marked_complete' }
      }
      return { heal: false, reason: 'consistent' }
    case 'requires_capture':
      // A live hold. Should be 'held'; if we marked it complete/terminal, that's drift.
      if (status === 'complete' || status === 'declined') {
        return { heal: false, alert: true, reason: 'pi_uncaptured_but_terminal' }
      }
      return { heal: false, reason: 'consistent' }
    default:
      // In-flight / pending states - nothing settled yet.
      return { heal: false, reason: 'pi_pending' }
  }
}
