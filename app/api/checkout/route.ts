import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import {
  AgentPage,
  SERVER_PAGE_SELECT,
  getBaseUrl,
  getCheckoutOffer,
  getCheckoutOfferKey,
  getOfferDestination,
  getPreferredOriginalOfferUrl,
  getRequestBaseUrl,
  isOfferActionAvailable,
} from '../../../lib/agent-page'
import { toStripeDescription } from '../../../lib/checkout'
import { parseBuyerIdentity, buyerMetadata } from '../../../lib/buyer-identity'
import {
  getOfferFulfillmentRules,
  getOfferReservableResourceTerms,
  getOfferStagedSettlementTerms,
} from '../../../lib/configured-offer'
import { normalizeCurrency } from '../../../lib/currency'
import { getBookingRuleError } from '../../../lib/offer-rules'
import { countRecentBookings } from '../../../lib/server/booking-count'
import { logCheckoutEvent } from '../../../lib/server/log-checkout-event'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { supabase } from '../../../lib/supabase'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../utils/supabase/admin'
import { calculateApplicationFeeCentsFromBps } from '../../../lib/stripe-billing'
import { resolveSettlementContext } from '../../../lib/commerce/settlement-bridge'
import type { SettlementContext } from '../../../lib/commerce/checkout-session-core'
import { billingPlans } from '../../../lib/billing'
import { integrationCredentialsConfigured } from '../../../lib/server/page-integration-credentials'
import { getCalendlyCredential } from '../../../lib/server/calendly-credentials'
import { createCalendlySchedulingLink } from '../../../lib/server/calendly-write'
import { ownerAllows } from '../../../lib/server/plan'
import { priceOfferConfiguration } from '../../../lib/offer-configuration-pricing'
import { validateOfferTransactionConfiguration } from '../../../lib/offer-transaction-configuration'
import {
  hasOfferTransactionConfiguration,
  offerConfigurationPricingFingerprint,
  offerFulfillmentFingerprint,
  offerTransactionConfigurationFingerprint,
  persistCheckoutConfigurationHandoff,
  STRIPE_OFFER_CONFIGURATION_HASH_KEY,
  STRIPE_OFFER_FULFILLMENT_HASH_KEY,
  STRIPE_OFFER_PRICING_HASH_KEY,
} from '../../../lib/server/checkout-configuration-handoff'
import {
  actionApprovalRequired,
  actionApprovalSecret,
  approvalInput,
  issueActionApprovalToken,
  parsePublicActionIdempotencyKey,
  scopedIdempotencyHash,
  verifyActionApprovalToken,
} from '../../../lib/action-approval'
import { checkoutReturnUrls } from '../../../lib/nexxi-checkout-return'

type CheckoutInput = {
  slug: string
  offer: string
  query?: string
  dryRun?: boolean
  /** Buyer transaction data validated against the merchant-authored offer schema. */
  offerConfiguration?: unknown
  buyerEmail?: string
  buyerName?: string
  buyerReference?: string
  buyerAgent?: string
  approvalToken?: string
}

async function getPublishedPage(slug: string) {
  const db = hasSupabaseAdminEnv() ? createAdminClient() : supabase
  const { data } = await db
    .from('pages')
    .select(SERVER_PAGE_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()

  return data
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'checkout', 30, 60_000, { failClosed: true })
  if (limited) return limited

  const contentType = request.headers.get('content-type') || ''
  const wantsJson = contentType.includes('application/json') || request.headers.get('accept')?.includes('application/json')
  const input = await readCheckoutInput(request)
  const idempotency = parsePublicActionIdempotencyKey(request)
  if (!idempotency.ok) return NextResponse.json({ error: idempotency.error, code: 'invalid_idempotency_key' }, { status: 400 })
  const buyer = parseBuyerIdentity({
    ...input,
    buyerAgent: input.buyerAgent || request.headers.get('x-nexez-buyer-agent') || undefined,
  })

  if (!input.slug || !input.offer) {
    return NextResponse.json({ error: 'Missing checkout listing or offer.' }, { status: 400 })
  }

  const page = await getPublishedPage(input.slug)
  if (!page) return NextResponse.json({ error: 'Checkout listing not found.' }, { status: 404 })

  const offer = getCheckoutOffer(page, input.offer)
  if (!offer) return NextResponse.json({ error: 'Checkout offer not found.' }, { status: 404 })
  if (!isOfferActionAvailable(offer)) {
    return NextResponse.json(
      { error: 'This offer is sold out and cannot be purchased or booked.', code: 'offer_unavailable' },
      { status: 409 },
    )
  }

  if (getOfferReservableResourceTerms(offer)) {
    return NextResponse.json(
      {
        error: 'This offer requires an atomic resource hold. Use the published resource checkout action.',
        code: 'reservable_resource_checkout_required',
        actionUrl: `${getRequestBaseUrl(request)}/api/reservable-resources/checkout`,
      },
      { status: 409 },
    )
  }

  if (getOfferStagedSettlementTerms(offer)) {
    return NextResponse.json(
      {
        error: 'This offer uses staged settlement, but per-stage checkout is not active yet.',
        code: 'staged_settlement_runtime_not_available',
      },
      { status: 409 },
    )
  }

  const offerKey = getCheckoutOfferKey(offer.kind, offer.index)
  const configuration = validateOfferTransactionConfiguration(offer, input.offerConfiguration)
  if (!configuration.ok) {
    return NextResponse.json(
      {
        error: 'The buyer configuration does not satisfy this offer.',
        code: 'invalid_offer_configuration',
        fields: configuration.errors,
      },
      { status: 422 },
    )
  }

  const normalizedConfiguration = configuration.value
  const fulfillment = configuration.fulfillment
  const hasFulfillmentPolicy = getOfferFulfillmentRules(offer).length > 0
  const fulfillmentFingerprint = hasFulfillmentPolicy ? offerFulfillmentFingerprint(fulfillment) : null

  if (fulfillment.decision !== 'eligible') {
    return NextResponse.json(
      {
        error: fulfillment.reasons[0]?.message ?? 'This buyer configuration is not eligible for automatic checkout.',
        code: fulfillment.decision === 'requires-review' ? 'fulfillment_review_required' : 'fulfillment_ineligible',
        offerFulfillment: fulfillment,
        ...(fulfillmentFingerprint ? { offerFulfillmentFingerprint: fulfillmentFingerprint } : {}),
      },
      { status: 409 },
    )
  }

  const hasConfiguration = hasOfferTransactionConfiguration(normalizedConfiguration)
  const configurationFingerprint = hasConfiguration
    ? offerTransactionConfigurationFingerprint(normalizedConfiguration)
    : null
  const currency = normalizeCurrency(page.currency)
  const priced = priceOfferConfiguration(offer, normalizedConfiguration, currency)

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

  const amountCents = priced.amountCents || null
  const pricingSnapshot = priced.pricing
  const pricingFingerprint = pricingSnapshot
    ? offerConfigurationPricingFingerprint(pricingSnapshot)
    : null

  // Keep legacy unconfigured actions unchanged, but bind deterministic price and
  // fulfillment provenance whenever those merchant-authored contracts exist.
  if (hasConfiguration) input.offerConfiguration = normalizedConfiguration
  else delete input.offerConfiguration
  const approvalPayload: Record<string, unknown> = {
    ...input,
    ...(pricingSnapshot
      ? {
          offerPricingApproval: {
            fingerprint: pricingFingerprint,
            finalAmount: pricingSnapshot.finalAmount,
            currency: pricingSnapshot.currency,
          },
        }
      : {}),
    ...(hasFulfillmentPolicy
      ? {
          offerFulfillmentApproval: {
            fingerprint: fulfillmentFingerprint,
            decision: fulfillment.decision,
          },
        }
      : {}),
  }

  if (!input.dryRun) {
    const approvalSecret = actionApprovalSecret()
    if (actionApprovalRequired() && !approvalSecret) {
      return NextResponse.json(
        { error: 'Action approval is required but not configured.', code: 'approval_not_configured' },
        { status: 503 },
      )
    }
    if (actionApprovalRequired() && !input.approvalToken) {
      return NextResponse.json(
        { error: 'Validate this checkout and obtain buyer approval before starting it.', code: 'approval_required' },
        { status: 403 },
      )
    }
    if (input.approvalToken) {
      const approval = verifyActionApprovalToken(input.approvalToken, 'checkout', approvalPayload)
      if (!approval.ok) {
        return NextResponse.json(
          { error: 'Checkout approval is invalid, expired, or does not match this action.', code: 'approval_invalid' },
          { status: 403 },
        )
      }
    }
  }

  if (!input.dryRun && offer.rules && (offer.rules.maxBookingsPerWeek != null || offer.rules.blackoutDates?.length)) {
    let recentBookingsThisWeek = 0
    if (offer.rules.maxBookingsPerWeek != null && hasSupabaseAdminEnv()) {
      recentBookingsThisWeek = await countRecentBookings(createAdminClient(), {
        slug: page.slug,
        offerKey,
        offerName: offer.name,
      })
    }
    const ruleError = getBookingRuleError(offer, { recentBookingsThisWeek })
    if (ruleError) return NextResponse.json({ error: ruleError, code: 'booking_rules' }, { status: 409 })
  }

  const baseUrl = getRequestBaseUrl(request)
  const checkoutUrl = `${baseUrl}/checkout/${page.slug}?offer=${offerKey}`
  const returns = checkoutReturnUrls({
    baseUrl,
    buyerAgent: buyer.agent,
    webSuccessUrl: `${baseUrl}/checkout/${page.slug}/success?session_id={CHECKOUT_SESSION_ID}&offer=${offerKey}`,
    webCancelUrl: checkoutUrl,
  })
  const preferredOriginalUrl = getPreferredOriginalOfferUrl(page, offer)
  const forceProviderHandoff = Boolean(preferredOriginalUrl)
  let destination = getOfferDestination(page, offer)
  if (!input.dryRun) {
    destination = (await maybeMintSingleUseCalendlyLink(page.id, page.owner_id, offer, destination)) || destination
  }
  const userAgent = request.headers.get('user-agent')
  const referrer = request.headers.get('referer')

  const attemptLog = await logCheckoutEvent({
    page,
    offer,
    eventType: 'checkout_attempt',
    userAgent,
    referrer,
    query: input.query || null,
    checkoutUrl,
    providerUrl: destination || null,
    metadata: {
      amount_cents: amountCents,
      currency,
      accept: request.headers.get('accept'),
      source: input.dryRun ? 'agent_simulator' : 'agent_checkout',
      dry_run: Boolean(input.dryRun),
      buyer_agent: buyer.agent,
      agent_client: cleanAgentHeader(request.headers.get('x-nexez-client')),
      idempotency_key_present: Boolean(idempotency.key),
      offer_configuration_present: hasConfiguration,
      offer_configuration_fingerprint: configurationFingerprint,
      offer_pricing_present: Boolean(pricingSnapshot),
      offer_pricing_fingerprint: pricingFingerprint,
      offer_pricing_base_amount: pricingSnapshot?.baseAmount ?? null,
      offer_pricing_adjustment_amount: pricingSnapshot?.adjustmentAmount ?? null,
      offer_pricing_final_amount: pricingSnapshot?.finalAmount ?? null,
      offer_fulfillment_present: hasFulfillmentPolicy,
      offer_fulfillment_decision: hasFulfillmentPolicy ? fulfillment.decision : null,
      offer_fulfillment_fingerprint: fulfillmentFingerprint,
    },
  })

  let settlementContext: SettlementContext | null = null
  if (hasSupabaseAdminEnv() && page.owner_id) {
    const admin = createAdminClient()
    const resolved = await resolveSettlementContext(admin, {
      pageId: page.id,
      ownerId: page.owner_id,
    })
    if (!resolved.ok && resolved.code === 'paused') {
      return NextResponse.json(
        { error: 'This seller’s storefront is paused and not accepting orders right now.' },
        { status: 402 },
      )
    }
    if (resolved.ok) settlementContext = resolved.context
  }
  const connectAccountId = settlementContext?.connectAccountId ?? null
  const configuredStripeReady = Boolean(
    !forceProviderHandoff && process.env.STRIPE_SECRET_KEY && amountCents && settlementContext,
  )

  if (hasConfiguration && !configuredStripeReady) {
    return NextResponse.json(
      {
        error: 'Configured checkout requires a Nexez-settled Stripe checkout for this offer.',
        code: 'configured_checkout_requires_nexez_settlement',
      },
      { status: 409 },
    )
  }

  if (input.dryRun) {
    const approval = issueActionApprovalToken('checkout', approvalInput(approvalPayload))
    if (actionApprovalRequired() && !approval) {
      return NextResponse.json(
        { error: 'Action approval is required but not configured.', code: 'approval_not_configured' },
        { status: 503 },
      )
    }
    return NextResponse.json({
      ok: true,
      provider: forceProviderHandoff ? 'provider_ready' : getDryRunProvider(destination, amountCents, connectAccountId),
      checkoutUrl,
      actionUrl: destination || null,
      currency,
      amountCents,
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      connectReady: Boolean(connectAccountId),
      ...(configuration.schema.length
        ? {
            offerConfiguration: normalizedConfiguration,
            requiredOfferConfigurationFields: configuration.schema.filter((field) => field.required).map((field) => field.key),
            offerConfigurationFingerprint: configurationFingerprint,
          }
        : {}),
      ...(pricingSnapshot
        ? {
            offerPricing: pricingSnapshot,
            offerPricingFingerprint: pricingFingerprint,
          }
        : {}),
      ...(hasFulfillmentPolicy
        ? {
            offerFulfillment: fulfillment,
            offerFulfillmentFingerprint: fulfillmentFingerprint,
          }
        : {}),
      events: {
        checkoutAttemptLogged: attemptLog.ok,
      },
      approvalTokenRequired: actionApprovalRequired(),
      ...(approval ?? {}),
    })
  }

  if (!forceProviderHandoff && process.env.STRIPE_SECRET_KEY && amountCents && settlementContext) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
      const applicationFeeAmount = calculateApplicationFeeCentsFromBps(amountCents, settlementContext.commissionBps)

      const sessionParams: any = {
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency,
              unit_amount: amountCents,
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
          },
        ],
        success_url: returns.successUrl,
        cancel_url: returns.cancelUrl,
        ...(returns.mobile ? { origin_context: 'mobile_app' } : {}),
        metadata: {
          nexez_page_id: page.id,
          nexez_page_slug: page.slug,
          nexez_offer_key: offerKey,
          nexez_offer_name: offer.name,
          nexez_source: 'agent_checkout',
          nexez_owner_plan: settlementContext.planId,
          nexez_commission_bps: String(settlementContext.commissionBps),
          nexez_commission_percent: String(settlementContext.commissionPercent),
          nexez_commission_source: settlementContext.commissionSource,
          nexez_owner_id: page.owner_id ?? '',
          nexez_application_fee_cents: String(applicationFeeAmount || 0),
          nexez_storefront_id: (page as { storefront_id?: string | null }).storefront_id ?? '',
          ...(configurationFingerprint
            ? { [STRIPE_OFFER_CONFIGURATION_HASH_KEY]: configurationFingerprint }
            : {}),
          ...(pricingFingerprint
            ? { [STRIPE_OFFER_PRICING_HASH_KEY]: pricingFingerprint }
            : {}),
          ...(fulfillmentFingerprint
            ? { [STRIPE_OFFER_FULFILLMENT_HASH_KEY]: fulfillmentFingerprint }
            : {}),
        },
      }

      if (applicationFeeAmount && applicationFeeAmount > 0) {
        sessionParams.payment_intent_data = {
          ...(sessionParams.payment_intent_data || {}),
          application_fee_amount: applicationFeeAmount,
        }
      }

      if (buyer.email) sessionParams.customer_email = buyer.email
      if (buyer.reference) sessionParams.client_reference_id = buyer.reference
      Object.assign(sessionParams.metadata, buyerMetadata(buyer))

      const stripeIdempotencyKey = idempotency.key
        ? `nexez_checkout_${scopedIdempotencyHash('checkout', page.slug, idempotency.key)}`
        : undefined
      const session = await stripe.checkout.sessions.create(sessionParams, {
        stripeAccount: settlementContext.connectAccountId,
        ...(stripeIdempotencyKey ? { idempotencyKey: stripeIdempotencyKey } : {}),
      })

      if (hasConfiguration && session.status && session.status !== 'open') {
        return NextResponse.json(
          {
            error: 'This configured checkout session is no longer open. Start a new checkout action.',
            code: 'configured_checkout_session_not_open',
            stripeSessionStatus: session.status,
          },
          { status: 409 },
        )
      }

      let configurationHandoffOk = true
      if (hasConfiguration) {
        try {
          const handoff = await persistCheckoutConfigurationHandoff(createAdminClient(), {
            stripeSessionId: session.id,
            pageId: page.id,
            offerKey,
            configuration: normalizedConfiguration,
            pricing: pricingSnapshot,
            fulfillment: hasFulfillmentPolicy ? fulfillment : null,
          })
          configurationHandoffOk = handoff.ok
          if (!handoff.ok) console.warn('[Checkout] Configured checkout handoff failed:', handoff.error)
        } catch (handoffError) {
          configurationHandoffOk = false
          console.warn('[Checkout] Configured checkout handoff threw:', handoffError)
        }
      }

      if (hasConfiguration && !configurationHandoffOk) {
        try {
          await stripe.checkout.sessions.expire(
            session.id,
            {},
            { stripeAccount: settlementContext.connectAccountId },
          )
        } catch (expireError) {
          console.warn('[Checkout] Failed to expire configured Stripe session after handoff failure:', expireError)
        }
        return NextResponse.json(
          {
            error: 'Could not preserve the configured offer for checkout. No payable checkout was returned.',
            code: 'configuration_handoff_failed',
          },
          { status: 503 },
        )
      }

      const sessionLog = await logCheckoutEvent({
        page,
        offer,
        eventType: 'stripe_session_created',
        userAgent,
        referrer,
        query: input.query || null,
        checkoutUrl,
        providerUrl: session.url || null,
        stripeSessionId: session.id,
        metadata: {
          amount_cents: amountCents,
          currency,
          offer_configuration_present: hasConfiguration,
          offer_configuration_fingerprint: configurationFingerprint,
          offer_pricing_present: Boolean(pricingSnapshot),
          offer_pricing_fingerprint: pricingFingerprint,
          offer_fulfillment_present: hasFulfillmentPolicy,
          offer_fulfillment_decision: hasFulfillmentPolicy ? fulfillment.decision : null,
          offer_fulfillment_fingerprint: fulfillmentFingerprint,
        },
      })

      if (wantsJson) {
        return NextResponse.json({
          url: session.url,
          provider: 'stripe',
          checkoutSessionId: session.id,
          amountCents,
          ...(hasConfiguration
            ? { offerConfiguration: normalizedConfiguration, offerConfigurationFingerprint: configurationFingerprint }
            : {}),
          ...(pricingSnapshot
            ? { offerPricing: pricingSnapshot, offerPricingFingerprint: pricingFingerprint }
            : {}),
          ...(hasFulfillmentPolicy
            ? { offerFulfillment: fulfillment, offerFulfillmentFingerprint: fulfillmentFingerprint }
            : {}),
          events: {
            checkoutAttemptLogged: attemptLog.ok,
            stripeSessionLogged: sessionLog.ok,
          },
        })
      }

      return redirectTo(session.url || checkoutUrl)
    } catch (error) {
      if (idempotency.key && isStripeIdempotencyConflict(error)) {
        return NextResponse.json(
          { error: 'This Idempotency-Key was already used for a different checkout action.', code: 'idempotency_conflict' },
          { status: 409 },
        )
      }
      const errorLog = await logCheckoutEvent({
        page,
        offer,
        eventType: 'stripe_error',
        userAgent,
        referrer,
        query: input.query || null,
        checkoutUrl,
        providerUrl: destination || null,
        metadata: {
          amount_cents: amountCents,
          message: error instanceof Error ? error.message : 'Unknown Stripe error',
        },
      })

      if (hasConfiguration) {
        return NextResponse.json(
          {
            error: 'Configured checkout could not start on the Nexez settlement rail.',
            code: 'configured_checkout_failed',
            events: {
              checkoutAttemptLogged: attemptLog.ok,
              stripeErrorLogged: errorLog.ok,
            },
          },
          { status: 502 },
        )
      }

      if (destination) {
        return respondWithDestination(wantsJson, destination, 'provider_fallback', {
          checkoutAttemptLogged: attemptLog.ok,
          stripeErrorLogged: errorLog.ok,
        })
      }

      return redirectMissingCheckout(wantsJson, checkoutUrl, {
        checkoutAttemptLogged: attemptLog.ok,
        stripeErrorLogged: errorLog.ok,
      })
    }
  }

  if (destination) {
    const intentionalProviderHandoff = forceProviderHandoff
    const redirectLog = await logCheckoutEvent({
      page,
      offer,
      eventType: intentionalProviderHandoff || !process.env.STRIPE_SECRET_KEY ? 'provider_redirect' : 'stripe_missing_config',
      userAgent,
      referrer,
      query: input.query || null,
      checkoutUrl,
      providerUrl: destination,
      metadata: {
        amount_cents: amountCents,
        stripe_configured: Boolean(process.env.STRIPE_SECRET_KEY),
        prefer_original: intentionalProviderHandoff,
      },
    })

    return respondWithDestination(wantsJson, destination, intentionalProviderHandoff || !process.env.STRIPE_SECRET_KEY ? 'provider_redirect' : 'stripe_missing_price', {
      checkoutAttemptLogged: attemptLog.ok,
      providerRedirectLogged: redirectLog.ok,
    })
  }

  const missingLog = await logCheckoutEvent({
    page,
    offer,
    eventType: 'stripe_missing_config',
    userAgent,
    referrer,
    query: input.query || null,
    checkoutUrl,
    providerUrl: null,
    metadata: {
      amount_cents: amountCents,
      stripe_configured: Boolean(process.env.STRIPE_SECRET_KEY),
    },
  })

  return redirectMissingCheckout(wantsJson, checkoutUrl, {
    checkoutAttemptLogged: attemptLog.ok,
    missingConfigLogged: missingLog.ok,
  })
}

async function readCheckoutInput(request: Request): Promise<CheckoutInput> {
  const contentType = request.headers.get('content-type') || ''
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}))
    return {
      slug: String(body.slug || ''),
      offer: String(body.offer || ''),
      query: body.query ? String(body.query) : undefined,
      dryRun: Boolean(body.dryRun),
      offerConfiguration: body.offerConfiguration,
      buyerEmail: str(body.buyerEmail),
      buyerName: str(body.buyerName),
      buyerReference: str(body.buyerReference),
      buyerAgent: str(body.buyerAgent),
      approvalToken: str(body.approvalToken),
    }
  }

  const formData = await request.formData()

  return {
    slug: String(formData.get('slug') || ''),
    offer: String(formData.get('offer') || ''),
    query: formData.get('query') ? String(formData.get('query')) : undefined,
    dryRun: formData.get('dryRun') === 'true',
    offerConfiguration: parseFormOfferConfiguration(formData.get('offerConfiguration')),
    buyerEmail: str(formData.get('buyerEmail')),
    buyerName: str(formData.get('buyerName')),
    buyerReference: str(formData.get('buyerReference')),
    buyerAgent: str(formData.get('buyerAgent')),
    approvalToken: str(formData.get('approvalToken')),
  }
}

function parseFormOfferConfiguration(value: FormDataEntryValue | null): unknown {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function cleanAgentHeader(value: string | null) {
  if (!value) return null
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120) || null
}

function isStripeIdempotencyConflict(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; type?: unknown }
  return candidate.code === 'idempotency_key_in_use' || candidate.type === 'StripeIdempotencyError'
}

async function maybeMintSingleUseCalendlyLink(
  pageId: string,
  ownerId: string | null | undefined,
  offer: { source?: string; metadata?: Record<string, unknown> | null } | null,
  fallback: string,
): Promise<string | null> {
  if (!offer || offer.source !== 'calendly') return null
  const eventTypeUri = typeof offer.metadata?.calendly_event_type === 'string' ? offer.metadata.calendly_event_type : ''
  if (!eventTypeUri) return null
  if (!integrationCredentialsConfigured()) return null
  if (!ownerId || !hasSupabaseAdminEnv()) return null
  const admin = createAdminClient()
  if (!(await ownerAllows(admin, ownerId, 'integrations'))) return null
  const credential = await getCalendlyCredential(admin, pageId)
  if (!credential) return null
  const minted = await createCalendlySchedulingLink(credential.accessToken, eventTypeUri)
  return minted || fallback
}

function getDryRunProvider(destination: string, amountCents: number | null, connectAccountId: string | null) {
  if (process.env.STRIPE_SECRET_KEY && amountCents && connectAccountId) return 'stripe_ready'
  if (destination) return 'provider_ready'
  if (process.env.STRIPE_SECRET_KEY && amountCents && !connectAccountId) return 'needs_connect'
  if (amountCents) return 'needs_stripe_key'
  return 'needs_checkout_url'
}

function respondWithDestination(
  wantsJson: boolean | undefined,
  destination: string,
  provider: string,
  events?: Record<string, boolean>,
) {
  if (wantsJson) return NextResponse.json({ url: destination, provider, events })
  return redirectTo(destination)
}

function redirectMissingCheckout(
  wantsJson: boolean | undefined,
  checkoutUrl: string,
  events?: Record<string, boolean>,
) {
  const separator = checkoutUrl.includes('?') ? '&' : '?'
  const url = `${checkoutUrl}${separator}missing_checkout=1`

  if (wantsJson) {
    return NextResponse.json({ error: 'Checkout is not configured for this offer.', url, events }, { status: 409 })
  }

  return redirectTo(url)
}

function redirectTo(value: string) {
  const url = getHttpUrl(value) || getBaseUrl()
  return NextResponse.redirect(url, 303)
}

function getHttpUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString()
  } catch {
    return null
  }

  return null
}
