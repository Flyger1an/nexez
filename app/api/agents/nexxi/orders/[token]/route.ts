import { NextResponse, type NextRequest } from 'next/server'
import { authenticateNexxiRequest } from '../../../../../../lib/agents/nexxi-auth'
import { enforceRateLimit } from '../../../../../../lib/rate-limit'
import { loadOrderByToken } from '../../../../../../lib/server/load-order'
import {
  buildOrderTimeline,
  canRequestRefund,
  describeOrderStatus,
  REQUEST_KIND_LABEL,
  REQUEST_STATUS_LABEL,
} from '../../../../../../lib/buyer-portal'

export const maxDuration = 30

/**
 * GET /api/agents/nexxi/orders/[token] - full receipt/detail for ONE of the buyer's orders.
 *
 * The portal token alone is the credential for the anonymous WEB portal, but this AUTHED app endpoint
 * additionally BINDS the order to the caller's account: it requires a confirmed email and only returns
 * the order when its buyer_email matches (case-insensitive). That mirrors the orders LIST (email-scoped)
 * so a signed-in user can only read receipts for their own purchases - holding/guessing another buyer's
 * token isn't enough. Status copy + timeline + request labels are computed with the SAME server helpers
 * the web portal uses (one source of truth); the app just renders them.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await enforceRateLimit(request, 'agents:nexxi:order-detail', 60, 60_000)
  if (limited) return limited

  const auth = await authenticateNexxiRequest(request)
  if (!auth.ok) return auth.response

  const { email, email_confirmed_at } = auth.user
  const { token } = await params
  const clean = (token || '').trim()

  // No token, or no confirmed email to bind on → 404 (never leak existence).
  if (!clean || !email || !email_confirmed_at) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }

  try {
    const view = await loadOrderByToken(clean)
    // Account binding: the order must belong to THIS buyer's email. Fail closed on null/mismatch.
    if (!view || !view.buyerEmail || view.buyerEmail.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
    }

    const desc = describeOrderStatus(view.kind, view.status)
    return NextResponse.json({
      ok: true,
      order: {
        kind: view.kind,
        token: view.token,
        reference: view.reference,
        offerName: view.offerName,
        amountCents: view.amountCents,
        currency: view.currency,
        status: view.status,
        statusLabel: desc.label,
        statusTone: desc.tone,
        statusDescription: desc.description,
        sellerName: view.sellerName,
        slug: view.slug,
        createdAt: view.createdAt,
        timeline: buildOrderTimeline(view),
        requests: view.requests.map((r) => ({
          id: r.id,
          kind: r.kind,
          kindLabel: REQUEST_KIND_LABEL[r.kind] ?? r.kind,
          status: r.status,
          statusLabel: REQUEST_STATUS_LABEL[r.status] ?? r.status,
          message: r.message,
          createdAt: r.createdAt,
        })),
        canRequestRefund: canRequestRefund(view),
        canReview: view.canReview,
      },
    })
  } catch (error) {
    console.error('[Nexxi] order detail failed', error)
    return NextResponse.json({ error: 'Could not load this order.' }, { status: 500 })
  }
}
