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
  ACTION_APPROVAL_TTL_MS,
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
import {
  getOfferFulfillmentRules,
  getOfferReservableResourceTerms,
} from '../../../../lib/configured-offer'
import { normalizeCurrency } from '../../../../lib/currency'
import { priceOfferConfiguration } from '../../../../lib/offer-configuration-pricing'
import { validateOfferTransactionConfiguration } from '../../../../lib/offer-transaction-configuration'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import {
  acquireAuthoritativeResourceHold,
  attachResourceHoldPayment,
  releaseResourceHold,
  reservableResourceStripeMetadata,
  resourceBuyerScopeHash,
  resolveAuthoritativeResources,
} from '../../../../lib/server/reservable-resource'
import {
  offerConfigurationPricingFingerprint,
  offerFulfillmentFingerprint,
  persistCheckoutConfigurationHandoff,
  STRIPE_OFFER_CONFIGURATION_HASH_KEY,
  STRIPE_OFFER_FULFILLMENT_HASH_KEY,
  STRIPE_OFFER_PRICING_HASH_KEY,
  offerTransactionConfigurationFingerprint,
} from '../../../../lib/server/checkout-configuration-handoff'
import { calculateApplicationFeeCentsFromBps } from '../../../../lib/stripe-billing'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

export const runtime = 'nodejs'

type ResourceCheckoutInput = {
  slug?: string
  offer?: string
  offerConfiguration?: unknown
  query?: string
  buyerEmail?: string
  buyerName?: string
  buyerReference?: string
  buyerAgent?: string
  dryRun?: boolean
  approvalToken?: string
}

async function readInput(request: Request): Promise<ResourceCheckoutInput> {
  try {
    return await request.json() as ResourceCheckoutInput
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

function requestAddress(request: Request) {
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || null
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'reservable-resource-checkout', 20, 60_000, { failClosed: true })
  if (limited) return limited
  const input = await readInput(request)
  const idempotency = parsePublicActionIdempotencyKey(request)
  if (!idempotency.ok) {
    return NextResponse.json({ error: idempotency.error, code: 'invalid_idempotency_key' }, { status: 400 })
  }
  if (!idempotency.key) {
    return NextResponse.json(
      { error: 'Reservable-resource validation requires an Idempotency-Key.', code: 'idempotency_key_required' },
      { status: 400 },
    )
  }
  if (!input.slug || !input.offer) {
    return NextResponse.json({ error: 'Missing resource checkout page or offer.' }, { status: 400 })
  }
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Resource checkout is not configured on this deployment.' }, { status: 503 })
  }

  const page = await getPublishedPage(input.slug)
  if (!page) return NextResponse.json({ error: 'Checkout page not found.' }, { status: 404 })
  if (!page.owner_id) return NextResponse.json({ error: 'Checkout owner is unavailable.' }, { status: 409 })
  const ownerId = page.owner_id
  const offer = getCheckoutOffer(page, input.offer)
  if (!offer) return NextResponse.json({ error: 'Checkout offer not found.' }, { status: 404 })
  if (offer.offerType === 'negotiable') {
    return NextResponse.json(
      { error: 'Reservable-resource v1 requires one deterministic immediate total.', code: 'resource_negotiation_unsupported' },
      { status: 409 },
    )
  }
  const terms = getOfferReservableResourceTerms(offer)
  if (!terms) {
    return NextResponse.json(
      { error: 'This offer does not publish a valid Nexez-owned resource contract.', code: 'resource_terms_required' },
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
        error: fulfillment.reasons[0]?.message ?? 'This buyer configuration is not eligible for resource checkout.',
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
        error: priced.ok ? 'Resource checkout requires a positive deterministic total.' : priced.error,
        code: priced.ok ? 'resource_total_required' : 'offer_configuration_pricing_invalid',
        ...(!priced.ok ? { pricingCode: priced.code, fields: priced.fields } : {}),
      },
      { status: 409 },
    )
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
  const approvalSecret = process.env.NEXEZ_ACTION_APPROVAL_SECRET?.trim() || ''
  if (Buffer.byteLength(approvalSecret, 'utf8') < 32) {
    return NextResponse.json(
      { error: 'Resource checkout requires configured buyer approval.', code: 'approval_not_configured' },
      { status: 503 },
    )
  }

  const resolved = await resolveAuthoritativeResources({
    admin,
    ownerId,
    pageId: page.id,
    terms,
    configuration: normalizedConfiguration,
  })
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error, code: resolved.code }, { status: 409 })
  }

  const configurationFingerprint = offerTransactionConfigurationFingerprint(normalizedConfiguration)
  const pricingFingerprint = priced.pricing ? offerConfigurationPricingFingerprint(priced.pricing) : null
  const fulfillmentFingerprint = getOfferFulfillmentRules(offer).length
    ? offerFulfillmentFingerprint(fulfillment)
    : null
  const transactionFingerprint = actionRequestHash('checkout', {
    resourceTransaction: {
      pageId: page.id,
      offerKey,
      offerConfiguration: normalizedConfiguration,
      configurationFingerprint,
      amountCents: priced.amountCents,
      currency,
      pricingFingerprint,
      fulfillmentFingerprint,
    },
  })
  const buyer = parseBuyerIdentity({
    ...input,
    buyerAgent: input.buyerAgent || request.headers.get('x-nexez-buyer-agent') || undefined,
  })
  const buyerScopeHash = resourceBuyerScopeHash({
    pageId: page.id,
    offerKey,
    buyerEmail: buyer.email,
    buyerReference: buyer.reference,
    buyerAgent: buyer.agent,
    remoteAddress: requestAddress(request),
  })
  const requestIdempotencyKey = scopedIdempotencyHash('checkout', `${page.slug}:resources`, idempotency.key)
  const acquired = await acquireAuthoritativeResourceHold({
    admin,
    ownerId,
    pageId: page.id,
    offerKey,
    buyerScopeHash,
    requestIdempotencyKey,
    transactionFingerprint,
    allocations: resolved.value,
    ttlSeconds: 3_600,
  })
  if (!acquired.ok) {
    return NextResponse.json({ error: acquired.error, code: acquired.code }, { status: 409 })
  }

  if (Object.keys(normalizedConfiguration).length) input.offerConfiguration = normalizedConfiguration
  else delete input.offerConfiguration
  const approvalPayload: Record<string, unknown> = {
    ...input,
    resourceApproval: acquired.approval.resources,
  }
  if (input.dryRun) {
    const remainingTtlMs = Date.parse(acquired.hold.expiresAt) - Date.now()
    const approval = issueActionApprovalToken('checkout', approvalInput(approvalPayload), {
      ttlMs: Math.max(1_000, Math.min(ACTION_APPROVAL_TTL_MS, remainingTtlMs)),
    })
    if (!approval) {
      await releaseResourceHold({ admin, holdId: acquired.hold.holdId, reason: 'buyer_cancelled' })
      return NextResponse.json({ error: 'Could not issue resource checkout approval.', code: 'approval_not_configured' }, { status: 503 })
    }
    return NextResponse.json({
      ok: true,
      provider: 'stripe_reservable_resource',
      actionUrl: `${getRequestBaseUrl(request)}/api/reservable-resources/checkout`,
      amountCents: priced.amountCents,
      currency,
      offerConfiguration: normalizedConfiguration,
      requiredOfferConfigurationFields: configuration.schema.filter((field) => field.required).map((field) => field.key),
      offerPricing: priced.pricing,
      offerFulfillment: fulfillment,
      resources: {
        ...acquired.hold,
        allocations: acquired.hold.allocations.map((allocation) => ({
          poolId: allocation.poolId,
          poolKey: allocation.poolKey,
          poolLabel: allocation.poolLabel,
          poolVersion: allocation.poolVersion,
          kind: allocation.kind,
          unit: allocation.unit,
          quantity: allocation.quantity,
          windowId: allocation.windowId ?? null,
          windowKey: allocation.windowKey ?? null,
          windowLabel: allocation.windowLabel ?? null,
          windowVersion: allocation.windowVersion ?? null,
          startsAt: allocation.startsAt ?? null,
          endsAt: allocation.endsAt ?? null,
        })),
      },
      approvalTokenRequired: true,
      ...approval,
    })
  }

  if (!input.approvalToken) {
    await releaseResourceHold({ admin, holdId: acquired.hold.holdId, reason: 'buyer_cancelled' })
    return NextResponse.json(
      { error: 'Validate the exact allocation and obtain buyer approval before payment.', code: 'approval_required' },
      { status: 403 },
    )
  }
  const verified = verifyActionApprovalToken(input.approvalToken, 'checkout', approvalPayload)
  if (!verified.ok || Date.parse(verified.expiresAt) > Date.parse(acquired.hold.expiresAt)) {
    await releaseResourceHold({ admin, holdId: acquired.hold.holdId, reason: 'buyer_cancelled' })
    return NextResponse.json(
      { error: 'Resource checkout approval is invalid, expired, or does not match this hold.', code: 'approval_invalid' },
      { status: 403 },
    )
  }

  const applicationFee = calculateApplicationFeeCentsFromBps(priced.amountCents, settlement.context.commissionBps)
  const resourceMetadata = reservableResourceStripeMetadata({
    holdId: acquired.hold.holdId,
    transactionFingerprint,
    allocationFingerprint: acquired.hold.allocationFingerprint,
    ownerId,
    pageId: page.id,
    offerKey,
  })
  const sessionMetadata = {
    ...resourceMetadata,
    nexez_source: 'reservable_resource_checkout',
    nexez_page_slug: page.slug,
    nexez_offer_name: offer.name,
    nexez_owner_plan: settlement.context.planId,
    nexez_commission_bps: String(settlement.context.commissionBps),
    nexez_commission_percent: String(settlement.context.commissionPercent),
    nexez_commission_source: settlement.context.commissionSource,
    nexez_application_fee_cents: String(applicationFee),
    [STRIPE_OFFER_CONFIGURATION_HASH_KEY]: configurationFingerprint,
    ...(pricingFingerprint ? { [STRIPE_OFFER_PRICING_HASH_KEY]: pricingFingerprint } : {}),
    ...(fulfillmentFingerprint ? { [STRIPE_OFFER_FULFILLMENT_HASH_KEY]: fulfillmentFingerprint } : {}),
    ...buyerMetadata(buyer),
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const baseUrl = getRequestBaseUrl(request)
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      expires_at: Math.floor(Date.parse(acquired.hold.expiresAt) / 1000),
      line_items: [{
        price_data: {
          currency,
          unit_amount: priced.amountCents,
          product_data: {
            name: `${page.name}: ${offer.name}`,
            description: toStripeDescription(offer.description),
            metadata: resourceMetadata,
          },
        },
        quantity: 1,
      }],
      success_url: `${baseUrl}/checkout/${page.slug}/success?session_id={CHECKOUT_SESSION_ID}&offer=${encodeURIComponent(offerKey)}`,
      cancel_url: `${baseUrl}/checkout/${page.slug}?offer=${encodeURIComponent(offerKey)}`,
      metadata: sessionMetadata,
      payment_intent_data: {
        metadata: resourceMetadata,
        ...(applicationFee > 0 ? { application_fee_amount: applicationFee } : {}),
      },
      ...(buyer.email ? { customer_email: buyer.email } : {}),
      ...(buyer.reference ? { client_reference_id: buyer.reference } : {}),
    }, {
      stripeAccount: settlement.context.connectAccountId,
      idempotencyKey: `nexez_resources_${requestIdempotencyKey}`,
    })
  } catch (error) {
    await releaseResourceHold({ admin, holdId: acquired.hold.holdId, reason: 'buyer_cancelled' })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not start resource checkout.', code: 'stripe_resource_checkout_error' },
      { status: 502 },
    )
  }

  const attached = await attachResourceHoldPayment({
    admin,
    holdId: acquired.hold.holdId,
    transactionFingerprint,
    allocationFingerprint: acquired.hold.allocationFingerprint,
    stripeCheckoutSessionId: session.id,
    stripeConnectAccountId: settlement.context.connectAccountId,
    amountCents: priced.amountCents,
    currency,
  })
  if (!attached.ok) {
    let providerExpired = false
    try {
      const expired = await stripe.checkout.sessions.expire(
        session.id,
        {},
        { stripeAccount: settlement.context.connectAccountId },
      )
      providerExpired = expired.status === 'expired'
    } catch {
      // The session exists and provider state is uncertain. Preserve capacity:
      // releasing here could oversell if the session completed concurrently.
    }
    if (providerExpired) {
      await releaseResourceHold({ admin, holdId: acquired.hold.holdId, reason: 'provider_cancelled' })
    }
    return NextResponse.json(
      {
        error: providerExpired
          ? 'Could not bind payment to the resource hold.'
          : 'Payment state could not be confirmed; capacity remains protected for reconciliation.',
        code: providerExpired ? 'resource_payment_handoff_failed' : 'resource_payment_state_uncertain',
      },
      { status: 503 },
    )
  }

  const handoff = await persistCheckoutConfigurationHandoff(admin, {
    stripeSessionId: session.id,
    pageId: page.id,
    offerKey,
    configuration: normalizedConfiguration,
    pricing: priced.pricing,
    fulfillment,
  })
  if (!handoff.ok) {
    let expired = false
    try {
      await stripe.checkout.sessions.expire(session.id, {}, { stripeAccount: settlement.context.connectAccountId })
      expired = true
    } catch {
      // payment_pending must remain allocated until provider terminal truth.
    }
    if (expired) {
      await releaseResourceHold({
        admin,
        holdId: acquired.hold.holdId,
        reason: 'provider_cancelled',
        stripeCheckoutSessionId: session.id,
      })
    }
    return NextResponse.json(
      { error: 'Could not preserve configured checkout provenance.', code: 'configuration_handoff_failed' },
      { status: 503 },
    )
  }

  return NextResponse.json({
    ok: true,
    provider: 'stripe_reservable_resource',
    url: session.url,
    checkoutSessionId: session.id,
    amountCents: priced.amountCents,
    currency,
    resources: acquired.hold,
  })
}
