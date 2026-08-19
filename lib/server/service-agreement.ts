import 'server-only'
import type Stripe from 'stripe'
import { actionRequestHash } from '../action-approval'
import {
  bearerTokenColumns,
  canEncryptBearerTokens,
  hashBearerToken,
  mintBearerToken,
} from './bearer-token'
import type { RecurringServiceAgreementSnapshot } from '../recurring-service'

export const STRIPE_SERVICE_AGREEMENT_KIND = 'service_agreement' as const

export type IdempotentServiceAgreement = {
  id: string
  status: string
  contractFingerprint: string
  stripeCheckoutSessionId: string | null
  stripeConnectAccountId: string
}

export function recurringAgreementFingerprint(snapshot: RecurringServiceAgreementSnapshot): string {
  return actionRequestHash(snapshot)
}

export function serviceAgreementStripeMetadata(input: {
  agreementId: string
  contractFingerprint: string
  ownerId: string
  pageId?: string | null
  offerKey: string
}): Record<string, string> {
  return {
    nexez_kind: STRIPE_SERVICE_AGREEMENT_KIND,
    nexez_service_agreement_id: input.agreementId,
    nexez_service_agreement_fingerprint: input.contractFingerprint,
    nexez_owner_id: input.ownerId,
    ...(input.pageId ? { nexez_page_id: input.pageId } : {}),
    nexez_offer_key: input.offerKey,
  }
}

export async function findIdempotentServiceAgreement(input: {
  admin: { from: (table: string) => any }
  ownerId: string
  requestIdempotencyKey: string | null | undefined
}): Promise<IdempotentServiceAgreement | null> {
  if (!input.requestIdempotencyKey) return null
  const { data } = await input.admin
    .from('service_agreements')
    .select('id, status, contract_fingerprint, stripe_checkout_session_id, stripe_connect_account_id')
    .eq('owner_id', input.ownerId)
    .eq('request_idempotency_key', input.requestIdempotencyKey)
    .maybeSingle<{
      id: string
      status: string
      contract_fingerprint: string
      stripe_checkout_session_id: string | null
      stripe_connect_account_id: string
    }>()
  if (!data) return null
  return {
    id: data.id,
    status: data.status,
    contractFingerprint: data.contract_fingerprint,
    stripeCheckoutSessionId: data.stripe_checkout_session_id,
    stripeConnectAccountId: data.stripe_connect_account_id,
  }
}

export async function createPendingServiceAgreement(input: {
  admin: { from: (table: string) => any }
  id: string
  ownerId: string
  pageId?: string | null
  slug?: string | null
  offerKey: string
  offerName: string
  connectAccountId: string
  snapshot: RecurringServiceAgreementSnapshot
  contractFingerprint: string
  requestIdempotencyKey?: string | null
  commissionBps?: number | null
  planId?: string | null
  commissionSource?: string | null
  buyerEmail?: string | null
  buyerName?: string | null
  buyerReference?: string | null
  buyerAgent?: string | null
}): Promise<{ ok: true; accessToken: string } | { ok: false; error: string; conflict?: boolean }> {
  if (!canEncryptBearerTokens()) {
    return {
      ok: false,
      error: 'Recurring service checkout requires INTEGRATION_SECRET_KEY so the buyer management credential can be recovered after payment.',
    }
  }
  const accessToken = mintBearerToken()
  const tokenColumns = bearerTokenColumns(accessToken, 'access_token')
  if (!tokenColumns.access_token_encrypted) {
    return { ok: false, error: 'Could not encrypt the recurring agreement management credential.' }
  }
  const { error } = await input.admin.from('service_agreements').insert({
    id: input.id,
    owner_id: input.ownerId,
    page_id: input.pageId ?? null,
    slug: input.slug ?? null,
    offer_key: input.offerKey,
    offer_name: input.offerName,
    status: 'pending',
    contract_snapshot: input.snapshot,
    contract_fingerprint: input.contractFingerprint,
    amount_per_period_cents: input.snapshot.amountPerPeriod,
    currency: input.snapshot.currency,
    stripe_connect_account_id: input.connectAccountId,
    request_idempotency_key: input.requestIdempotencyKey ?? null,
    commission_bps: input.commissionBps ?? null,
    plan_id_at_purchase: input.planId ?? null,
    commission_source: input.commissionSource ?? null,
    buyer_email: input.buyerEmail ?? null,
    buyer_name: input.buyerName ?? null,
    buyer_reference: input.buyerReference ?? null,
    buyer_agent: input.buyerAgent ?? null,
    ...tokenColumns,
  })
  return error
    ? { ok: false, error: error.message, conflict: error.code === '23505' }
    : { ok: true, accessToken }
}

export async function attachServiceAgreementCheckoutSession(input: {
  admin: { from: (table: string) => any }
  agreementId: string
  stripeSessionId: string
  livemode?: boolean | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await input.admin
    .from('service_agreements')
    .update({
      stripe_checkout_session_id: input.stripeSessionId,
      ...(input.livemode != null ? { stripe_livemode: input.livemode } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.agreementId)
    .eq('status', 'pending')
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function deletePendingServiceAgreement(
  admin: { from: (table: string) => any },
  agreementId: string,
): Promise<void> {
  await admin.from('service_agreements').delete().eq('id', agreementId).eq('status', 'pending')
}

export function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const modern = (invoice as any).parent?.subscription_details?.subscription
  if (typeof modern === 'string') return modern
  if (modern?.id) return modern.id
  const legacy = (invoice as any).subscription
  if (typeof legacy === 'string') return legacy
  return legacy?.id ?? null
}

export function subscriptionMetadataFromInvoice(invoice: Stripe.Invoice): Record<string, string> {
  const modern = (invoice as any).parent?.subscription_details?.metadata
  if (modern && typeof modern === 'object') return modern as Record<string, string>
  return {}
}

export function paidInvoicePaymentIds(invoice: Stripe.Invoice): { paymentIntentId: string | null; chargeId: string | null } {
  const payments = ((invoice as any).payments?.data ?? []) as Array<any>
  const paid = payments.find((entry) => entry?.status === 'paid')
  const payment = paid?.payment
  return {
    paymentIntentId: typeof payment?.payment_intent === 'string' ? payment.payment_intent : payment?.payment_intent?.id ?? null,
    chargeId: typeof payment?.charge === 'string' ? payment.charge : payment?.charge?.id ?? null,
  }
}

export function subscriptionServicePeriod(invoice: Stripe.Invoice): { start: string | null; end: string | null } {
  const lines = ((invoice as any).lines?.data ?? []) as Array<any>
  const recurring = lines.find((line) => line?.parent?.type === 'subscription_item_details') ?? lines[0]
  const start = typeof recurring?.period?.start === 'number' ? new Date(recurring.period.start * 1000).toISOString() : null
  const end = typeof recurring?.period?.end === 'number' ? new Date(recurring.period.end * 1000).toISOString() : null
  return { start, end }
}

export function agreementStatusFromSubscription(subscription: Stripe.Subscription): {
  status: 'active' | 'past_due' | 'canceling' | 'canceled'
  cancelAtPeriodEnd: boolean
  periodStart: string | null
  periodEnd: string | null
  canceledAt: string | null
} {
  const raw = subscription.status
  const canceled = raw === 'canceled'
  const pastDue = raw === 'past_due' || raw === 'unpaid' || raw === 'incomplete' || raw === 'incomplete_expired'
  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end)
  const item = subscription.items.data[0] as any
  const periodStart = typeof item?.current_period_start === 'number' ? new Date(item.current_period_start * 1000).toISOString() : null
  const periodEnd = typeof item?.current_period_end === 'number' ? new Date(item.current_period_end * 1000).toISOString() : null
  const canceledAtSeconds = (subscription as any).canceled_at
  return {
    status: canceled ? 'canceled' : pastDue ? 'past_due' : cancelAtPeriodEnd ? 'canceling' : 'active',
    cancelAtPeriodEnd,
    periodStart,
    periodEnd,
    canceledAt: typeof canceledAtSeconds === 'number' ? new Date(canceledAtSeconds * 1000).toISOString() : null,
  }
}

export function validAgreementAccessToken(token: string | null | undefined): string | null {
  const clean = (token ?? '').trim()
  if (!/^[a-f0-9]{64}$/.test(clean)) return null
  return hashBearerToken(clean)
}
