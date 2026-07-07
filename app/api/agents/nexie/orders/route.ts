import { NextResponse, type NextRequest } from 'next/server'
import { authenticateNexieRequest } from '../../../../../lib/agents/nexie-auth'
import { findOrdersByEmail } from '../../../../../lib/server/load-order'
import { enforceRateLimit } from '../../../../../lib/rate-limit'

export const maxDuration = 30

/**
 * GET /api/agents/nexie/orders - the authenticated buyer's order history.
 *
 * Returns the buyer's direct-checkout orders + negotiations (newest first), each with
 * its own portal token so the app can deep-link into the full status/recourse view.
 *
 * The lookup key is the buyer's account email: findOrdersByEmail matches buyer_email
 * case-insensitively, and Nexie purchases stamp that same email at checkout
 * (executeBooking → buyerEmail → Stripe customer_email → webhook → checkout_orders).
 * Because the linkage is by email, we require a CONFIRMED email before returning
 * anything - otherwise someone could register an unconfirmed account on a victim's
 * address and read their orders.
 */
export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexie:orders', 30, 60_000)
  if (limited) return limited

  const auth = await authenticateNexieRequest(request)
  if (!auth.ok) return auth.response

  const { email, email_confirmed_at } = auth.user
  if (!email || !email_confirmed_at) {
    // No confirmed email → nothing safe to match on. Return empty (don't leak existence).
    return NextResponse.json({ ok: true, orders: [] })
  }

  try {
    const orders = await findOrdersByEmail(email)
    return NextResponse.json({ ok: true, orders })
  } catch (error) {
    console.error('[Nexie] orders lookup failed', error)
    return NextResponse.json(
      {
        error: 'Could not load your orders right now.',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
