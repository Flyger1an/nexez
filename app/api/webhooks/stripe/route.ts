import Stripe from 'stripe'
import { NextRequest } from 'next/server'
import { GET as legacyGET, POST as legacyPOST } from './legacy'
import {
  handleServiceAgreementStripeEvent,
  isServiceAgreementStripeEvent,
} from '../../../../lib/server/service-agreement-webhook'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'placeholder')

function webhookSecrets(): string[] {
  return [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_WEBHOOK_SECRET_CONNECT]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(',').map((part) => part.trim()).filter(Boolean))
}

/**
 * Thin commerce dispatcher in front of the byte-preserved legacy Stripe webhook.
 *
 * Service-agreement subscriptions are connected-account commerce events and need
 * a different ledger from Nexez SaaS billing. We verify the signature here using
 * the same configured secret set and intercept ONLY events carrying the immutable
 * `nexez_kind=service_agreement` provenance. Every other event is delegated to the
 * previous handler with the original unread Request object.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature')
  const secrets = webhookSecrets()
  if (!signature || !secrets.length) return legacyPOST(request)

  const rawBody = await request.clone().text()
  let event: Stripe.Event | null = null
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret)
      break
    } catch {
      // Let the byte-preserved legacy handler return the canonical signature
      // error when no configured secret verifies this request.
    }
  }

  if (!event || !isServiceAgreementStripeEvent(event)) return legacyPOST(request)
  return handleServiceAgreementStripeEvent(event, stripe)
}

export const GET = legacyGET
