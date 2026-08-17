import { enforceRateLimit } from '../../../../../../lib/rate-limit'
import { getBaseUrl } from '../../../../../../lib/agent-page'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../../../utils/supabase/admin'
import {
  updateSession,
  markSessionCompleted,
  isSessionPayable,
  checkApprovalDrift,
} from '../../../../../../lib/commerce/checkout-session-core'
import {
  resolveSettlementContext,
  settleSessionToPaymentIntent,
} from '../../../../../../lib/commerce/settlement-bridge'
import {
  loadSessionRow,
  updateSessionSnapshot,
  rowToSession,
  isSessionExpired,
  markSessionExpired,
} from '../../../../../../lib/server/checkout-session-store'
import { persistCommerceOrder } from '../../../../../../lib/server/commerce-order'
import { verifyUcpRequest } from '../../../../../../lib/ucp/auth'
import { parseUcpBuyer, parseUcpPaymentToken, toUcpCheckoutSession, ucpError, type UcpOrderRef } from '../../../../../../lib/ucp/wire'
import { ucpJson, loadUcpPage, loadUcpPageName } from '../../../../../../lib/server/ucp-session'

/**
 * UCP: POST /api/ucp/checkout-sessions/{id}/complete — settle the session.
 * Validates the Google Pay token, re-prices against the live page, charges it via the
 * shared SF2 settlement bridge (direct charge on the seller's connected account +
 * platform fee — same money core as ACP), marks the session completed, persists the
 * durable order, returns the session with an order{ id,label,permalink_url }.
 * Idempotent: a replayed complete returns the original order without charging again.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(request, 'ucp-session', 60, 60_000, { failClosed: true })
  if (limited) return limited
  const { id } = await ctx.params

  const raw = await request.text()
  const auth = verifyUcpRequest(request, raw)
  if (!auth.ok) return ucpJson(auth.error, auth.status)

  if (!hasSupabaseAdminEnv()) {
    return ucpJson(ucpError('unavailable', 'Checkout is temporarily unavailable.', undefined, 'processing_error'), 503)
  }
  const admin = createAdminClient()
  const row = await loadSessionRow(admin, id)
  if (!row || row.channel !== 'ucp') {
    return ucpJson(ucpError('not_found', 'No such checkout session.', undefined, 'not_found'), 404)
  }

  if (row.status === 'completed') {
    const name = (await loadUcpPageName(row.slug)) || row.slug
    const order = await existingOrderRef(admin, row.stripe_payment_intent_id)
    return ucpJson(toUcpCheckoutSession(rowToSession(row, name), order ? { order } : {}), 200)
  }
  if (row.status === 'canceled' || row.status === 'expired') {
    return ucpJson(ucpError('session_terminal', `Session is ${row.status} and cannot be completed.`, undefined, 'processing_error'), 409)
  }
  if (isSessionExpired(row)) {
    await markSessionExpired(admin, id)
    return ucpJson(ucpError('session_expired', 'This checkout session has expired.', undefined, 'processing_error'), 409)
  }

  let body: { buyer?: unknown; contact?: unknown; billing_address?: unknown; payment?: unknown }
  try {
    body = JSON.parse(raw || '{}')
  } catch {
    return ucpJson(ucpError('invalid_json', 'Request body must be valid JSON.'), 400)
  }

  const paymentToken = parseUcpPaymentToken(body.payment)
  if (!paymentToken) {
    return ucpJson(ucpError('missing_payment', 'payment with a Google Pay credential is required.', 'payment'), 400)
  }

  const page = await loadUcpPage(row.slug)
  if (!page) {
    return ucpJson(ucpError('merchant_not_found', 'This merchant is no longer available.', undefined, 'not_found'), 404)
  }

  const buyer = parseUcpBuyer(body)
  const session = updateSession(rowToSession(row, page.name), { page, buyer: buyer ?? undefined })
  if (!isSessionPayable(session)) {
    await updateSessionSnapshot(admin, id, session)
    return ucpJson(toUcpCheckoutSession(session), 409)
  }

  // Settle only against what the buyer authorized. The re-price above reflects live
  // offers, so a merchant price edit between quote and completion lands here as an
  // increase and is refused rather than charged. Google Pay tokens carry no allowance
  // ceiling we can lean on, so this check is the only thing standing between a
  // mid-flight price edit and the buyer's card.
  const drift = checkApprovalDrift(session)
  if (!drift.ok) {
    await updateSessionSnapshot(admin, id, session)
    return ucpJson(ucpError(drift.code, drift.message), 409)
  }

  const context = await resolveSettlementContext(admin, {
    pageId: page.id,
    ownerId: page.owner_id ?? null,
    metadata: { nexez_source: 'ucp' },
    idempotencyKey: `ucp_settle_${session.id}`,
  })
  if (!context.ok) {
    return ucpJson(ucpError(context.code, context.message, undefined, 'processing_error'), context.code === 'paused' ? 409 : 402)
  }

  const settled = await settleSessionToPaymentIntent(session, { token: paymentToken, kind: 'google_pay' }, context.context)
  if (!settled.ok) {
    // Not a decline: the credential itself is one we cannot charge. 400 so the agent
    // retries with a different instrument instead of re-presenting the same one.
    if (settled.code === 'unsupported_credential') {
      return ucpJson(ucpError(settled.code, settled.message, 'payment'), 400)
    }
    const status = settled.code === 'not_ready' || settled.code === 'zero_amount' ? 409 : 402
    return ucpJson(ucpError(settled.code, settled.message, undefined, 'processing_error'), status)
  }

  const completed = markSessionCompleted(session)
  await updateSessionSnapshot(admin, id, completed, {
    stripePaymentIntentId: settled.paymentIntentId,
    stripeLivemode: settled.livemode,
  })
  const accessToken = await persistCommerceOrder(admin, {
    channel: 'ucp',
    ownerId: context.context.ownerId ?? '',
    pageId: page.id,
    slug: row.slug,
    offerName: completed.lineItems.map((li) => li.name).join(', '),
    offerKey: completed.lineItems.map((li) => li.offerKey).join(','),
    paymentIntentId: settled.paymentIntentId,
    connectAccountId: context.context.connectAccountId,
    amountCents: settled.amount,
    currency: settled.currency,
    applicationFeeCents: settled.applicationFee,
    commissionPercent: context.context.commissionPercent,
    livemode: settled.livemode,
    buyer: completed.buyer,
  })

  const order: UcpOrderRef = {
    id: settled.paymentIntentId,
    label: `Order ${settled.paymentIntentId}`,
    permalink_url: accessToken ? `${getBaseUrl()}/orders/${accessToken}` : `${getBaseUrl()}/orders`,
    status: 'completed',
  }
  return ucpJson(toUcpCheckoutSession(completed, { order }), 200)
}

async function existingOrderRef(
  admin: ReturnType<typeof createAdminClient>,
  paymentIntentId: string | null,
): Promise<UcpOrderRef | null> {
  if (!paymentIntentId) return null
  const { data } = await admin
    .from('checkout_orders')
    .select('access_token')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle<{ access_token: string | null }>()
  return {
    id: paymentIntentId,
    label: `Order ${paymentIntentId}`,
    permalink_url: data?.access_token ? `${getBaseUrl()}/orders/${data.access_token}` : `${getBaseUrl()}/orders`,
    status: 'completed',
  }
}
