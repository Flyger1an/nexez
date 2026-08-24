import { NextResponse, after } from 'next/server'
import { resolveOrderForRequest } from '../../../../lib/server/load-order'
import { isRefundableStatus, type BuyerRequestKind } from '../../../../lib/buyer-portal'
import { formatCurrencyAmount } from '../../../../lib/currency'
import { buildBuyerRequestEmail, buildBuyerStatusEmail, hasEmailEnv, sendEmail } from '../../../../lib/email'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { getBaseUrl } from '../../../../lib/agent-page'
import { appUrl } from '../../../../lib/site'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { resolveOwnerNotifyEmail } from '../../../../lib/server/owner-email'

/**
 * Buyer recourse from the order portal: file a refund request or a problem report.
 * The buyer's portal token IS the authorization (resolveOrderForRequest gates on it
 * with the service-role client). This NEVER moves money - it records an
 * `order_requests` row + notifies the seller, who refunds/responds from Finance.
 *
 * Namespaced under /api/order-portal (NOT /api/orders) so it stays on the agent
 * runtime; the owner refund action /api/orders/refund stays on the app host.
 */
const KINDS: BuyerRequestKind[] = ['refund_request', 'problem_report']
const MAX_MESSAGE = 2000
// Lifetime cap per (order, kind) so a buyer can't re-file endlessly after the seller
// resolves/declines and re-spam the seller. A handful covers a legitimate back-and-forth.
const MAX_PER_KIND = 5

export async function POST(request: Request) {
  // Anonymous + money-adjacent → tight limit. The token is unguessable, so this also
  // throttles brute-forcing tokens.
  const limited = await enforceRateLimit(request, 'order-portal-request', 8, 60_000)
  if (limited) return limited

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Order management is not available on this deployment.' }, { status: 503 })
  }

  const body = (await request.json().catch(() => ({}))) as { token?: string; kind?: string; message?: string }
  const token = String(body.token || '').trim()
  const kind = String(body.kind || '').trim() as BuyerRequestKind
  const message = String(body.message || '').trim().slice(0, MAX_MESSAGE)

  if (!token) return NextResponse.json({ error: 'Missing order token.' }, { status: 400 })
  if (!KINDS.includes(kind)) return NextResponse.json({ error: 'Unknown request type.' }, { status: 400 })
  if (kind === 'problem_report' && !message) {
    return NextResponse.json({ error: 'Please describe the problem.' }, { status: 400 })
  }

  const target = await resolveOrderForRequest(token)
  if (!target) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (!target.ownerId) {
    return NextResponse.json({ error: 'This order can’t accept requests yet.' }, { status: 409 })
  }
  if (kind === 'refund_request' && !isRefundableStatus(target.status)) {
    return NextResponse.json({ error: 'This order isn’t eligible for a refund request.' }, { status: 409 })
  }
  if (target.openRequestKinds.includes(kind)) {
    return NextResponse.json(
      { error: kind === 'refund_request' ? 'You already have a refund request pending.' : 'You already reported a problem on this order.' },
      { status: 409 },
    )
  }
  if ((target.requestTotals[kind] || 0) >= MAX_PER_KIND) {
    return NextResponse.json(
      { error: 'You’ve reached the request limit for this order. Please contact the seller directly.' },
      { status: 429 },
    )
  }

  const admin = createAdminClient()
  const { error } = await admin.from('order_requests').insert({
    order_kind: target.kind,
    order_id: target.orderId,
    owner_id: target.ownerId,
    page_id: target.pageId,
    slug: target.slug,
    buyer_email: target.buyerEmail,
    kind,
    message: message || null,
  })
  if (error) {
    // The partial unique index (one live request per order+kind) makes the dedup
    // atomic - a racing duplicate surfaces as 23505; treat it as the same 409.
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'You already have a request pending on this order.' }, { status: 409 })
    }
    console.warn('[order-portal] request insert failed:', error.message)
    return NextResponse.json({ error: 'Could not file your request - please try again.' }, { status: 500 })
  }

  const amount = target.amountCents != null ? formatCurrencyAmount(target.amountCents, target.currency) : null
  const businessName = target.sellerName || target.slug || 'the seller'

  // Notify the seller (drives them to Finance to refund/respond) + acknowledge to the
  // buyer. Both via after() so neither blocks/​fails the response.
  if (hasEmailEnv()) {
    const buyerEmail = target.buyerEmail
    after(async () => {
      const sellerEmail = await resolveOwnerNotifyEmail({
        ownerId: target.ownerId,
        contactEmail: target.sellerEmail,
      })
      if (sellerEmail) {
        const mail = await buildBuyerRequestEmail({
          kind,
          businessName,
          offerName: target.offerName || 'an order',
          amount,
          message: message || null,
          buyerEmail,
          // /dashboard/* lives on the APP host - use appUrl, not getBaseUrl (runtime host).
          inboxUrl: appUrl('/dashboard/finance'),
        })
        await sendEmail({ to: sellerEmail, subject: mail.subject, html: mail.html, text: mail.text })
      }
      if (buyerEmail) {
        const mail = await buildBuyerStatusEmail({
          kind: 'request_received',
          businessName,
          offerName: target.offerName || 'your order',
          amount,
          detail: kind === 'refund_request' ? 'Refund requested' : 'Problem reported',
          manageUrl: `${getBaseUrl()}/orders/${token}`,
        })
        await sendEmail({ to: buyerEmail, subject: mail.subject, html: mail.html, text: mail.text })
      }
    })
  }

  return NextResponse.json({ ok: true, kind })
}
