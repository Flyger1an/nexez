// Shared constants for the OpenAI Agentic Commerce Protocol (ACP) adapter.
//
// The spec is young and moving (spec dir 2026-04-17, maintained by OpenAI + Stripe).
// We pin the API-Version we implement and echo it back on every endpoint via the
// `API-Version` response header so a client can detect drift. Date-based per the
// spec's own header convention.

export const ACP_API_VERSION = '2025-09-12'

export const ACP_FEED_SCHEMA_VERSION = 'acp.product-feed.v1'

/** ACP checkout is an OpenAI-APPROVED partner program (not self-serve) and charging
 * a Shared Payment Token requires Stripe SPT enablement - both owner-blocked. Until
 * enrollment lands, the feed advertises search-eligibility but NOT checkout-
 * eligibility. Flip via env once the partner + Stripe SPT wiring is live. */
export function acpCheckoutEnabled(): boolean {
  return process.env.ACP_CHECKOUT_ENABLED === 'true'
}
