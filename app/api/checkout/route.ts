import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import {
  AgentPage,
  PUBLIC_PAGE_SELECT,
  getBaseUrl,
  getCheckoutOffer,
  getCheckoutOfferKey,
  getOfferDestination,
  getRequestBaseUrl,
} from '../../../lib/agent-page'
import { parseMoney, toStripeDescription } from '../../../lib/checkout'
import { normalizeCurrency, toStripeAmount } from '../../../lib/currency'
import { getBookingRuleError } from '../../../lib/offer-rules'
import { logCheckoutEvent } from '../../../lib/server/log-checkout-event'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { supabase } from '../../../lib/supabase'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../utils/supabase/admin'
import { getCommissionPercentForPlan, calculateApplicationFeeCents } from '../../../lib/stripe-billing'
import { getOwnerPlanId } from '../../../lib/server/plan'
import { billingPlans } from '../../../lib/billing'

type CheckoutInput = {
  slug: string
  offer: string
  query?: string
  dryRun?: boolean
}

async function getPublishedPage(slug: string) {
  // Checkout enforces owner-private offer `rules` (booking blackouts / max bookings),
  // so read the base table with the service-role client — anon can't read it anymore
  // and the public view strips `rules`. Anon fallback only when no admin env (tests).
  const db = hasSupabaseAdminEnv() ? createAdminClient() : supabase
  const { data } = await db
    .from('pages')
    .select(PUBLIC_PAGE_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()

  return data
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'checkout', 30, 60_000)
  if (limited) return limited

  const contentType = request.headers.get('content-type') || ''
  const wantsJson = contentType.includes('application/json') || request.headers.get('accept')?.includes('application/json')
  const input = await readCheckoutInput(request)

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

  // Smart Rules: calendar protection (Phase 1) — weekly booking cap + blackout
  // dates. Counting booked events needs the service-role client (events are
  // owner-only under RLS); when it's unavailable the cap is skipped gracefully.
  if (!input.dryRun && offer.rules && (offer.rules.maxBookingsPerWeek != null || offer.rules.blackoutDates?.length)) {
    let recentBookingsThisWeek = 0
    if (offer.rules.maxBookingsPerWeek != null && hasSupabaseAdminEnv()) {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { count } = await createAdminClient()
        .from('checkout_events')
        .select('id', { count: 'exact', head: true })
        .eq('slug', page.slug)
        .eq('offer_key', offerKey)
        .in('event_type', ['stripe_session_created', 'provider_redirect'])
        .gte('created_at', weekAgo)
      recentBookingsThisWeek = count ?? 0
    }
    const ruleError = getBookingRuleError(offer, { recentBookingsThisWeek })
    if (ruleError) {
      return NextResponse.json({ error: ruleError, code: 'booking_rules' }, { status: 409 })
    }
  }

  const baseUrl = getRequestBaseUrl(request)
  const checkoutUrl = `${baseUrl}/checkout/${page.slug}?offer=${offerKey}`
  const successUrl = `${baseUrl}/checkout/${page.slug}/success?session_id={CHECKOUT_SESSION_ID}&offer=${offerKey}`
  const destination = getOfferDestination(page, offer)
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
    },
  })

  if (input.dryRun) {
    return NextResponse.json({
      ok: true,
      provider: getDryRunProvider(destination, amountCents),
      checkoutUrl,
      actionUrl: destination || null,
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      events: {
        checkoutAttemptLogged: attemptLog.ok,
      },
    })
  }

  // Resolve the owner's plan + Connect account UP FRONT. A card charge only ever
  // runs through the owner's Connect account (owner is merchant of record; Nexez
  // takes the plan commission as an application fee). We deliberately do NOT charge
  // into the PLATFORM account for a seller who hasn't connected Stripe — they
  // couldn't receive the funds and it creates a payout / money-transmission
  // liability. No Connect → fall through to the seller's external checkout
  // (destination) or a payments-not-set-up response below. Plan is resolved
  // status-awarely (canceled/incomplete 'pro' ≠ 6%) via the single-source helper.
  let connectAccountId: string | null = null
  let ownerPlanId: Awaited<ReturnType<typeof getOwnerPlanId>> = 'free'
  if (hasSupabaseAdminEnv() && page.owner_id) {
    const admin = createAdminClient()
    ownerPlanId = await getOwnerPlanId(admin, page.owner_id)
    const { data: billing } = await admin
      .from('billing_subscriptions')
      .select('stripe_connect_account_id')
      .eq('owner_id', page.owner_id)
      .maybeSingle<{ stripe_connect_account_id: string | null }>()
    if (billing?.stripe_connect_account_id) connectAccountId = billing.stripe_connect_account_id
  }
  const commissionPercent = getCommissionPercentForPlan(ownerPlanId)

  if (process.env.STRIPE_SECRET_KEY && amountCents && connectAccountId) {
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
        },
      }

      if (applicationFeeAmount && applicationFeeAmount > 0) {
        sessionParams.application_fee_amount = applicationFeeAmount
      }

      const session = await stripe.checkout.sessions.create(sessionParams, { stripeAccount: connectAccountId })

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
    const redirectLog = await logCheckoutEvent({
      page,
      offer,
      eventType: process.env.STRIPE_SECRET_KEY ? 'stripe_missing_config' : 'provider_redirect',
      userAgent,
      referrer,
      query: input.query || null,
      checkoutUrl,
      providerUrl: destination,
      metadata: {
        amount_cents: amountCents,
        stripe_configured: Boolean(process.env.STRIPE_SECRET_KEY),
      },
    })

    return respondWithDestination(wantsJson, destination, process.env.STRIPE_SECRET_KEY ? 'stripe_missing_price' : 'provider_redirect', {
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

  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}))
    return {
      slug: String(body.slug || ''),
      offer: String(body.offer || ''),
      query: body.query ? String(body.query) : undefined,
      dryRun: Boolean(body.dryRun),
    }
  }

  const formData = await request.formData()

  return {
    slug: String(formData.get('slug') || ''),
    offer: String(formData.get('offer') || ''),
    query: formData.get('query') ? String(formData.get('query')) : undefined,
    dryRun: formData.get('dryRun') === 'true',
  }
}

function getDryRunProvider(destination: string, amountCents: number | null) {
  if (process.env.STRIPE_SECRET_KEY && amountCents) return 'stripe_ready'
  if (destination) return 'provider_ready'
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
