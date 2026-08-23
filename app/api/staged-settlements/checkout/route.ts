import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import {
  type AgentPage,
  SERVER_PAGE_SELECT,
  getCheckoutOffer,
  getCheckoutOfferKey,
  getRequestBaseUrl,
} from '../../../../lib/agent-page'
import {
  actionRequestHash,
  approvalInput,
  issueActionApprovalToken,
  parsePublicActionIdempotencyKey,
  scopedIdempotencyHash,
  verifyActionApprovalToken,
} from '../../../../lib/action-approval'
import { buyerMetadata, parseBuyerIdentity } from '../../../../lib/buyer-identity'
import { toStripeDescription } from '../../../../lib/checkout'
import { resolveSettlementContext } from '../../../../lib/commerce/settlement-bridge'
import { getOfferStagedSettlementTerms } from '../../../../lib/configured-offer'
import { normalizeCurrency } from '../../../../lib/currency'
import { priceOfferConfiguration } from '../../../../lib/offer-configuration-pricing'
import { validateOfferTransactionConfiguration } from '../../../../lib/offer-transaction-configuration'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import {
  buildStagedSettlementAgreementSnapshot,
  stagedSettlementApprovalPayload,
} from '../../../../lib/staged-settlement-runtime'
import { calculateApplicationFeeCentsFromBps } from '../../../../lib/stripe-billing'
import {
  offerConfigurationPricingFingerprint,
  offerFulfillmentFingerprint,
} from '../../../../lib/server/checkout-configuration-handoff'
import {
  attachStagedSettlementCheckoutSession,
  createPendingStagedSettlementAgreement,
  deleteUnfundedStagedSettlementAgreement,
  findIdempotentStagedSettlementAgreement,
  stagedSettlementContractFingerprint,
  stagedSettlementStripeMetadata,
} from '../../../../lib/server/staged-settlement-agreement'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

export const runtime = 'nodejs'

type StagedCheckoutInput = {
  slug?: string
  offer?: string
  offerConfiguration?: unknown
  buyerEmail?: string
  buyerName?: string
  buyerReference?: string
  buyerAgent?: string
  dryRun?: boolean
  approvalToken?: string
}

async function readInput(request: Request): Promise<StagedCheckoutInput> {
  try {
    return await request.json() as StagedCheckoutInput
  } catch {
    return {}
  }
}

async function getPublishedPage(slug: string): Promise<AgentPage | null> {
  if (!hasSupabaseAdminEnv()) return null
  const { data } = await createAdminClient()
    .from('pages')
    .select(SERVER_PAGE_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()
  return data ?? null
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'staged-settlement-checkout', 20, 60_000, { failClosed: true })
  if (limited) return limited

  const input = await readInput(request)
  const idempotency = parsePublicActionIdempotencyKey(request)
  if (!idempotency.ok) {
    return NextResponse.json({ error: idempotency.error, code: 'invalid_idempotency_key' }, { status: 400 })
  }
  if (!input.slug || !input.offer) {
    return NextResponse.json({ error: 'Missing staged checkout page or offer.' }, { status: 400 })
  }
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Staged settlement is not configured on this deployment.' }, { status: 503 })
  }

  const page = await getPublishedPage(input.slug)
  if (!page) return NextResponse.json({ error: 'Checkout page not found.' }, { status: 404 })
  if (!page.owner_id) return NextResponse.json({ error: 'Checkout owner is unavailable.' }, { status: 409 })
  const ownerId = page.owner_id
  const offer = getCheckoutOffer(page, input.offer)
  if (!offer) return NextResponse.json({ error: 'Checkout offer not found.' }, { status: 404 })
  if (offer.offerType === 'negotiable') {
    return NextResponse.json(
      { error: 'Staged settlement v1 requires one deterministic fixed total.', code: 'staged_settlement_negotiation_unsupported' },
      { status: 409 },
    )
  }
  const terms = getOfferStagedSettlementTerms(offer)
  if (!terms) {
    return NextResponse.json(
      { error: 'This offer does not publish a valid staged settlement contract.', code: 'staged_settlement_terms_required' },
      { status: 409 },
    )
  }

  const offerKey = getCheckoutOfferKey(offer.kind, offer.index)
  const configuration = validateOfferTransactionConfiguration(offer, input.offerConfiguration)
  if (!configuration.ok) {
    return NextResponse.json(
      { error: 'The buyer configuration does not satisfy this offer.', code: 'invalid_offer_configuration', fields: configuration.errors },
      { status: 422 },
    )
  }
  const normalizedConfiguration = configuration.value
  const fulfillment = configuration.fulfillment
  if (fulfillment.decision !== 'eligible') {
    return NextResponse.json(
      {
        error: fulfillment.reasons[0]?.message ?? 'This buyer configuration is not eligible for staged checkout.',
        code: fulfillment.decision === 'requires-review' ? 'fulfillment_review_required' : 'fulfillment_ineligible',
        offerFulfillment: fulfillment,
      },
      { status: 409 },
    )
  }

  const currency = normalizeCurrency(page.currency)
  const priced = priceOfferConfiguration(offer, normalizedConfiguration, currency)
  if (!priced.ok || !priced.amountCents) {
    return NextResponse.json(
      {
        error: priced.ok ? 'Staged settlement requires a positive fixed total.' : priced.error,
        code: priced.ok ? 'staged_settlement_total_required' : 'offer_configuration_pricing_invalid',
        ...(!priced.ok ? { pricingCode: priced.code, fields: priced.fields } : {}),
      },
      { status: 409 },
    )
  }
  const pricingFingerprint = priced.pricing
    ? offerConfigurationPricingFingerprint(priced.pricing)
    : null
  const fulfillmentFingerprint = offerFulfillmentFingerprint(fulfillment)
  const agreementResult = buildStagedSettlementAgreementSnapshot({
    terms,
    totalAmount: priced.amountCents,
    currency,
    offerConfiguration: normalizedConfiguration,
    pricingFingerprint,
    fulfillmentFingerprint,
  })
  if (!agreementResult.ok) {
    return NextResponse.json({ error: agreementResult.error, code: agreementResult.code }, { status: 409 })
  }
  const agreement = agreementResult.value
  const contractFingerprint = stagedSettlementContractFingerprint(agreement)
  const firstStage = agreement.settlement.stages[0]
  const firstStageApproval = {
    contractFingerprint,
    stageId: firstStage.id,
    stageOrder: firstStage.order,
    amountCents: firstStage.amountCents,
    currency: agreement.settlement.currency,
    paidPredecessors: [],
  }
  if (Object.keys(normalizedConfiguration).length) input.offerConfiguration = normalizedConfiguration
  else delete input.offerConfiguration
  const approvalPayload: Record<string, unknown> = {
    ...input,
    stagedSettlementApproval: firstStageApproval,
  }

  const approvalSecret = process.env.NEXEZ_ACTION_APPROVAL_SECRET?.trim() || ''
  if (Buffer.byteLength(approvalSecret, 'utf8') < 32) {
    return NextResponse.json(
      { error: 'Staged settlement requires configured buyer approval.', code: 'approval_not_configured' },
      { status: 503 },
    )
  }
  if (!input.dryRun) {
    if (!idempotency.key) {
      return NextResponse.json(
        { error: 'Staged settlement requires an Idempotency-Key for every payment attempt.', code: 'idempotency_key_required' },
        { status: 400 },
      )
    }
    if (!input.approvalToken) {
      return NextResponse.json(
        { error: 'Validate the exact first obligation and obtain buyer approval before starting payment.', code: 'approval_required' },
        { status: 403 },
      )
    }
    const verified = verifyActionApprovalToken(input.approvalToken, 'checkout', approvalPayload)
    if (!verified.ok) {
      return NextResponse.json(
        { error: 'Staged settlement approval is invalid, expired, or does not match this obligation.', code: 'approval_invalid' },
        { status: 403 },
      )
    }
  }

  const admin = createAdminClient()
  const settlement = await resolveSettlementContext(admin, { pageId: page.id, ownerId })
  if (!settlement.ok) {
    return NextResponse.json(
      { error: settlement.message, code: settlement.code === 'paused' ? 'seller_paused' : 'payments_not_configured' },
      { status: settlement.code === 'paused' ? 402 : 409 },
    )
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe is not configured.', code: 'stripe_not_configured' }, { status: 503 })
  }

  const buyer = parseBuyerIdentity({
    ...input,
    buyerAgent: input.buyerAgent || request.headers.get('x-nexez-buyer-agent') || undefined,
  })
  const baseUrl = getRequestBaseUrl(request)
  const actionUrl = `${baseUrl}/api/staged-settlements/checkout`
  if (input.dryRun) {
    const approval = issueActionApprovalToken('checkout', approvalInput(approvalPayload))
    if (!approval) {
      return NextResponse.json({ error: 'Could not issue staged settlement approval.', code: 'approval_not_configured' }, { status: 503 })
    }
    return NextResponse.json({
      ok: true,
      provider: 'stripe_staged_settlement',
      actionUrl,
      amountCents: firstStage.amountCents,
      currency: agreement.settlement.currency,
      agreedTotalCents: agreement.settlement.totalAmount,
      connectReady: true,
      stripeConfigured: true,
      offerConfiguration: normalizedConfiguration,
      requiredOfferConfigurationFields: configuration.schema.filter((field) => field.required).map((field) => field.key),
      offerPricing: priced.pricing,
      offerFulfillment: fulfillment,
      stagedSettlementAgreement: agreement,
      stagedSettlementContractFingerprint: contractFingerprint,
      currentObligation: firstStage,
      approvalTokenRequired: true,
      ...approval,
    })
  }

  const requestIdempotencyKey = scopedIdempotencyHash(
    'checkout',
    `${page.slug}:staged-settlement`,
    idempotency.key as string,
  )
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  async function existingResponse() {
    const existing = await findIdempotentStagedSettlementAgreement({ admin, ownerId, requestIdempotencyKey })
    if (!existing) return null
    if (existing.contractFingerprint !== contractFingerprint) {
      return NextResponse.json(
        { error: 'This Idempotency-Key is already bound to a different staged agreement.', code: 'idempotency_conflict' },
        { status: 409 },
      )
    }
    const { data: obligation } = await admin
      .from('staged_settlement_obligations')
      .select('stripe_checkout_session_id, status')
      .eq('agreement_id', existing.id)
      .eq('stage_order', 1)
      .maybeSingle<{ stripe_checkout_session_id: string | null; status: string }>()
    if (!obligation?.stripe_checkout_session_id) {
      return NextResponse.json(
        { error: 'The prior staged checkout attempt has no reusable Stripe session. Retry with a new Idempotency-Key.', code: 'staged_checkout_incomplete' },
        { status: 409 },
      )
    }
    try {
      const session = await stripe.checkout.sessions.retrieve(
        obligation.stripe_checkout_session_id,
        {},
        { stripeAccount: existing.connectAccountId },
      )
      if (session.status === 'open' && session.url) {
        return NextResponse.json({
          ok: true,
          provider: 'stripe_staged_settlement',
          url: session.url,
          checkoutSessionId: session.id,
          stagedSettlementAgreementId: existing.id,
          idempotentReplay: true,
        })
      }
      return NextResponse.json({
        ok: true,
        stagedSettlementAgreementId: existing.id,
        agreementStatus: existing.status,
        obligationStatus: obligation.status,
        checkoutSessionStatus: session.status,
        idempotentReplay: true,
      })
    } catch {
      return NextResponse.json(
        { error: 'The prior staged checkout session could not be recovered. Retry with a new Idempotency-Key.', code: 'staged_checkout_incomplete' },
        { status: 409 },
      )
    }
  }

  const replay = await existingResponse()
  if (replay) return replay

  const agreementId = randomUUID()
  const approvalFingerprint = actionRequestHash('checkout', approvalInput(approvalPayload))
  const pending = await createPendingStagedSettlementAgreement({
    admin,
    id: agreementId,
    ownerId,
    pageId: page.id,
    slug: page.slug,
    offerKey,
    offerName: offer.name,
    connectAccountId: settlement.context.connectAccountId,
    snapshot: agreement,
    contractFingerprint,
    firstApprovalFingerprint: approvalFingerprint,
    requestIdempotencyKey,
    commissionBps: settlement.context.commissionBps,
    planId: settlement.context.planId,
    commissionSource: settlement.context.commissionSource,
    buyerEmail: buyer.email,
    buyerName: buyer.name,
    buyerReference: buyer.reference,
    buyerAgent: buyer.agent,
  })
  if (!pending.ok) {
    if (pending.conflict) {
      const concurrentReplay = await existingResponse()
      if (concurrentReplay) return concurrentReplay
    }
    return NextResponse.json(
      { error: 'Could not create the staged settlement agreement.', code: 'staged_agreement_persist_failed' },
      { status: 503 },
    )
  }

  const applicationFee = calculateApplicationFeeCentsFromBps(firstStage.amountCents, settlement.context.commissionBps)
  const metadata = stagedSettlementStripeMetadata({
    agreementId,
    obligationId: pending.firstObligationId,
    stageId: firstStage.id,
    contractFingerprint,
    approvalFingerprint,
    ownerId,
    pageId: page.id,
    offerKey,
  })
  const sessionMetadata = {
    ...metadata,
    nexez_source: 'staged_settlement_checkout',
    nexez_page_slug: page.slug,
    nexez_offer_name: offer.name,
    nexez_owner_plan: settlement.context.planId,
    nexez_commission_bps: String(settlement.context.commissionBps),
    nexez_commission_percent: String(settlement.context.commissionPercent),
    nexez_commission_source: settlement.context.commissionSource,
    nexez_application_fee_cents: String(applicationFee),
    ...buyerMetadata(buyer),
  }

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: agreement.settlement.currency,
            unit_amount: firstStage.amountCents,
            product_data: {
              name: `${page.name}: ${firstStage.label}`,
              description: toStripeDescription(`${offer.name} - ${firstStage.label}`),
              metadata: {
                nexez_page_id: page.id,
                nexez_page_slug: page.slug,
                nexez_offer_key: offerKey,
                nexez_staged_stage_id: firstStage.id,
              },
            },
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}/checkout/${page.slug}/success?session_id={CHECKOUT_SESSION_ID}&offer=${encodeURIComponent(offerKey)}`,
        cancel_url: `${baseUrl}/checkout/${page.slug}?offer=${encodeURIComponent(offerKey)}`,
        metadata: sessionMetadata,
        payment_intent_data: {
          metadata,
          ...(applicationFee > 0 ? { application_fee_amount: applicationFee } : {}),
        },
        ...(buyer.email ? { customer_email: buyer.email } : {}),
        ...(buyer.reference ? { client_reference_id: buyer.reference } : {}),
      },
      {
        stripeAccount: settlement.context.connectAccountId,
        idempotencyKey: `nexez_staged_${requestIdempotencyKey}`,
      },
    )
    if (session.status && session.status !== 'open') {
      await deleteUnfundedStagedSettlementAgreement(admin, agreementId)
      return NextResponse.json(
        { error: 'The staged checkout session is not open. Start a new payment action.', code: 'staged_checkout_session_not_open' },
        { status: 409 },
      )
    }
    const attached = await attachStagedSettlementCheckoutSession({
      admin,
      agreementId,
      obligationId: pending.firstObligationId,
      stripeSessionId: session.id,
      applicationFeeCents: applicationFee,
    })
    if (!attached.ok) {
      try {
        await stripe.checkout.sessions.expire(session.id, {}, { stripeAccount: settlement.context.connectAccountId })
      } catch {
        // The agreement is removed below; a completed orphan session cannot match
        // trusted agreement provenance in the webhook.
      }
      await deleteUnfundedStagedSettlementAgreement(admin, agreementId)
      return NextResponse.json(
        { error: 'Could not bind Stripe checkout to the staged obligation.', code: 'staged_agreement_handoff_failed' },
        { status: 503 },
      )
    }
    return NextResponse.json({
      ok: true,
      provider: 'stripe_staged_settlement',
      url: session.url,
      checkoutSessionId: session.id,
      stagedSettlementAgreementId: agreementId,
      stagedSettlementAccessToken: pending.accessToken,
      stagedSettlementContractFingerprint: contractFingerprint,
      currentObligation: firstStage,
      remainingAmountCents: agreement.settlement.totalAmount - firstStage.amountCents,
    })
  } catch (error) {
    await deleteUnfundedStagedSettlementAgreement(admin, agreementId)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not start staged checkout.', code: 'stripe_staged_settlement_error' },
      { status: 502 },
    )
  }
}
