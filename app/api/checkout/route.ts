import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import {
  AgentPage,
  PUBLIC_PAGE_SELECT,
  getBaseUrl,
  getCheckoutOffer,
  getCheckoutOfferKey,
  getOfferDestination,
} from '../../../lib/agent-page'
import { parseMoneyCents, toStripeDescription } from '../../../lib/checkout'
import { logCheckoutEvent } from '../../../lib/checkout-events'
import { supabase } from '../../../lib/supabase'

type CheckoutInput = {
  slug: string
  offer: string
  query?: string
  dryRun?: boolean
}

async function getPublishedPage(slug: string) {
  const { data } = await supabase
    .from('pages')
    .select(PUBLIC_PAGE_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()

  return data
}

export async function POST(request: Request) {
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
  const checkoutUrl = `${getBaseUrl()}/checkout/${page.slug}?offer=${offerKey}`
  const successUrl = `${getBaseUrl()}/checkout/${page.slug}/success?session_id={CHECKOUT_SESSION_ID}&offer=${offerKey}`
  const destination = getOfferDestination(page, offer)
  const amountCents = parseMoneyCents(offer.price)
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

  if (process.env.STRIPE_SECRET_KEY && amountCents) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'usd',
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
        },
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
