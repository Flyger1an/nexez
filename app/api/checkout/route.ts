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
} from '../../../lib/agent-page'
import { parseMoney, toStripeDescription } from '../../../lib/checkout'
import { parseBuyerIdentity, buyerMetadata } from '../../../lib/buyer-identity'
import { normalizeCurrency, toStripeAmount } from '../../../lib/currency'
import { getBookingRuleError } from '../../../lib/offer-rules'
import { countRecentBookings } from '../../../lib/server/booking-count'
import { logCheckoutEvent } from '../../../lib/server/log-checkout-event'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { supabase } from '../../../lib/supabase'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../utils/supabase/admin'
import { getCommissionPercentForPlan, calculateApplicationFeeCents } from '../../../lib/stripe-billing'
import { getOwnerPlanId, getOwnerBillingState } from '../../../lib/server/plan'
import { billingPlans } from '../../../lib/billing'
import { getCalendlyPat, integrationCredentialsConfigured } from '../../../lib/server/page-integration-credentials'
import { createCalendlySchedulingLink } from '../../../lib/server/calendly-write'
import {
  actionApprovalRequired,
  actionApprovalSecret,
  approvalInput,
  issueActionApprovalToken,
  parsePublicActionIdempotencyKey,
  scopedIdempotencyHash,
  verifyActionApprovalToken,
} from '../../../lib/action-approval'

type CheckoutInput = {
  slug: string
  offer: string
  query?: string
  dryRun?: boolean
  // Optional buyer identity an agent (or the on-page form) can declare so the seller
  // knows who is buying and the buyer gets a receipt + order-portal access.
  buyerEmail?: string
  buyerName?: string
  buyerReference?: string
  buyerAgent?: string
  approvalToken?: string
}

async function getPublishedPage(slug: string) {
  // Checkout enforces owner-private offer `rules` (booking blackouts / max bookings),
  // so read the base table with the service-role client - anon can't read it anymore
  // and the public view strips `rules`. Anon fallback only when no admin env (tests).
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
    return NextResponse.json({ error: 'Missing checkout page or offer.' }, { status: 400 })
  }

  const page = await getPublishedPage(input.slug)

  if (!page) {
    return NextResponse.json({ error: 'Checkout page not found.' }, { status: 404 })
  }

  const offer = getCheckoutOffer(page, input.offer)

  if (!offer) {
    return NextResponse.json({ error: 'Checkout offer not found.' }, { status: 404 })
  }

  const offerKey = getCheckoutOfferKey(offer.kind, offer.index)

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
      const approval = verifyActionApprovalToken(
        input.approvalToken,
        'checkout',
        input as Record<string, unknown>,
      )
      if (!approval.ok) {
        return NextResponse.json(
          { error: 'Checkout approval is invalid, expired, or does not match this action.', code: 'approval_invalid' },
          { status: 403 },
        )
      }
    }
  }

  // Smart Rules: calendar protection (Phase 1) - weekly booking cap + blackout
  // dates. Counting booked events needs the service-role client (events are
  // owner-only under RLS); when it's unavailable the cap is skipped gracefully.
  if (!input.dryRun && offer.rules && (offer.rules.maxBookingsPerWeek != null || offer.rules.blackoutDates?.length)) {
    let recentBookingsThisWeek = 0
    if (offer.rules.maxBookingsPerWeek != null && hasSupabaseAdminEnv()) {
      // Shared counter (checkout + Calendly webhook bookings) - the same number
      // that drives the offer's advertised availability, so the cap an agent
      // sees and the cap that blocks it can never disagree.
      recentBookingsThisWeek = await countRecentBookings(createAdminClient(), {
        slug: page.slug,
        offerKey,
        offerName: offer.name,
      })
    }
    const ruleError = getBookingRuleError(offer, { recentBookingsThisWeek })
    if (ruleError) {
      return NextResponse.json({ error: ruleError, code: 'booking_rules' }, { status: 409 })
    }
  }

  // Keep Nexez transaction URLs on the hardened request base. A preferred
  // provider handoff is resolved independently below.
  const baseUrl = getRequestBaseUrl(request)
  const checkoutUrl = `${baseUrl}/checkout/${page.slug}?offer=${offerKey}`
  const successUrl = `${baseUrl}/checkout/${page.slug}/success?session_id={CHECKOUT_SESSION_ID}&offer=${offerKey}`
  const preferredOriginalUrl = getPreferredOriginalOfferUrl(page, offer)
  const forceProviderHandoff = Boolean(preferredOriginalUrl)
  let destination = getOfferDestination(page, offer)
  // Single-use scheduling links: for a Calendly-sourced offer on a page that has
  // connected a PAT, mint a one-time booking link so the reusable public
  // scheduling URL isn't shared/re-bookable from this redirect. Best-effort —
  // falls back to the reusable link (dormant without INTEGRATION_SECRET_KEY).
  // Skipped on a dry run — validation must be side-effect-free (no real link mint).
  if (!input.dryRun) {
    destination = (await maybeMintSingleUseCalendlyLink(page.id, offer, destination)) || destination
  }
  // Multi-currency: the page's currency is the source of truth for what the buyer
  // is charged; the offer price string is just the amount. amountCents is the
  // Stripe smallest-unit amount (×100, or as-is for zero-decimal currencies like JPY).
  const currency = normalizeCurrency(page.currency)
  const amountCents = toStripeAmount(parseMoney(offer.price) ?? 0, currency) || null
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
    },
  })

  // Resolve the owner's plan + Connect account UP FRONT (before the dry-run return
  // too, so the simulator reflects reality). A card charge only ever runs through
  // the owner's Connect account (owner is merchant of record; Nexez takes the plan
  // commission as an application fee). We deliberately do NOT charge into the
  // PLATFORM account for a seller who hasn't connected Stripe - they couldn't
  // receive the funds and it creates a payout / money-transmission liability. No
  // Connect → fall through to the seller's external checkout (destination) or a
  // payments-not-set-up response below. Plan is resolved status-awarely
  // (canceled/incomplete 'pro' ≠ 6%) via the single-source helper.
  let connectAccountId: string | null = null
  let ownerPlanId: Awaited<ReturnType<typeof getOwnerPlanId>> = 'free'
  if (hasSupabaseAdminEnv() && page.owner_id) {
    const admin = createAdminClient()
    // Compatibility hook for an explicit operational suspension. Billing expiry
    // itself falls back to Free and remains orderable.
    if ((await getOwnerBillingState(admin, page.owner_id)).isPaused) {
      return NextResponse.json(
        { error: 'This seller’s storefront is paused and not accepting orders right now.' },
        { status: 402 },
      )
    }
    ownerPlanId = await getOwnerPlanId(admin, page.owner_id)
    const { data: billing } = await admin
      .from('billing_subscriptions')
      .select('stripe_connect_account_id, stripe_connect_charges_enabled')
      .eq('owner_id', page.owner_id)
      .maybeSingle<{ stripe_connect_account_id: string | null; stripe_connect_charges_enabled: boolean | null }>()
    // Only route a charge to a Connect account that can actually ACCEPT one. An
    // owner who created the account but hasn't finished onboarding has an id but
    // charges_enabled !== true - fall through to the external destination instead
    // of creating a dead-end Checkout session that fails at Stripe.
    if (billing?.stripe_connect_account_id && billing.stripe_connect_charges_enabled === true) {
      connectAccountId = billing.stripe_connect_account_id
    }
  }
  const commissionPercent = getCommissionPercentForPlan(ownerPlanId)

  if (input.dryRun) {
    const approval = issueActionApprovalToken('checkout', approvalInput(input as Record<string, unknown>))
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
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      connectReady: Boolean(connectAccountId),
      events: {
        checkoutAttemptLogged: attemptLog.ok,
      },
      approvalTokenRequired: actionApprovalRequired(),
      ...(approval ?? {}),
    })
  }

  // Provider-preferred offers (Shopify imports in particular) must remain on
  // the provider rails. Charging through Stripe here would create no Shopify
  // order and would not update Shopify inventory.
  if (!forceProviderHandoff && process.env.STRIPE_SECRET_KEY && amountCents && connectAccountId) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
      const applicationFeeAmount = calculateApplicationFeeCents(amountCents, commissionPercent)

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
        success_url: successUrl,
        cancel_url: checkoutUrl,
        metadata: {
          nexez_page_id: page.id,
          nexez_page_slug: page.slug,
          nexez_offer_key: offerKey,
          nexez_offer_name: offer.name,
          nexez_source: 'agent_checkout',
          nexez_owner_plan: ownerPlanId,
          nexez_commission_percent: String(commissionPercent),
          // For the checkout_orders record the webhook persists on completion (so a
          // direct sale can be refunded / dispute-tracked in-app).
          nexez_owner_id: page.owner_id ?? '',
          nexez_application_fee_cents: String(applicationFeeAmount || 0),
          // §7 multi-storefront breadcrumb: records which storefront made the sale so
          // finance can attribute per-storefront later. Resolution stays account-pooled.
          nexez_storefront_id: (page as { storefront_id?: string | null }).storefront_id ?? '',
        },
      }

      if (applicationFeeAmount && applicationFeeAmount > 0) {
        // Checkout Sessions take the Connect platform fee under payment_intent_data - NOT at the
        // session top level (top-level application_fee_amount → Stripe "unknown parameter" error,
        // which silently fell back to the provider URL, so no real charge ever happened).
        sessionParams.payment_intent_data = {
          ...(sessionParams.payment_intent_data || {}),
          application_fee_amount: applicationFeeAmount,
        }
      }

      // Declared buyer identity (all optional): prefill + lock Stripe's email field,
      // stamp the buyer-side reference on Stripe's native field, and carry every field
      // in metadata so the webhook can persist it onto the order record.
      if (buyer.email) sessionParams.customer_email = buyer.email
      if (buyer.reference) sessionParams.client_reference_id = buyer.reference
      Object.assign(sessionParams.metadata, buyerMetadata(buyer))

      const stripeIdempotencyKey = idempotency.key
        ? `nexez_checkout_${scopedIdempotencyHash('checkout', page.slug, idempotency.key)}`
        : undefined
      const session = await stripe.checkout.sessions.create(sessionParams, {
        stripeAccount: connectAccountId,
        ...(stripeIdempotencyKey ? { idempotencyKey: stripeIdempotencyKey } : {}),
      })

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
        },
      })

      if (wantsJson) {
        return NextResponse.json({
          url: session.url,
          provider: 'stripe',
          checkoutSessionId: session.id,
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
    buyerEmail: str(formData.get('buyerEmail')),
    buyerName: str(formData.get('buyerName')),
    buyerReference: str(formData.get('buyerReference')),
    buyerAgent: str(formData.get('buyerAgent')),
    approvalToken: str(formData.get('approvalToken')),
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

// Mint a single-use Calendly booking link when the resolved offer is a Calendly
// event type on a page that has connected a PAT. Returns null (→ keep the
// reusable link) for non-Calendly offers, a missing event-type URI, an
// unconfigured credential store, or any Calendly failure. Only reaches the
// network for genuine Calendly offers, so ordinary checkouts pay nothing.
async function maybeMintSingleUseCalendlyLink(
  pageId: string,
  offer: { source?: string; metadata?: Record<string, unknown> | null } | null,
  fallback: string,
): Promise<string | null> {
  if (!offer || offer.source !== 'calendly') return null
  const eventTypeUri = typeof offer.metadata?.calendly_event_type === 'string' ? offer.metadata.calendly_event_type : ''
  if (!eventTypeUri) return null
  if (!integrationCredentialsConfigured()) return null
  const pat = await getCalendlyPat(pageId)
  if (!pat) return null
  const minted = await createCalendlySchedulingLink(pat, eventTypeUri)
  // Never downgrade a working reusable link on failure.
  return minted || fallback
}

function getDryRunProvider(destination: string, amountCents: number | null, connectAccountId: string | null) {
  // Mirror the live path: a Stripe charge requires BOTH a key and the seller's
  // Connect account. Without Connect we fall back to the external link, or report
  // that the seller still needs to connect payouts.
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
  if (wantsJson) {
    return NextResponse.json({ url: destination, provider, events })
  }

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
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString()
    }
  } catch {
    return null
  }

  return null
}
