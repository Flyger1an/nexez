// Hybrid settlement classification - pure, framework-free.
//
// When a negotiation reaches an agreed amount, it is classified into one of two
// settlement paths:
//   - 'auto'              → low value: buyer self-serves payment, captured immediately.
//   - 'awaiting_approval' → high value: parks until the owner approves, then a
//                            manual-capture escrow hold the owner captures on delivery.
// The owner approving an 'awaiting_approval' negotiation moves it to 'approved'.
import { OfferItem } from './agent-page'
import { parseMoneyCents } from './checkout'

/** Platform default auto-settle ceiling when an offer sets no `rules.autoSettleMax`. */
export const AUTO_SETTLE_DEFAULT_CENTS = 200_000 // $2,000

export type SettlementState = 'auto' | 'awaiting_approval' | 'approved'

/** Settlement states from which the buyer may pay (their funding link is live). */
export function isPayable(state: SettlementState | null | undefined): boolean {
  return state === 'auto' || state === 'approved'
}

/** The auto-settle ceiling for an offer, in cents - per-offer override or platform default. */
export function getAutoSettleCeilingCents(offer: Pick<OfferItem, 'rules'> | null | undefined): number {
  const override = offer?.rules?.autoSettleMax
  if (override) {
    const cents = parseMoneyCents(override)
    if (cents != null && cents > 0) return cents
  }
  return AUTO_SETTLE_DEFAULT_CENTS
}

/**
 * Classify an agreed amount into its initial settlement path.
 * At/below the ceiling settles autonomously; above it requires owner approval.
 */
export function classifySettlement(
  agreedAmountCents: number | null | undefined,
  ceilingCents: number,
): SettlementState {
  if (agreedAmountCents != null && agreedAmountCents > 0 && agreedAmountCents <= ceilingCents) {
    return 'auto'
  }
  return 'awaiting_approval'
}
