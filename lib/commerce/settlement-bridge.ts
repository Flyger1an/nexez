// Settlement bridge (SF2) - the ONE module that turns a resolved checkout session
// into a real charge. It is the only place in the commerce core allowed to import
// Stripe. Protocol adapters (ACP/UCP) call this and never touch Stripe directly, so
// the money core is not forked per protocol.
//
// Money model parity with the live direct-checkout route: the charge is a DIRECT
// charge on the seller's Stripe Connect account (owner is merchant of record) with
// the platform commission pulled as `application_fee_amount`. The difference from
// the direct route is the entry point: ACP/UCP hand over a DELEGATED payment
// credential (a Shared Payment Token / Google Pay token / - for proving the path -
// a Stripe test PaymentMethod), so we confirm a PaymentIntent server-side instead
// of redirecting the buyer to a hosted Checkout Session.
//
// The charge metadata is the exact key set the Stripe webhook already reads to
// persist a `checkout_orders` row (SF3 adds the payment_intent.succeeded branch that
// consumes it), so a settled session becomes a refundable/disputable order with no
// new persistence contract.

import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateApplicationFeeCents, getCommissionPercentForPlan } from '../stripe-billing'
import { getOwnerBillingState, getOwnerPlanId } from '../server/plan'
import { buyerMetadata } from '../buyer-identity'
import { toStripeDescription } from '../checkout'
import {
  CheckoutSession,
  DelegatedPayment,
  SettleCheckoutSession,
  SettlementContext,
  SettlementResult,
  isSessionPayable,
} from './checkout-session-core'

/** The minimal Stripe surface the bridge uses. Structural, so a test can inject a
 * fake without pulling in the SDK, and the real `new Stripe(key)` satisfies it. */
export type SettlementStripe = {
  paymentIntents: Pick<Stripe['paymentIntents'], 'create'>
}

// A PaymentIntent that reached one of these statuses is money we can book: either
// captured (`succeeded`) or authorized under manual capture (`requires_capture`).
// Anything else (requires_action/requires_payment_method/processing) can't complete
// a headless agent purchase and is surfaced as an error the adapter reports back.
const SETTLEABLE_STATUSES = new Set<Stripe.PaymentIntent.Status>(['succeeded', 'requires_capture'])

/** Stripe API version that exposes the shared-payment-token preview parameters. The
 * installed SDK (22.2.0) does not type `shared_payment_granted_token` at all, so the
 * ACP branch pins this per request and casts. Revisit when SPT leaves preview and the
 * SDK types it natively - at that point the cast should be deleted, not widened. */
const SHARED_PAYMENT_PREVIEW_VERSION = '2026-04-22.preview'

type CredentialParams =
  | { ok: true; params: Partial<Stripe.PaymentIntentCreateParams>; apiVersion?: string }
  | { ok: false; error: Extract<SettlementResult, { ok: false }> }

/**
 * Map a delegated credential onto the PaymentIntent parameter Stripe expects for it.
 *
 * - `payment_method`: a real Stripe PaymentMethod id. Charged directly, `off_session`
 *   because the cardholder is not in a browser session. This is the only branch that
 *   has ever settled successfully here, and only in test mode.
 * - `shared_payment_token`: ACP's Stripe-issued SPT. Per Stripe's docs this rides
 *   `payment_method_data[shared_payment_granted_token]`, NOT `payment_method` -
 *   Stripe clones the customer's underlying method and sets `payment_method` itself.
 *   `off_session` is deliberately omitted: the delegation IS the mandate, and the
 *   documented sample does not send it.
 * - `google_pay`: refused. UCP's Google Pay handler conveys an ECv2 payload whose
 *   concrete shape depends on gateway configuration this codebase does not have yet,
 *   and Stripe documents no server-side path that accepts a raw payload. Passing it
 *   as a PaymentMethod id (the old behavior) could never have worked; failing here
 *   turns a confusing Stripe 400 into a diagnosable refusal.
 */
function resolveCredentialParams(payment: DelegatedPayment): CredentialParams {
  switch (payment.kind) {
    case 'payment_method':
      return { ok: true, params: { payment_method: payment.token, off_session: true } }
    case 'shared_payment_token':
      return {
        ok: true,
        // Double cast through `unknown` on purpose: SDK 22.2.0 types
        // `payment_method_data` as requiring `type`, and knows nothing about the
        // preview-only `shared_payment_granted_token`. Narrowing this any further
        // would be pretending the SDK validates a param it has never heard of.
        params: {
          payment_method_data: { shared_payment_granted_token: payment.token },
        } as unknown as Partial<Stripe.PaymentIntentCreateParams>,
        apiVersion: SHARED_PAYMENT_PREVIEW_VERSION,
      }
    case 'google_pay':
      return {
        ok: false,
        error: {
          ok: false,
          code: 'unsupported_credential',
          message:
            'Google Pay credentials cannot be settled yet. This merchant has no Google Pay gateway configuration, so the credential cannot be converted into a chargeable payment method.',
        },
      }
    default:
      return {
        ok: false,
        error: {
          ok: false,
          code: 'unsupported_credential',
          message: `Unrecognized payment credential kind: ${String((payment as DelegatedPayment).kind)}.`,
        },
      }
  }
}

/** Build the injected form of the bridge. Production wires the real Stripe client;
 * tests wire a fake. Returns a `SettleCheckoutSession` implementation. */
export function createSettlementBridge(stripe: SettlementStripe): SettleCheckoutSession {
  return async function settle(session, payment, context): Promise<SettlementResult> {
    // Gate on the pure core's readiness - never charge a session with outstanding
    // issues or a zero total. The state machine is the single source of "payable".
    if (!isSessionPayable(session)) {
      return { ok: false, code: 'not_ready', message: `Session ${session.id} is ${session.status}; not ready for payment.` }
    }
    const amount = session.totals.total
    if (amount <= 0) {
      return { ok: false, code: 'zero_amount', message: 'Session total is zero; nothing to charge.' }
    }
    if (!context.connectAccountId) {
      // No connected account → the seller can't receive funds; refuse rather than
      // route money into the platform account (payout / money-transmission liability).
      return { ok: false, code: 'no_connect', message: 'Seller has no payout account connected.' }
    }

    const applicationFee = calculateApplicationFeeCents(amount, context.commissionPercent)

    // Each protocol hands over a DIFFERENT kind of credential, and Stripe charges each
    // one through a different parameter. Sending them all as `payment_method` only
    // ever worked because the sole end-to-end runs fed a raw Stripe PaymentMethod id
    // through the protocol's credential field. Resolve the shape here, fail closed on
    // anything we cannot charge correctly, and never guess at a money-moving param.
    const credential = resolveCredentialParams(payment)
    if (!credential.ok) return credential.error

    try {
      const params: Stripe.PaymentIntentCreateParams = {
        amount,
        currency: session.currency,
        confirm: true,
        description: toStripeDescription(
          `${session.source.pageName}: ${session.lineItems.map((li) => li.name).join(', ')}`,
        ),
        metadata: buildChargeMetadata(session, context, applicationFee),
        ...credential.params,
      }
      // Direct charge on a connected account takes the platform fee at the top level
      // (unlike Checkout Sessions, where it lives under payment_intent_data).
      if (applicationFee > 0) params.application_fee_amount = applicationFee

      const requestOptions: Stripe.RequestOptions = {
        stripeAccount: context.connectAccountId,
        // Preview-gated params (SPT) only resolve on their preview API version.
        ...(credential.apiVersion ? { apiVersion: credential.apiVersion } : {}),
        // Idempotent BY DEFAULT: a retried settlement of the same session returns the
        // original charge instead of double-charging. SF5 may supply a more specific
        // key (e.g. from an inbound Idempotency-Key header); absent that, derive a
        // stable one from the session id so even the bare path is retry-safe.
        idempotencyKey: context.idempotencyKey ?? `nz_settle_${session.id}`,
      }

      const intent = await stripe.paymentIntents.create(params, requestOptions)

      if (!SETTLEABLE_STATUSES.has(intent.status)) {
        return { ok: false, code: 'stripe_error', message: `Payment could not be completed (status: ${intent.status}).` }
      }
      return {
        ok: true,
        paymentIntentId: intent.id,
        amount,
        applicationFee,
        currency: session.currency,
        livemode: intent.livemode,
      }
    } catch (error) {
      return { ok: false, code: 'stripe_error', message: error instanceof Error ? error.message : 'Unknown Stripe error.' }
    }
  }
}

/** The charge metadata. The adapter's `context.metadata` is merged FIRST so it can
 * add channel labelling (`nexez_source: 'acp'`) + protocol ids, but the money-core
 * keys (page/owner/offer/commission/fee/buyer) are stamped LAST and therefore ALWAYS
 * win - an adapter cannot override them to falsify the fee/owner recorded on the
 * order. Money-core keys are derived here so every channel stamps them identically. */
function buildChargeMetadata(
  session: CheckoutSession,
  context: SettlementContext,
  applicationFee: number,
): Record<string, string> {
  const buyer = session.buyer
  const buyerMeta = buyer
    ? buyerMetadata({
        // Already lowercased/validated by the core's normalizeBuyer; lowercase again
        // defensively so a hand-built session still matches the order-portal lookup.
        email: buyer.email ? buyer.email.toLowerCase() : null,
        name: buyer.name ?? null,
        reference: buyer.reference ?? null,
        agent: buyer.agent ?? null,
      })
    : {}

  return {
    ...(context.metadata ?? {}),
    nexez_page_id: context.pageId,
    nexez_page_slug: session.source.slug,
    nexez_owner_id: context.ownerId ?? '',
    nexez_session_id: session.id,
    // checkout_orders carries a single offer_key/offer_name; denormalize a multi-line
    // cart into those columns (line-item rows are a later slice). Capped at Stripe's
    // 500-char metadata-value limit.
    nexez_offer_key: session.lineItems.map((li) => li.offerKey).join(',').slice(0, 500),
    nexez_offer_name: session.lineItems.map((li) => li.name).join(', ').slice(0, 500),
    nexez_commission_percent: String(context.commissionPercent),
    nexez_application_fee_cents: String(applicationFee || 0),
    ...buyerMeta,
  }
}

/** The blocking outcomes that are resolved from the seller's account state BEFORE a
 * charge is attempted. `paused` and `no_connect` are eligibility gates, not Stripe
 * failures - they must be decided from the DB, never re-derived per protocol. */
export type ResolveSettlementResult =
  | { ok: true; context: SettlementContext }
  | { ok: false; code: 'paused' | 'no_connect'; message: string }

/** Lift the direct-checkout route's up-front guards into one shared resolver both
 * protocol adapters call: an explicitly suspended seller is offline; the
 * commission percent comes from the owner's status-aware plan; and a charge only
 * ever routes to a Connect account that can actually ACCEPT one (charges_enabled).
 * Keeping this here means an adapter cannot forget the pause/connect gate. Takes an
 * admin (service-role) client; the connect fields live on a service-role-only table.
 */
export async function resolveSettlementContext(
  admin: Pick<SupabaseClient, 'from'>,
  input: { pageId: string; ownerId: string | null | undefined; metadata?: Record<string, string>; idempotencyKey?: string },
): Promise<ResolveSettlementResult> {
  const ownerId = input.ownerId ?? null

  // Preserve the explicit suspension guard for a future moderation state. Ordinary
  // billing or promotional expiry falls back to Free and does not enter this path.
  const billingState = await getOwnerBillingState(admin, ownerId)
  if (billingState.isPaused) {
    return { ok: false, code: 'paused', message: 'This seller’s storefront is paused and not accepting orders right now.' }
  }

  const planId = await getOwnerPlanId(admin, ownerId)
  const commissionPercent = getCommissionPercentForPlan(planId)

  // Only route a charge to a Connect account that can ACCEPT one. An owner who
  // created the account but hasn't finished onboarding has an id but
  // charges_enabled !== true - treat that as no payout account.
  const { data: billing } = await admin
    .from('billing_subscriptions')
    .select('stripe_connect_account_id, stripe_connect_charges_enabled')
    .eq('owner_id', ownerId ?? '')
    .maybeSingle<{ stripe_connect_account_id: string | null; stripe_connect_charges_enabled: boolean | null }>()

  if (!billing?.stripe_connect_account_id || billing.stripe_connect_charges_enabled !== true) {
    return { ok: false, code: 'no_connect', message: 'This seller has not connected a payout account yet.' }
  }

  return {
    ok: true,
    context: {
      pageId: input.pageId,
      ownerId,
      connectAccountId: billing.stripe_connect_account_id,
      commissionPercent,
      metadata: input.metadata,
      idempotencyKey: input.idempotencyKey,
    },
  }
}

/** Env-wired convenience: the production settlement bridge using the real Stripe
 * client. Returns a `stripe_error` result (never throws) when Stripe is unconfigured,
 * so an adapter can treat "no Stripe" and "Stripe declined" the same way. */
export const settleSessionToPaymentIntent: SettleCheckoutSession = async (session, payment, context) => {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    return { ok: false, code: 'stripe_error', message: 'Stripe is not configured.' }
  }
  return createSettlementBridge(new Stripe(key))(session, payment, context)
}
