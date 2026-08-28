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
import { parseBuyerIdentity, buyerMetadata } from '../../../../lib/buyer-identity'
import { toStripeDescription } from '../../../../lib/checkout'
import { getOfferRecurringTerms } from '../../../../lib/configured-offer'
import { normalizeCurrency } from '../../../../lib/currency'
import { priceOfferConfiguration } from '../../../../lib/offer-configuration-pricing'
import { validateOfferTransactionConfiguration } from '../../../../lib/offer-transaction-configuration'
import { buildRecurringServiceAgreementSnapshot } from '../../../../lib/recurring-service'
import {
  actionApprovalRequired,
  actionApprovalSecret,
  approvalInput,
  issueActionApprovalToken,
  parsePublicActionIdempotencyKey,
  scopedIdempotencyHash,
  verifyActionApprovalToken,
} from '../../../../lib/action-approval'
import { resolveSettlementContext } from '../../../../lib/commerce/settlement-bridge'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import {
  attachServiceAgreementCheckoutSession,
  createPendingServiceAgreement,
  deletePendingServiceAgreement,
  findIdempotentServiceAgreement,
  recurringAgreementFingerprint,
  serviceAgreementStripeMetadata,
} from '../../../../lib/server/service-agreement'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

export const runtime = 'nodejs'

type RecurringCheckoutInput = {
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

async function readInput(request: Request): Promise<RecurringCheckoutInput> {
  try {
    return await request.json() as RecurringCheckoutInput
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

function agreementApprovalPayload(input: RecurringCheckoutInput, agreement: {
  fingerprint: string
  amountPerPeriod: number
  currency: string
  resolvedSchedule: unknown
}): Record<string, unknown> {
  return {
    ...input,
    recurringAgreementApproval: agreement,
  }
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'service-agreement-checkout', 20, 60_000, { failClosed: true })
  if (limited) return limited

  const input = await readInput(request)
  const idempotency = parsePublicActionIdempotencyKey(request)
  if (!idempotency.ok) {
    return NextResponse.json({ error: idempotency.error, code: 'invalid_idempotency_key' }, { status: 400 })
  }
  if (!input.slug || !input.offer) {
    return NextResponse.json({ error: 'Missing recurring checkout listing or offer.' }, { status: 400 })
  }
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Recurring checkout is not configured on this deployment.' }, { status: 503 })
  }

  const page = await getPublishedPage(input.slug)
  if (!page) return NextResponse.json({ error: 'Checkout listing not found.' }, { status: 404 })
  if (!page.owner_id) return NextResponse.json({ error: 'Checkout owner is unavailable.' }, { status: 409 })
  const ownerId = page.owner_id

  const offer = getCheckoutOffer(page, input.offer)
  if (!offer) return NextResponse.json({ error: 'Checkout offer not found.' }, { status: 404 })
  if (offer.offerType === 'negotiable') {
    return NextResponse.json(
      { error: 'Recurring service v1 does not support negotiated per-period pricing.', code: 'recurring_negotiation_unsupported' },
      { status: 409 },
    )
  }

  const recurringTerms = getOfferRecurringTerms(offer)
  if (!recurringTerms) {
    return NextResponse.json(
      { error: 'This offer does not publish a valid merchant recurring-service contract.', code: 'recurring_terms_required' },
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
        error: fulfillment.reasons[0]?.message ?? 'This buyer configuration is not eligible for automatic recurring checkout.',
        code: fulfillment.decision === 'requires-review' ? 'fulfillment_review_required' : 'fulfillment_ineligible',
        offerFulfillment: fulfillment,
      },
      { status: 409 },
    )
  }

  const currency = normalizeCurrency(page.currency)
  const priced = priceOfferConfiguration(offer, normalizedConfiguration, currency, { settlementMode: 'recurring' })
  if (!priced.ok) {
    return NextResponse.json(
      {
        error: priced.error,
        code: priced.code === 'pricing_rule_unresolved'
          ? 'offer_configuration_pricing_unresolved'
          : 'offer_configuration_pricing_invalid',
        pricingCode: priced.code,
        fields: priced.fields,
      },
      { status: 409 },
    )
  }

  const agreementResult = buildRecurringServiceAgreementSnapshot({
    terms: recurringTerms,
    configuration: normalizedConfiguration,
    fulfillment,
    pricing: priced.pricing,
    amountPerPeriod: priced.amountCents,
    currency,
  })
  if (!agreementResult.ok) {
    return NextResponse.json(
      { error: agreementResult.error, code: agreementResult.code, fields: agreementResult.fields },
      { status: 409 },
    )
  }
  const agreement = agreementResult.value
  const agreementFingerprint = recurringAgreementFingerprint(agreement)

  if (Object.keys(normalizedConfiguration).length) input.offerConfiguration = normalizedConfiguration
  else delete input.offerConfiguration
  const approvalPayload = agreementApprovalPayload(input, {
    fingerprint: agreementFingerprint,
    amountPerPeriod: agreement.amountPerPeriod,
    currency: agreement.currency,
    resolvedSchedule: agreement.resolvedSchedule,
  })

  if (!input.dryRun) {
    const secret = actionApprovalSecret()
    if (actionApprovalRequired() && !secret) {
      return NextResponse.json({ error: 'Action approval is required but not configured.', code: 'approval_not_configured' }, { status: 503 })
    }
    if (actionApprovalRequired() && !input.approvalToken) {
      return NextResponse.json(
        { error: 'Validate this recurring agreement and obtain buyer approval before starting it.', code: 'approval_required' },
        { status: 403 },
      )
    }
    if (input.approvalToken) {
      const verified = verifyActionApprovalToken(input.approvalToken, 'checkout', approvalPayload)
      if (!verified.ok) {
        return NextResponse.json(
          { error: 'Recurring agreement approval is invalid, expired, or does not match this action.', code: 'approval_invalid' },
          { status: 403 },
        )
      }
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
  const actionUrl = `${baseUrl}/api/service-agreements/checkout`

  if (input.dryRun) {
    const approval = issueActionApprovalToken('checkout', approvalInput(approvalPayload))
    if (actionApprovalRequired() && !approval) {
      return NextResponse.json({ error: 'Action approval is required but not configured.', code: 'approval_not_configured' }, { status: 503 })
    }
    return NextResponse.json({
      ok: true,
      provider: 'stripe_subscription',
      actionUrl,
      amountCents: agreement.amountPerPeriod,
      currency: agreement.currency,
      connectReady: true,
      stripeConfigured: true,
      offerConfiguration: normalizedConfiguration,
      requiredOfferConfigurationFields: configuration.schema.filter((field) => field.required).map((field) => field.key),
      offerPricing: priced.pricing,
      offerFulfillment: fulfillment,
      recurringAgreement: agreement,
      recurringAgreementFingerprint: agreementFingerprint,
      approvalTokenRequired: actionApprovalRequired(),
      ...(approval ?? {}),
    })
  }

  const requestIdempotencyKey = idempotency.key
    ? scopedIdempotencyHash('checkout', `${page.slug}:service-agreement`, idempotency.key)
    : null
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  async function existingResponse() {
    const existing = await findIdempotentServiceAgreement({
      admin,
      ownerId,
      requestIdempotencyKey,
    })
    if (!existing) return null
    if (existing.contractFingerprint !== agreementFingerprint) {
      return NextResponse.json(
        { error: 'This Idempotency-Key is already bound to a different recurring agreement.', code: 'idempotency_conflict' },
        { status: 409 },
      )
    }
    if (!existing.stripeCheckoutSessionId) {
      return NextResponse.json(
        { error: 'The prior recurring checkout attempt has no reusable Stripe session. Retry with a new Idempotency-Key.', code: 'recurring_checkout_incomplete' },
        { status: 409 },
      )
    }
    try {
      const session = await stripe.checkout.sessions.retrieve(
        existing.stripeCheckoutSessionId,
        {},
        { stripeAccount: existing.stripeConnectAccountId },
      )
      if (session.status === 'open' && session.url) {
        return NextResponse.json({
          ok: true,
          provider: 'stripe_subscription',
          url: session.url,
          checkoutSessionId: session.id,
          serviceAgreementId: existing.id,
          idempotentReplay: true,
        })
      }
      return NextResponse.json({
        ok: true,
        serviceAgreementId: existing.id,
        agreementStatus: existing.status,
        checkoutSessionStatus: session.status,
        idempotentReplay: true,
      })
    } catch {
      return NextResponse.json(
        { error: 'The prior recurring checkout session could not be recovered. Retry with a new Idempotency-Key.', code: 'recurring_checkout_incomplete' },
        { status: 409 },
      )
    }
  }

  if (requestIdempotencyKey) {
    const replay = await existingResponse()
    if (replay) return replay
  }

  const agreementId = randomUUID()
  const pending = await createPendingServiceAgreement({
    admin,
    id: agreementId,
    ownerId,
    pageId: page.id,
    slug: page.slug,
    offerKey,
    offerName: offer.name,
    connectAccountId: settlement.context.connectAccountId,
    snapshot: agreement,
    contractFingerprint: agreementFingerprint,
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
    if (pending.conflict && requestIdempotencyKey) {
      const replay = await existingResponse()
      if (replay) return replay
    }
    return NextResponse.json({ error: 'Could not create the recurring service agreement.', code: 'agreement_persist_failed' }, { status: 503 })
  }

  const metadata = serviceAgreementStripeMetadata({
    agreementId,
    contractFingerprint: agreementFingerprint,
    ownerId,
    pageId: page.id,
    offerKey,
  })
  const sessionMetadata = {
    ...metadata,
    nexez_source: 'service_agreement_checkout',
    nexez_page_slug: page.slug,
    nexez_offer_name: offer.name,
    nexez_owner_plan: settlement.context.planId,
    nexez_commission_bps: String(settlement.context.commissionBps),
    nexez_commission_percent: String(settlement.context.commissionPercent),
    nexez_commission_source: settlement.context.commissionSource,
    ...buyerMetadata(buyer),
  }

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        line_items: [{
          price_data: {
            currency: agreement.currency,
            unit_amount: agreement.amountPerPeriod,
            recurring: {
              interval: agreement.resolvedSchedule.interval,
              interval_count: agreement.resolvedSchedule.intervalCount,
            },
            product_data: {
              name: `${page.name}: ${offer.name}`,
              description: toStripeDescription(offer.description),
              metadata: {
                nexez_page_id: page.id,
                nexez_page_slug: page.slug,
                nexez_offer_key: offerKey,
              },
            },
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}/checkout/${page.slug}/success?session_id={CHECKOUT_SESSION_ID}&offer=${encodeURIComponent(offerKey)}`,
        cancel_url: `${baseUrl}/checkout/${page.slug}?offer=${encodeURIComponent(offerKey)}`,
        metadata: sessionMetadata,
        subscription_data: {
          metadata,
          ...(settlement.context.commissionBps > 0
            ? { application_fee_percent: settlement.context.commissionBps / 100 }
            : {}),
        },
        ...(buyer.email ? { customer_email: buyer.email } : {}),
        ...(buyer.reference ? { client_reference_id: buyer.reference } : {}),
      },
      {
        stripeAccount: settlement.context.connectAccountId,
        ...(requestIdempotencyKey ? { idempotencyKey: `nexez_recurring_${requestIdempotencyKey}` } : {}),
      },
    )

    if (session.status && session.status !== 'open') {
      await deletePendingServiceAgreement(admin, agreementId)
      return NextResponse.json(
        { error: 'The recurring checkout session is not open. Start a new checkout action.', code: 'recurring_checkout_session_not_open' },
        { status: 409 },
      )
    }

    const attached = await attachServiceAgreementCheckoutSession({
      admin,
      agreementId,
      stripeSessionId: session.id,
      livemode: session.livemode,
    })
    if (!attached.ok) {
      try {
        await stripe.checkout.sessions.expire(session.id, {}, { stripeAccount: settlement.context.connectAccountId })
      } catch {
        // Best effort. The local agreement is removed below, so the webhook will
        // reject a session whose agreement provenance no longer exists.
      }
      await deletePendingServiceAgreement(admin, agreementId)
      return NextResponse.json(
        { error: 'Could not bind the Stripe subscription checkout to the recurring agreement.', code: 'agreement_handoff_failed' },
        { status: 503 },
      )
    }

    return NextResponse.json({
      ok: true,
      provider: 'stripe_subscription',
      url: session.url,
      checkoutSessionId: session.id,
      serviceAgreementId: agreementId,
      recurringAgreementFingerprint: agreementFingerprint,
    })
  } catch (error) {
    await deletePendingServiceAgreement(admin, agreementId)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not start recurring checkout.', code: 'stripe_subscription_error' },
      { status: 502 },
    )
  }
}
