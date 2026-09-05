import Stripe from 'stripe'
import { NextRequest } from 'next/server'
import { GET as legacyGET, POST as legacyPOST } from './legacy'
import {
  handleServiceAgreementStripeEvent,
  isServiceAgreementStripeEvent,
} from '../../../../lib/server/service-agreement-webhook'
import {
  handleStagedSettlementStripeEvent,
  isStagedSettlementStripeEvent,
} from '../../../../lib/server/staged-settlement-webhook'
import {
  handleReservableResourceStripeEvent,
  isReservableResourceStripeEvent,
} from '../../../../lib/server/reservable-resource-webhook'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'placeholder')
const SERVICE_AGREEMENT_MARKER_RE = /"nexez_kind"\s*:\s*"service_agreement"/
const STAGED_SETTLEMENT_MARKER_RE = /"nexez_kind"\s*:\s*"staged_settlement"/
const RESERVABLE_RESOURCE_MARKER_RE = /"nexez_kind"\s*:\s*"reservable_resource"/

function webhookSecrets(): string[] {
  return [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_WEBHOOK_SECRET_CONNECT]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(',').map((part) => part.trim()).filter(Boolean))
}

/**
 * Thin commerce dispatcher in front of the legacy Stripe webhook.
 *
 * The clone-only raw-body check is a routing prefilter, NOT an authorization
 * decision. Ordinary events delegate immediately so the legacy handler remains
 * the single signature-verification path. A payload that claims service-agreement
 * provenance is verified here with the configured webhook secrets before any
 * recurring-commerce handler receives a parsed Stripe event.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.clone().text()
  if (
    !SERVICE_AGREEMENT_MARKER_RE.test(rawBody)
    && !STAGED_SETTLEMENT_MARKER_RE.test(rawBody)
    && !RESERVABLE_RESOURCE_MARKER_RE.test(rawBody)
  ) {
    return legacyPOST(request)
  }

  const signature = request.headers.get('stripe-signature')
  const secrets = webhookSecrets()
  if (!signature || !secrets.length) return legacyPOST(request)

  let event: Stripe.Event | null = null
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret)
      break
    } catch {
      // If no secret verifies, delegate to the legacy handler so it emits
      // the canonical legacy signature/configuration response.
    }
  }

  if (!event) return legacyPOST(request)
  if (isServiceAgreementStripeEvent(event)) return handleServiceAgreementStripeEvent(event, stripe)
  if (isStagedSettlementStripeEvent(event)) return handleStagedSettlementStripeEvent(event)
  if (isReservableResourceStripeEvent(event)) return handleReservableResourceStripeEvent(event)
  return legacyPOST(request)
}

export const GET = legacyGET

// Shorter than the database processing lease, so an abandoned worker expires first.
export const maxDuration = 60
