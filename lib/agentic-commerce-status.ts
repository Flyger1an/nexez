// The single source of truth for a listing's agentic-commerce status, shared by the
// merchant-facing card (Settings) and the ACP/UCP feed's is_eligible_checkout gate so
// the two can never disagree. Pure + deterministic.
//
// Two independent capabilities:
//   - DISCOVERY: a published listing is in the ChatGPT (ACP) + Google (UCP) feeds.
//     Free for every plan — the growth wedge.
//   - CHECKOUT: buyers transact through the agent on every plan when the owner has a
//     charge-ready Stripe Connect account and the program is switched on.

export type AgenticDiscoveryState = 'live' | 'unpublished'

/** The two shopping surfaces, each gated by its OWN program flag (they enroll with
 *  OpenAI and Google independently and go live at different times). */
export type AgenticSurface = 'chatgpt' | 'google'

/** Why checkout is / isn't live, in the merchant-actionable order the card surfaces. */
export type AgenticCheckoutState =
  | 'live' // transacting through at least one surface now (see liveSurfaces)
  | 'needs_payouts' // connect Stripe payouts (their action)
  | 'enrolling' // ready; Nexez is switching the programs on (owner-blocked, neither live yet)
  | 'unpublished' // listing isn't published, so nothing is live

export type AgenticCommerceStatus = {
  discovery: AgenticDiscoveryState
  checkout: AgenticCheckoutState
  /** The real gate: true only when this listing can transact through an agent right now
   * on at least one surface. */
  checkoutEligible: boolean
  /** Exactly which surfaces are live right now — so the card names only what's true and
   * never claims Google when only ChatGPT is on (or vice-versa). Empty unless checkout is 'live'. */
  liveSurfaces: AgenticSurface[]
}

export type AgenticCommerceInputs = {
  /** Listing is published (and therefore in the ACP/UCP feeds). */
  published: boolean
  /** Compatibility field; agentic checkout is included on every plan. */
  planAllowsCheckout: boolean
  /** Seller's Stripe Connect account can accept a charge (charges_enabled). */
  connectReady: boolean
  /** ACP (ChatGPT Instant Checkout) program is switched on. */
  chatgptLive: boolean
  /** UCP (Google) program is switched on. */
  googleLive: boolean
}

/** Resolve a listing's agentic-commerce status from the gating inputs. */
export function agenticCommerceStatus(input: AgenticCommerceInputs): AgenticCommerceStatus {
  if (!input.published) {
    return { discovery: 'unpublished', checkout: 'unpublished', checkoutEligible: false, liveSurfaces: [] }
  }
  const anyProgramLive = input.chatgptLive || input.googleLive
  // Precedence is the merchant's next action: connect payouts → wait for the
  // programs. All operational gates satisfied → live.
  let checkout: AgenticCheckoutState
  if (!input.connectReady) checkout = 'needs_payouts'
  else if (!anyProgramLive) checkout = 'enrolling'
  else checkout = 'live'

  const liveSurfaces: AgenticSurface[] = []
  if (checkout === 'live') {
    if (input.chatgptLive) liveSurfaces.push('chatgpt')
    if (input.googleLive) liveSurfaces.push('google')
  }

  return { discovery: 'live', checkout, checkoutEligible: checkout === 'live', liveSurfaces }
}
