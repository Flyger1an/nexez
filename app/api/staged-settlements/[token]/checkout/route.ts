import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import {
  actionRequestHash,
  approvalInput,
  issueActionApprovalToken,
  parsePublicActionIdempotencyKey,
  scopedIdempotencyHash,
  verifyActionApprovalToken,
} from '../../../../../lib/action-approval'
import { getRequestBaseUrl } from '../../../../../lib/agent-page'
import { toStripeDescription } from '../../../../../lib/checkout'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { stagedSettlementApprovalPayload } from '../../../../../lib/staged-settlement-runtime'
import { calculateApplicationFeeCentsFromBps } from '../../../../../lib/stripe-billing'
import {
  attachStagedSettlementCheckoutSession,
  claimStagedSettlementObligation,
  resetUnfundedStagedSettlementObligation,
  stagedSettlementStripeMetadata,
  validStagedSettlementAccessToken,
} from '../../../../../lib/server/staged-settlement-agreement'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../../utils/supabase/admin'
import { checkoutReturnUrls } from '../../../../../lib/nexxi-checkout-return'

export const runtime = 'nodejs'
type Context = { params: Promise<{ token: string }> }
type Input = { dryRun?: boolean; approvalToken?: string }

type Agreement = {
  id: string
  owner_id: string
  page_id: string | null
  slug: string | null
  offer_key: string
  offer_name: string
  status: string
  contract_fingerprint: string
  currency: string
  stripe_connect_account_id: string
  commission_bps: number | null
  plan_id_at_purchase: string | null
  commission_source: string | null
  buyer_email: string | null
  buyer_reference: string | null
  buyer_agent: string | null
}

type Obligation = {
  id: string
  agreement_id: string
  stage_id: string
  stage_order: number
  label: string
  amount_cents: number
  status: string
  approval_fingerprint: string | null
  stripe_checkout_session_id: string | null
  stripe_payment_intent_id: string | null
}

export async function POST(request: Request, context: Context) {
  const limited = await enforceRateLimit(request, 'staged-settlement-obligation-checkout', 20, 60_000, { failClosed: true })
  if (limited) return limited
  if (!hasSupabaseAdminEnv()) return NextResponse.json({ error: 'Staged settlement is unavailable.' }, { status: 503 })
  const input = await request.json().catch(() => ({})) as Input
  const idempotency = parsePublicActionIdempotencyKey(request)
  if (!idempotency.ok) return NextResponse.json({ error: idempotency.error, code: 'invalid_idempotency_key' }, { status: 400 })
  const { token } = await context.params
  const tokenHash = validStagedSettlementAccessToken(token)
  if (!tokenHash) return NextResponse.json({ error: 'Staged settlement agreement not found.' }, { status: 404 })

  const admin = createAdminClient()
  const { data: agreement } = await admin
    .from('staged_settlement_agreements')
    .select('id, owner_id, page_id, slug, offer_key, offer_name, status, contract_fingerprint, currency, stripe_connect_account_id, commission_bps, plan_id_at_purchase, commission_source, buyer_email, buyer_reference, buyer_agent')
    .eq('access_token_sha256', tokenHash)
    .maybeSingle<Agreement>()
  if (!agreement) return NextResponse.json({ error: 'Staged settlement agreement not found.' }, { status: 404 })
  if (agreement.status === 'complete' || agreement.status === 'cancelled' || agreement.status === 'disputed') {
    return NextResponse.json(
      { error: `This staged agreement is ${agreement.status}.`, code: 'agreement_not_payable' },
      { status: 409 },
    )
  }
  const { data: rawObligations, error: obligationsError } = await admin
    .from('staged_settlement_obligations')
    .select('id, agreement_id, stage_id, stage_order, label, amount_cents, status, approval_fingerprint, stripe_checkout_session_id, stripe_payment_intent_id')
    .eq('agreement_id', agreement.id)
    .order('stage_order', { ascending: true })
  if (obligationsError) return NextResponse.json({ error: 'Could not read staged obligations.' }, { status: 500 })
  const obligations = (rawObligations ?? []) as Obligation[]
  const current = obligations.find((item) =>
    item.status === 'ready_for_buyer_approval' || item.status === 'payment_pending')
  if (!current) {
    return NextResponse.json(
      { error: 'No staged obligation is currently awaiting buyer payment.', code: 'no_payable_obligation' },
      { status: 409 },
    )
  }
  const paidPredecessors = obligations
    .filter((item) => item.stage_order < current.stage_order && item.status === 'paid' && item.stripe_payment_intent_id)
    .map((item) => ({ stageId: item.stage_id, paymentIntentId: item.stripe_payment_intent_id as string }))
  if (paidPredecessors.length !== current.stage_order - 1) {
    return NextResponse.json(
      { error: 'The paid predecessor lineage is incomplete.', code: 'staged_lineage_incomplete' },
      { status: 409 },
    )
  }
  const approvalPayload = stagedSettlementApprovalPayload({
    agreementId: agreement.id,
    contractFingerprint: agreement.contract_fingerprint,
    stageId: current.stage_id,
    stageOrder: current.stage_order,
    amountCents: current.amount_cents,
    currency: agreement.currency,
    paidPredecessors,
  }) as unknown as Record<string, unknown>
  const approvalSecret = process.env.NEXEZ_ACTION_APPROVAL_SECRET?.trim() || ''
  if (Buffer.byteLength(approvalSecret, 'utf8') < 32) {
    return NextResponse.json({ error: 'Staged settlement requires configured buyer approval.', code: 'approval_not_configured' }, { status: 503 })
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe is not configured.', code: 'stripe_not_configured' }, { status: 503 })
  }
  const actionUrl = `${getRequestBaseUrl(request)}/api/staged-settlements/${token}/checkout`

  if (input.dryRun) {
    if (current.status !== 'ready_for_buyer_approval') {
      return NextResponse.json(
        { error: 'This obligation already has a payment attempt in progress.', code: 'obligation_payment_pending' },
        { status: 409 },
      )
    }
    const approval = issueActionApprovalToken('checkout', approvalInput(approvalPayload))
    if (!approval) return NextResponse.json({ error: 'Could not issue staged approval.' }, { status: 503 })
    return NextResponse.json({
      ok: true,
      provider: 'stripe_staged_settlement',
      actionUrl,
      agreementId: agreement.id,
      agreementStatus: agreement.status,
      currentObligation: {
        stageId: current.stage_id,
        order: current.stage_order,
        label: current.label,
        amountCents: current.amount_cents,
        currency: agreement.currency,
        status: current.status,
      },
      paidPredecessors: paidPredecessors.map((item) => ({ stageId: item.stageId })),
      approvalTokenRequired: true,
      ...approval,
    })
  }

  if (!idempotency.key) {
    return NextResponse.json(
      { error: 'Staged settlement requires an Idempotency-Key for every payment attempt.', code: 'idempotency_key_required' },
      { status: 400 },
    )
  }
  if (!input.approvalToken) {
    return NextResponse.json({ error: 'Fresh buyer approval is required for this obligation.', code: 'approval_required' }, { status: 403 })
  }
  const verified = verifyActionApprovalToken(input.approvalToken, 'checkout', approvalPayload)
  if (!verified.ok) {
    return NextResponse.json(
      { error: 'Approval is invalid, expired, or does not match the current obligation and paid lineage.', code: 'approval_invalid' },
      { status: 403 },
    )
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  if (current.status === 'payment_pending') {
    if (!current.stripe_checkout_session_id) {
      return NextResponse.json(
        { error: 'The prior payment attempt has no recoverable session. The merchant must retry readiness.', code: 'staged_checkout_incomplete' },
        { status: 409 },
      )
    }
    try {
      const existing = await stripe.checkout.sessions.retrieve(
        current.stripe_checkout_session_id,
        {},
        { stripeAccount: agreement.stripe_connect_account_id },
      )
      return NextResponse.json({
        ok: true,
        provider: 'stripe_staged_settlement',
        url: existing.status === 'open' ? existing.url : null,
        checkoutSessionId: existing.id,
        checkoutSessionStatus: existing.status,
        agreementId: agreement.id,
        obligationId: current.id,
        idempotentReplay: true,
      })
    } catch {
      return NextResponse.json({ error: 'The prior staged Checkout session could not be recovered.' }, { status: 409 })
    }
  }

  const approvalFingerprint = actionRequestHash('checkout', approvalInput(approvalPayload))
  const claimed = await claimStagedSettlementObligation({
    admin,
    agreementId: agreement.id,
    obligationId: current.id,
    approvalFingerprint,
  })
  if (!claimed.ok) {
    return NextResponse.json({ error: claimed.error, code: 'obligation_state_conflict' }, { status: 409 })
  }
  const applicationFee = calculateApplicationFeeCentsFromBps(current.amount_cents, agreement.commission_bps ?? 0)
  const metadata = stagedSettlementStripeMetadata({
    agreementId: agreement.id,
    obligationId: current.id,
    stageId: current.stage_id,
    contractFingerprint: agreement.contract_fingerprint,
    approvalFingerprint,
    ownerId: agreement.owner_id,
    pageId: agreement.page_id,
    offerKey: agreement.offer_key,
  })
  const scopedKey = scopedIdempotencyHash(
    'checkout',
    `${agreement.id}:${current.stage_id}`,
    idempotency.key,
  )
  const baseUrl = getRequestBaseUrl(request)
  const returns = checkoutReturnUrls({
    baseUrl,
    buyerAgent: agreement.buyer_agent,
    webSuccessUrl: `${baseUrl}/checkout/${agreement.slug || ''}/success?session_id={CHECKOUT_SESSION_ID}&offer=${encodeURIComponent(agreement.offer_key)}`,
    webCancelUrl: `${baseUrl}/checkout/${agreement.slug || ''}?offer=${encodeURIComponent(agreement.offer_key)}`,
  })
  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: agreement.currency,
            unit_amount: current.amount_cents,
            product_data: {
              name: `${agreement.offer_name}: ${current.label}`,
              description: toStripeDescription(current.label),
              metadata: { nexez_staged_stage_id: current.stage_id },
            },
          },
          quantity: 1,
        }],
        success_url: returns.successUrl,
        cancel_url: returns.cancelUrl,
        ...(returns.mobile ? { origin_context: 'mobile_app' } : {}),
        metadata: {
          ...metadata,
          nexez_source: 'staged_settlement_checkout',
          nexez_page_slug: agreement.slug ?? '',
          nexez_offer_name: agreement.offer_name,
          nexez_owner_plan: agreement.plan_id_at_purchase ?? '',
          nexez_commission_bps: String(agreement.commission_bps ?? 0),
          nexez_commission_percent: String((agreement.commission_bps ?? 0) / 100),
          nexez_commission_source: agreement.commission_source ?? '',
          nexez_application_fee_cents: String(applicationFee),
        },
        payment_intent_data: {
          metadata,
          ...(applicationFee > 0 ? { application_fee_amount: applicationFee } : {}),
        },
        ...(agreement.buyer_email ? { customer_email: agreement.buyer_email } : {}),
        ...(agreement.buyer_reference ? { client_reference_id: agreement.buyer_reference } : {}),
      },
      {
        stripeAccount: agreement.stripe_connect_account_id,
        idempotencyKey: `nexez_staged_${scopedKey}`,
      },
    )
    if (session.status && session.status !== 'open') {
      await resetUnfundedStagedSettlementObligation({ admin, agreementId: agreement.id, obligationId: current.id })
      return NextResponse.json({ error: 'The staged Checkout session is not open.' }, { status: 409 })
    }
    const attached = await attachStagedSettlementCheckoutSession({
      admin,
      agreementId: agreement.id,
      obligationId: current.id,
      stripeSessionId: session.id,
      applicationFeeCents: applicationFee,
    })
    if (!attached.ok) {
      try {
        await stripe.checkout.sessions.expire(session.id, {}, { stripeAccount: agreement.stripe_connect_account_id })
      } catch {
        // The unmatched session cannot pass webhook provenance checks.
      }
      await resetUnfundedStagedSettlementObligation({ admin, agreementId: agreement.id, obligationId: current.id })
      return NextResponse.json({ error: 'Could not bind Checkout to the staged obligation.' }, { status: 503 })
    }
    return NextResponse.json({
      ok: true,
      provider: 'stripe_staged_settlement',
      url: session.url,
      checkoutSessionId: session.id,
      agreementId: agreement.id,
      obligationId: current.id,
      currentObligation: {
        stageId: current.stage_id,
        order: current.stage_order,
        amountCents: current.amount_cents,
        currency: agreement.currency,
      },
    })
  } catch (error) {
    await resetUnfundedStagedSettlementObligation({ admin, agreementId: agreement.id, obligationId: current.id })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not start staged Checkout.', code: 'stripe_staged_settlement_error' },
      { status: 502 },
    )
  }
}
