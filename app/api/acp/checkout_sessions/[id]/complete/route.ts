import { enforceRateLimit } from '../../../../../../lib/rate-limit'
import { getBaseUrl } from '../../../../../../lib/agent-page'
import { recoverBearerToken } from '../../../../../../lib/server/bearer-token'
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
import { verifyAcpRequest } from '../../../../../../lib/acp/auth'
import { ACP_API_VERSION } from '../../../../../../lib/acp/constants'
import { parseAcpBuyer, parseAcpPaymentToken, toAcpCheckoutSession, acpError, type AcpOrderRef } from '../../../../../../lib/acp/wire'
import { acpJson, loadAcpPage, loadAcpPageName } from '../../../../../../lib/server/acp-session'

/**
 * ACP: POST /api/acp/checkout_sessions/{id}/complete — settle the session.
 * Validates the delegated payment credential, re-prices against the live page,
 * charges it via the shared SF2 settlement bridge (direct charge on the seller's
 * connected account + platform fee), marks the session completed, persists the
 * durable order, and returns CheckoutSessionWithOrder. Idempotent: a replayed
 * complete returns the original order without charging again.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(request, 'acp-session', 60, 60_000, { failClosed: true })
  if (limited) return limited
  const { id } = await ctx.params

  const raw = await request.text()
  const auth = verifyAcpRequest(request, raw)
  if (!auth.ok) return acpJson(auth.error, auth.status, ACP_API_VERSION)
  const apiVersion = auth.apiVersion

  if (!hasSupabaseAdminEnv()) {
    return acpJson(acpError('unavailable', 'Checkout is temporarily unavailable.', undefined, 'processing_error'), 503, apiVersion)
  }
  const admin = createAdminClient()
  const row = await loadSessionRow(admin, id)
  if (!row || row.channel !== 'acp') {
    return acpJson(acpError('not_found', 'No such checkout session.', undefined, 'not_found'), 404, apiVersion)
  }

  // Idempotent replay: an already-completed session returns its existing order,
  // never a second charge.
  if (row.status === 'completed') {
    const name = (await loadAcpPageName(row.slug)) || row.slug
    const order = await existingOrderRef(admin, row.id, row.stripe_payment_intent_id)
    return acpJson(toAcpCheckoutSession(rowToSession(row, name), order ? { order } : {}), 200, apiVersion)
  }
  if (row.status === 'canceled' || row.status === 'expired') {
    return acpJson(acpError('session_terminal', `Session is ${row.status} and cannot be completed.`, undefined, 'processing_error'), 409, apiVersion)
  }
  if (isSessionExpired(row)) {
    await markSessionExpired(admin, id)
    return acpJson(acpError('session_expired', 'This checkout session has expired.', undefined, 'processing_error'), 409, apiVersion)
  }

  let body: { buyer?: unknown; payment_data?: unknown }
  try {
    body = JSON.parse(raw || '{}')
  } catch {
    return acpJson(acpError('invalid_json', 'Request body must be valid JSON.'), 400, apiVersion)
  }

  const paymentToken = parseAcpPaymentToken(body.payment_data)
  if (!paymentToken) {
    return acpJson(acpError('missing_payment', 'payment_data with a payment credential is required.', '$.payment_data'), 400, apiVersion)
  }

  const page = await loadAcpPage(row.slug)
  if (!page) {
    return acpJson(acpError('merchant_not_found', 'This merchant is no longer available.', undefined, 'not_found'), 404, apiVersion)
  }

  // Re-price against live offers + fold in the (required) buyer. A drift (sold-out /
  // unpriced since create) flips the session off ready → refuse to charge.
  const buyer = parseAcpBuyer(body.buyer)
  const session = updateSession(rowToSession(row, page.name), { page, buyer: buyer ?? undefined })
  if (!isSessionPayable(session)) {
    await updateSessionSnapshot(admin, id, session)
    return acpJson(toAcpCheckoutSession(session), 409, apiVersion)
  }

  // The re-price above can move the price under a buyer who already authorized a
  // number, so settle only against what was actually agreed to. This previously
  // charged the new amount, on the reasoning that the delegated token is amount-bound
  // by the PSP allowance and would reject an over-quote charge. That is a second
  // system's guarantee, it does not hold identically across protocols, and it cannot
  // hold at all while the settlement bridge still sends every credential kind as a
  // raw PaymentMethod. Refuse here, in our own code, and make the agent re-confirm.
  const drift = checkApprovalDrift(session)
  if (!drift.ok) {
    await updateSessionSnapshot(admin, id, session)
    return acpJson(acpError(drift.code, drift.message), 409, apiVersion)
  }

  // Resolve the seller's money context (pause/connect/commission) — one shared
  // resolver so this can't skip the gates — then charge via the SF2 bridge.
  const context = await resolveSettlementContext(admin, {
    pageId: page.id,
    ownerId: page.owner_id ?? null,
    metadata: { nexez_source: 'acp' },
    idempotencyKey: `acp_settle_${session.id}`,
  })
  if (!context.ok) {
    return acpJson(acpError(context.code, context.message, undefined, 'processing_error'), context.code === 'paused' ? 409 : 402, apiVersion)
  }

  const settled = await settleSessionToPaymentIntent(session, { token: paymentToken, kind: 'shared_payment_token' }, context.context)
  if (!settled.ok) {
    // A credential we cannot charge is the agent's request problem, not a decline:
    // 400/invalid_request tells it to retry with a different instrument, where
    // 402/processing_error would read as "the card failed" and invite a pointless retry.
    if (settled.code === 'unsupported_credential') {
      return acpJson(acpError(settled.code, settled.message, '$.payment_data'), 400, apiVersion)
    }
    const status = settled.code === 'not_ready' || settled.code === 'zero_amount' ? 409 : 402
    return acpJson(acpError(settled.code, settled.message, undefined, 'processing_error'), status, apiVersion)
  }

  // Charge captured: mark the session completed + link the PI, then persist the
  // durable order (the webhook reconciles the same row idempotently). If this snapshot
  // write transiently fails the money is safe — checkout_orders (below + the webhook)
  // is the money record, and a retried /complete self-heals via the same idempotency
  // key (same PI, no second charge).
  const completed = markSessionCompleted(session)
  await updateSessionSnapshot(admin, id, completed, {
    stripePaymentIntentId: settled.paymentIntentId,
    stripeLivemode: settled.livemode,
  })
  const accessToken = await persistCommerceOrder(admin, {
    channel: 'acp',
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

  const order: AcpOrderRef = {
    id: settled.paymentIntentId,
    checkout_session_id: completed.id,
    permalink_url: accessToken ? `${getBaseUrl()}/orders/${accessToken}` : `${getBaseUrl()}/orders`,
    status: 'confirmed',
  }
  return acpJson(toAcpCheckoutSession(completed, { order }), 200, apiVersion)
}

/** Reconstruct an order ref for an already-completed session from its PI's order row. */
async function existingOrderRef(
  admin: ReturnType<typeof createAdminClient>,
  sessionId: string,
  paymentIntentId: string | null,
): Promise<AcpOrderRef | null> {
  if (!paymentIntentId) return null
  const { data } = await admin
    .from('checkout_orders')
    .select('access_token_encrypted')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle<{ access_token_encrypted: string | null }>()
  // Plaintext is gone; the ciphertext is the only recoverable copy.
  const portalToken = recoverBearerToken({ encrypted: data?.access_token_encrypted })
  return {
    id: paymentIntentId,
    checkout_session_id: sessionId,
    permalink_url: portalToken ? `${getBaseUrl()}/orders/${portalToken}` : `${getBaseUrl()}/orders`,
    status: 'confirmed',
  }
}
