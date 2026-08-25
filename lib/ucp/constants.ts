// Shared constants for the Google Universal Commerce Protocol (UCP) adapter.
//
// UCP powers agentic checkout on Google's AI Mode / Gemini; AP2 (Agent Payments
// Protocol) is the payment-authorization layer beneath it. The merchant stays
// Merchant-of-Record; Google never touches settlement. v1 settles the Google Pay
// token through the shared SF2 bridge (Connect direct charge + application fee),
// exactly like ACP's Shared Payment Token.

export const UCP_SESSION_SCHEMA_VERSION = 'ucp.checkout-session.v1'
export const UCP_FEED_SCHEMA_VERSION = 'ucp.product-feed.v1'

/** UCP requires terms + privacy links on the session. Platform-level URLs (Nexez is
 * the checkout facilitator) on the marketing host. */
export const UCP_TERMS_URL = 'https://nexez.ai/terms'
export const UCP_PRIVACY_URL = 'https://nexez.ai/privacy'

/** The unique Google Pay handler instance id declared in Nexez's UCP profile and
 * checkout responses. UCP requires every selected instrument to point back to this
 * exact id. Checkout remains unavailable until enrollment supplies the declaration. */
export function ucpGooglePayHandlerId(): string | null {
  return process.env.UCP_GOOGLE_PAY_HANDLER_ID?.trim() || null
}

/** UCP checkout is a Google-APPROVED program (Merchant Center + UCP waitlist) and the
 * AP2 mandate verification needs Google's signing keys - both owner-blocked. Until
 * enrollment lands, the checkout endpoints are dormant (fail-closed) and the feed
 * advertises search but not checkout eligibility. */
export function ucpCheckoutEnabled(): boolean {
  return process.env.UCP_CHECKOUT_ENABLED === 'true'
}
