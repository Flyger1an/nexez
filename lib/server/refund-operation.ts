import 'server-only'
import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { createAdminClient } from '../../utils/supabase/admin'
import { toStripeAmount } from '../currency'
import { refundIdempotencyKey } from '../refunds'
import { settledRefundCharge } from './settled-refund-charge'

type RefundOperation = {
  id: string
  state: 'reserved' | 'submitted' | 'succeeded' | 'failed'
  amount_cents: number
  captured_cents: number
  currency: string
  payment_intent_id: string
  stripe_account: string | null
  provider_refund_id: string | null
  created_at: string
  order_status: string
  refunded_cents: number
}

export function validRefundOperationId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

/** Reserve once in Postgres, reuse one provider key, then reconcile the charge. */
export async function executeRefund(input: {
  operationId: string
  ownerId: string
  kind: 'order' | 'negotiation'
  targetId: string
  currency: string
  amount?: number
}) {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('nz_begin_refund', {
    p_operation_id: input.operationId,
    p_owner_id: input.ownerId,
    p_kind: input.kind,
    p_target_id: input.targetId,
    p_requested_cents: input.amount == null ? null : toStripeAmount(input.amount, input.currency),
    p_currency: input.currency.toLowerCase(),
  })
  if (error || !data) {
    const conflict = ['P0001', '22023', '23505', '42501'].includes(error?.code ?? '')
    return NextResponse.json({ error: conflict ? error!.message : 'Refund persistence is unavailable. Retry the same operation.' }, { status: conflict ? 409 : 503 })
  }
  const operation = data as RefundOperation
  if (operation.state === 'succeeded') {
    return NextResponse.json({ ok: true, status: operation.order_status,
      refundId: operation.provider_refund_id, refundedCents: operation.refunded_cents,
      fully: operation.refunded_cents >= operation.captured_cents, operationId: operation.id })
  }
  if (operation.state === 'failed') {
    return NextResponse.json({ error: 'Stripe rejected this refund. Review the failure before approving a new refund.', code: 'refund_failed' }, { status: 409 })
  }
  // Stripe only guarantees retaining keys for 24 hours. An unresolved operation
  // without a recorded refund ID must be investigated after that window, never
  // blindly resubmitted with an expired key.
  if (!operation.provider_refund_id && Date.now() - Date.parse(operation.created_at) >= 23 * 60 * 60 * 1000) {
    return NextResponse.json({ error: 'This refund needs provider reconciliation before another attempt.', code: 'refund_reconciliation_required' }, { status: 409 })
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  const options: Stripe.RequestOptions = operation.stripe_account ? { stripeAccount: operation.stripe_account } : {}
  try {
    const refund = operation.provider_refund_id
      ? await stripe.refunds.retrieve(operation.provider_refund_id, {}, options)
      : await stripe.refunds.create({
          payment_intent: operation.payment_intent_id,
          amount: operation.amount_cents,
          refund_application_fee: true,
          metadata: { nexez_refund_operation: operation.id },
        }, { ...options, idempotencyKey: refundIdempotencyKey(operation.id) })
    if (refund.amount !== operation.amount_cents || refund.currency !== operation.currency) {
      throw new Error('Provider refund does not match the reserved amount and currency.')
    }
    const { error: recordError } = await admin.rpc('nz_record_refund', {
      p_operation_id: operation.id, p_refund_id: refund.id,
      p_provider_status: refund.status ?? 'pending', p_amount_cents: refund.amount,
    })
    if (recordError) throw new Error('Could not record the provider refund.', { cause: recordError })
    if (refund.status === 'failed' || refund.status === 'canceled') {
      return NextResponse.json({ error: 'Stripe rejected this refund. Review the failure before approving a new refund.',
        code: 'refund_failed', refundId: refund.id, operationId: operation.id }, { status: 409 })
    }
    if (refund.status !== 'succeeded') {
      return NextResponse.json({ error: 'The refund has not settled. Retry this operation to check its outcome.',
        code: 'refund_pending', refundId: refund.id, operationId: operation.id }, { status: 503 })
    }
    const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge?.id
    if (!chargeId) throw new Error('Provider refund has no charge to reconcile.')
    const charge = await settledRefundCharge(stripe, chargeId, options)
    const paymentIntent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
    if (paymentIntent !== operation.payment_intent_id || charge.currency !== operation.currency || charge.amount !== operation.captured_cents) {
      throw new Error('Provider charge does not match the reserved payment.')
    }
    const { data: result, error: completionError } = await admin.rpc('nz_complete_refund', {
      p_operation_id: operation.id, p_provider_total: charge.amount_refunded,
    })
    if (completionError || !result) throw new Error('Refund ledger reconciliation is pending.', { cause: completionError })
    return NextResponse.json(result)
  } catch (error) {
    console.warn('[Refund] operation requires retry', operation.id, error instanceof Error ? error.message : 'Unknown failure')
    return NextResponse.json({ error: 'Could not confirm the refund outcome. Retry the same refund to reconcile it safely.',
      code: 'refund_reconciliation_pending', operationId: operation.id }, { status: 503 })
  }
}
