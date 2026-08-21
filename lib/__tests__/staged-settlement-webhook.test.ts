import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { stagedObligationMatchesCheckout } from '../server/staged-settlement-webhook'

const agreement = {
  id: 'agreement-1',
  owner_id: 'owner-1',
  page_id: 'page-1',
  slug: 'project',
  offer_key: 'services:0',
  offer_name: 'Project',
  status: 'pending',
  contract_fingerprint: 'a'.repeat(64),
  currency: 'usd',
  stripe_connect_account_id: 'acct_1',
  commission_bps: 500,
  plan_id_at_purchase: 'free',
  commission_source: 'plan_default',
  buyer_email: null,
  buyer_name: null,
  buyer_reference: null,
  buyer_agent: null,
}

const obligation = {
  id: 'obligation-1',
  agreement_id: 'agreement-1',
  stage_id: 'deposit',
  stage_order: 1,
  label: 'Booking installment',
  amount_cents: 3000,
  status: 'payment_pending',
  approval_fingerprint: 'b'.repeat(64),
  stripe_checkout_session_id: 'cs_1',
  stripe_payment_intent_id: null,
  application_fee_cents: 150,
}

function session(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_1',
    object: 'checkout.session',
    payment_status: 'paid',
    amount_total: 3000,
    currency: 'usd',
    payment_intent: 'pi_1',
    metadata: {
      nexez_kind: 'staged_settlement',
      nexez_staged_settlement_id: 'agreement-1',
      nexez_staged_obligation_id: 'obligation-1',
      nexez_staged_stage_id: 'deposit',
      nexez_staged_contract_fingerprint: 'a'.repeat(64),
      nexez_staged_approval_fingerprint: 'b'.repeat(64),
    },
    ...overrides,
  } as Stripe.Checkout.Session
}

describe('staged settlement webhook provenance', () => {
  it('accepts only the exact connected account, contract, obligation, approval, and money', () => {
    expect(stagedObligationMatchesCheckout({ agreement, obligation, session: session(), account: 'acct_1' })).toBe(true)
    expect(stagedObligationMatchesCheckout({ agreement, obligation, session: session({ amount_total: 10_000 }), account: 'acct_1' })).toBe(false)
    expect(stagedObligationMatchesCheckout({ agreement, obligation, session: session({ currency: 'eur' }), account: 'acct_1' })).toBe(false)
    expect(stagedObligationMatchesCheckout({ agreement, obligation, session: session(), account: 'acct_other' })).toBe(false)
    expect(stagedObligationMatchesCheckout({
      agreement,
      obligation,
      session: session({ metadata: { ...session().metadata, nexez_staged_approval_fingerprint: 'c'.repeat(64) } }),
      account: 'acct_1',
    })).toBe(false)
  })

  it('accepts an idempotent paid replay only for the same PaymentIntent', () => {
    expect(stagedObligationMatchesCheckout({
      agreement,
      obligation: { ...obligation, status: 'paid', stripe_payment_intent_id: 'pi_1' },
      session: session(),
      account: 'acct_1',
    })).toBe(true)
    expect(stagedObligationMatchesCheckout({
      agreement,
      obligation: { ...obligation, status: 'paid', stripe_payment_intent_id: 'pi_other' },
      session: session(),
      account: 'acct_1',
    })).toBe(false)
  })
})
