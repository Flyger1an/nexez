import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import {
  isServiceAgreementStripeEvent,
  recurringOccurrenceMatchesInvoice,
} from '../server/service-agreement-webhook'

function stripeEvent(type: Stripe.Event.Type, object: unknown, account = 'acct_test'): Stripe.Event {
  return {
    id: 'evt_test',
    object: 'event',
    api_version: null,
    created: 1,
    data: { object } as Stripe.Event.Data,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type,
    account,
  } as Stripe.Event
}

describe('service agreement webhook provenance', () => {
  it('intercepts only explicitly marked recurring commerce events', () => {
    const recurring = stripeEvent('checkout.session.completed', {
      metadata: { nexez_kind: 'service_agreement' },
    })
    const ordinary = stripeEvent('checkout.session.completed', {
      metadata: { nexez_source: 'checkout' },
    })

    expect(isServiceAgreementStripeEvent(recurring)).toBe(true)
    expect(isServiceAgreementStripeEvent(ordinary)).toBe(false)
  })

  it('recognizes subscription metadata snapshotted onto invoice parent details', () => {
    const invoice = stripeEvent('invoice.paid', {
      parent: {
        subscription_details: {
          metadata: { nexez_kind: 'service_agreement' },
        },
      },
    })
    expect(isServiceAgreementStripeEvent(invoice)).toBe(true)
  })

  it('accepts an order conflict as an idempotent replay only when all payment provenance matches', () => {
    const existing = {
      service_agreement_id: 'agreement-1',
      stripe_payment_intent_id: 'pi_1',
      amount_cents: 12000,
      currency: 'usd',
    }
    const expected = {
      agreementId: 'agreement-1',
      paymentIntentId: 'pi_1',
      amount: 12000,
      currency: 'usd',
    }

    expect(recurringOccurrenceMatchesInvoice(existing, expected)).toBe(true)
    expect(recurringOccurrenceMatchesInvoice({ ...existing, amount_cents: 13000 }, expected)).toBe(false)
    expect(recurringOccurrenceMatchesInvoice({ ...existing, service_agreement_id: 'agreement-2' }, expected)).toBe(false)
    expect(recurringOccurrenceMatchesInvoice({ ...existing, stripe_payment_intent_id: 'pi_other' }, expected)).toBe(false)
    expect(recurringOccurrenceMatchesInvoice(null, expected)).toBe(false)
  })
})
