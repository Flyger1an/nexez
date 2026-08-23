import { describe, expect, it } from 'vitest'
import { createSettlementBridge, resolveSettlementContext, type SettlementStripe } from '../commerce/settlement-bridge'
import {
  createSession,
  type CheckoutSession,
  type DelegatedPayment,
  type SettlementContext,
  type SessionPage,
} from '../commerce/checkout-session-core'
import type { OfferItem } from '../agent-page'
import { calculateApplicationFeeCentsFromBps } from '../stripe-billing'

function offer(partial: Partial<OfferItem> & { name: string; price: string }): OfferItem {
  return { description: '', url: '', ...partial }
}

function makePage(overrides: Partial<SessionPage> = {}): SessionPage {
  return {
    slug: 'acme',
    name: 'Acme Studio',
    currency: 'usd',
    services: [offer({ name: 'Strategy Session', price: '$1,200' })],
    products: [offer({ name: 'Brand Kit', price: '$450' })],
    ...overrides,
  }
}

function readySession(items = [{ offer: 'services-0' }], buyer?: CheckoutSession['buyer']): CheckoutSession {
  return createSession({ id: 'sess_1', page: makePage(), items, buyer })
}

const PAYMENT: DelegatedPayment = { token: 'pm_card_visa', kind: 'payment_method' }

function baseContext(overrides: Partial<SettlementContext> = {}): SettlementContext {
  return {
    pageId: 'page_1',
    ownerId: 'owner_1',
    connectAccountId: 'acct_seller',
    planId: 'free',
    commissionBps: 900,
    commissionPercent: 9,
    commissionSource: 'plan_default',
    ...overrides,
  }
}

/** Records every create() call so tests can assert the exact Stripe params. */
function fakeStripe(impl?: (params: any, options: any) => any) {
  const calls: Array<{ params: any; options: any }> = []
  const stripe: SettlementStripe & { calls: typeof calls } = {
    calls,
    paymentIntents: {
      create: (async (params: any, options: any) => {
        calls.push({ params, options })
        return impl ? impl(params, options) : { id: 'pi_success', status: 'succeeded', livemode: false }
      }) as any,
    },
  }
  return stripe
}

describe('settlement bridge - happy path', () => {
  it.each([
    ['free', 900, 10800],
    ['launch', 700, 8400],
    ['pro', 500, 6000],
    ['scale', 300, 3600],
    ['enterprise', 200, 2400],
  ] as const)('uses %s economics identically for ACP and UCP', async (planId, commissionBps, expectedFee) => {
    for (const channel of ['acp', 'ucp'] as const) {
      const stripe = fakeStripe()
      const result = await createSettlementBridge(stripe)(
        readySession(),
        PAYMENT,
        baseContext({
          planId,
          commissionBps,
          commissionPercent: commissionBps / 100,
          commissionSource: 'plan_default',
          metadata: { nexez_source: channel },
        }),
      )
      expect(result).toMatchObject({ ok: true, applicationFee: expectedFee })
      expect(stripe.calls[0].params.application_fee_amount).toBe(expectedFee)
      expect(stripe.calls[0].params.metadata).toMatchObject({
        nexez_source: channel,
        nexez_owner_plan: planId,
        nexez_commission_bps: String(commissionBps),
        nexez_application_fee_cents: String(expectedFee),
      })
    }
  })

  it('charges the session total to the connected account with the platform fee', async () => {
    const stripe = fakeStripe()
    const result = await createSettlementBridge(stripe)(readySession(), PAYMENT, baseContext())

    expect(result).toEqual({
      ok: true,
      paymentIntentId: 'pi_success',
      amount: 120000,
      applicationFee: calculateApplicationFeeCentsFromBps(120000, 900),
      currency: 'usd',
      livemode: false,
    })
    expect(result.ok && result.applicationFee).toBe(10800) // 9% of 120000

    expect(stripe.calls).toHaveLength(1)
    const { params, options } = stripe.calls[0]
    expect(params.amount).toBe(120000)
    expect(params.currency).toBe('usd')
    expect(params.payment_method).toBe('pm_card_visa')
    expect(params.confirm).toBe(true)
    expect(params.off_session).toBe(true)
    expect(params.application_fee_amount).toBe(10800)
    // Direct charge on the seller's connected account.
    expect(options.stripeAccount).toBe('acct_seller')
  })

  it('stamps the money-core metadata the webhook reads to persist an order', async () => {
    const stripe = fakeStripe()
    await createSettlementBridge(stripe)(
      readySession([{ offer: 'services-0' }], { email: 'BUYER@X.com', name: 'Dana', agent: 'nexie' }),
      PAYMENT,
      baseContext({ metadata: { nexez_source: 'acp', nexez_acp_order: 'ord_9' } }),
    )
    const md = stripe.calls[0].params.metadata
    expect(md.nexez_page_id).toBe('page_1')
    expect(md.nexez_page_slug).toBe('acme')
    expect(md.nexez_owner_id).toBe('owner_1')
    expect(md.nexez_session_id).toBe('sess_1')
    expect(md.nexez_offer_key).toBe('services-0')
    expect(md.nexez_offer_name).toBe('Strategy Session')
    expect(md.nexez_owner_plan).toBe('free')
    expect(md.nexez_commission_bps).toBe('900')
    expect(md.nexez_commission_percent).toBe('9')
    expect(md.nexez_commission_source).toBe('plan_default')
    expect(md.nexez_application_fee_cents).toBe('10800')
    // Buyer email is lowercased for the order-portal lookup.
    expect(md.nexez_buyer_email).toBe('buyer@x.com')
    expect(md.nexez_buyer_name).toBe('Dana')
    expect(md.nexez_buyer_agent).toBe('nexie')
    // Adapter-supplied channel labelling is merged in.
    expect(md.nexez_source).toBe('acp')
    expect(md.nexez_acp_order).toBe('ord_9')
  })

  it('denormalizes a multi-line cart into the single offer_key/offer_name columns', async () => {
    const stripe = fakeStripe()
    await createSettlementBridge(stripe)(
      readySession([{ offer: 'services-0' }, { offer: 'products-0' }]),
      PAYMENT,
      baseContext(),
    )
    const md = stripe.calls[0].params.metadata
    expect(md.nexez_offer_key).toBe('services-0,products-0')
    expect(md.nexez_offer_name).toBe('Strategy Session, Brand Kit')
  })

  it('omits application_fee_amount when commission is 0', async () => {
    const stripe = fakeStripe()
    const result = await createSettlementBridge(stripe)(readySession(), PAYMENT, baseContext({ commissionBps: 0, commissionPercent: 0 }))
    expect('application_fee_amount' in stripe.calls[0].params).toBe(false)
    expect(result.ok && result.applicationFee).toBe(0)
  })

  it('is idempotent by default (session-derived key), overridable by the seam', async () => {
    // An explicit key from SF5 wins.
    const withKey = fakeStripe()
    await createSettlementBridge(withKey)(readySession(), PAYMENT, baseContext({ idempotencyKey: 'nz_sess_1' }))
    expect(withKey.calls[0].options.idempotencyKey).toBe('nz_sess_1')

    // Absent a key, a stable one is derived from the session id so a retry can't
    // double-charge.
    const withoutKey = fakeStripe()
    await createSettlementBridge(withoutKey)(readySession(), PAYMENT, baseContext())
    expect(withoutKey.calls[0].options.idempotencyKey).toBe('nz_settle_sess_1')
  })

  it('never lets adapter metadata override a money-core key', async () => {
    const stripe = fakeStripe()
    await createSettlementBridge(stripe)(readySession(), PAYMENT, baseContext({
      commissionBps: 900,
      commissionPercent: 9,
      metadata: {
        nexez_source: 'acp',
        // A buggy/hostile adapter trying to falsify the recorded fee + owner.
        nexez_application_fee_cents: '1',
        nexez_owner_id: 'attacker',
      },
    }))
    const md = stripe.calls[0].params.metadata
    expect(md.nexez_source).toBe('acp') // adapter-only key survives
    expect(md.nexez_application_fee_cents).toBe('10800') // money-core wins
    expect(md.nexez_owner_id).toBe('owner_1') // money-core wins
  })

  it('accepts a manual-capture authorization (requires_capture)', async () => {
    const stripe = fakeStripe(() => ({ id: 'pi_auth', status: 'requires_capture', livemode: false }))
    const result = await createSettlementBridge(stripe)(readySession(), PAYMENT, baseContext())
    expect(result).toMatchObject({ ok: true, paymentIntentId: 'pi_auth' })
  })
})

describe('settlement bridge - guards (never charge)', () => {
  it('refuses a not-ready session and never calls Stripe', async () => {
    const stripe = fakeStripe()
    // A negotiable offer keeps the session pending.
    const pending = createSession({
      id: 'sess_p',
      page: makePage({ products: [offer({ name: 'Neg', price: '$99', offerType: 'negotiable' })] }),
      items: [{ offer: 'products-0' }],
    })
    const result = await createSettlementBridge(stripe)(pending, PAYMENT, baseContext())
    expect(result).toMatchObject({ ok: false, code: 'not_ready' })
    expect(stripe.calls).toHaveLength(0)
  })

  it('refuses a zero-total session', async () => {
    const stripe = fakeStripe()
    const zero: CheckoutSession = { ...readySession(), totals: { currency: 'usd', subtotal: 0, tax: 0, total: 0 } }
    const result = await createSettlementBridge(stripe)(zero, PAYMENT, baseContext())
    expect(result).toMatchObject({ ok: false, code: 'zero_amount' })
    expect(stripe.calls).toHaveLength(0)
  })

  it('refuses when the seller has no connected account', async () => {
    const stripe = fakeStripe()
    const result = await createSettlementBridge(stripe)(readySession(), PAYMENT, baseContext({ connectAccountId: '' }))
    expect(result).toMatchObject({ ok: false, code: 'no_connect' })
    expect(stripe.calls).toHaveLength(0)
  })
})

describe('settlement bridge - Stripe failures', () => {
  it('maps a thrown Stripe error to stripe_error with its message', async () => {
    const stripe = fakeStripe(() => {
      throw new Error('card_declined')
    })
    const result = await createSettlementBridge(stripe)(readySession(), PAYMENT, baseContext())
    expect(result).toEqual({ ok: false, code: 'stripe_error', message: 'card_declined' })
  })

  it('treats a non-settleable PaymentIntent status as an error', async () => {
    const stripe = fakeStripe(() => ({ id: 'pi_3ds', status: 'requires_action' }))
    const result = await createSettlementBridge(stripe)(readySession(), PAYMENT, baseContext())
    expect(result).toMatchObject({ ok: false, code: 'stripe_error' })
    expect(result.ok === false && result.message).toMatch(/requires_action/)
  })
})

/** A structural service-role client that drives the REAL plan helpers
 * (getOwnerBillingState / getOwnerPlanId both read via `.from(...).select().eq().maybeSingle()`)
 * plus the resolver's own connect query - no vi.mock needed. */
function fakeAdmin(opts: { platformAdmin?: boolean; sub?: Record<string, unknown> | null }) {
  const single = (data: unknown) => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      lte: () => builder,
      gt: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({ data, error: null }),
    }
    return builder
  }
  return {
    from: (table: string) => {
      if (table === 'platform_admins') return single(opts.platformAdmin ? { user_id: 'owner_1' } : null)
      if (table === 'billing_subscriptions') return single(opts.sub ?? null)
      return single(null)
    },
  } as any
}

describe('resolveSettlementContext - lifted account gates', () => {
  const CONNECTED = {
    plan_id: 'pro',
    status: 'active',
    trial_ends_at: null,
    account_origin: 'legacy',
    stripe_connect_account_id: 'acct_seller',
    stripe_connect_charges_enabled: true,
    stripe_connect_payouts_enabled: true,
  }

  it('resolves a live, connected seller to a ready context with the plan commission', async () => {
    const res = await resolveSettlementContext(fakeAdmin({ sub: CONNECTED }), {
      pageId: 'page_1',
      ownerId: 'owner_1',
      metadata: { nexez_source: 'acp' },
    })
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('expected ok')
    expect(res.context.connectAccountId).toBe('acct_seller')
    expect(res.context.pageId).toBe('page_1')
    expect(res.context.metadata).toEqual({ nexez_source: 'acp' })
    // Pro plan commission is resolved from the real billing config (not hardcoded).
    expect(res.context.commissionPercent).toBeTypeOf('number')
  })

  it('uses the Free commission after a paid-plan trial expires', async () => {
    const res = await resolveSettlementContext(
      fakeAdmin({ sub: { ...CONNECTED, status: 'paused', account_origin: 'trial' } }),
      { pageId: 'page_1', ownerId: 'owner_1' },
    )
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('expected Free fallback context')
    expect(res.context.commissionPercent).toBe(9)
  })

  it('blocks a seller whose Connect account cannot accept charges', async () => {
    const res = await resolveSettlementContext(
      fakeAdmin({ sub: { ...CONNECTED, stripe_connect_charges_enabled: false } }),
      { pageId: 'page_1', ownerId: 'owner_1' },
    )
    expect(res).toMatchObject({ ok: false, code: 'no_connect' })
  })

  it('blocks a seller whose Connect account cannot receive payouts', async () => {
    const res = await resolveSettlementContext(
      fakeAdmin({ sub: { ...CONNECTED, stripe_connect_payouts_enabled: false } }),
      { pageId: 'page_1', ownerId: 'owner_1' },
    )
    expect(res).toMatchObject({ ok: false, code: 'no_connect' })
  })

  it('blocks a seller with no Connect account at all', async () => {
    const res = await resolveSettlementContext(
      fakeAdmin({ sub: { ...CONNECTED, stripe_connect_account_id: null } }),
      { pageId: 'page_1', ownerId: 'owner_1' },
    )
    expect(res).toMatchObject({ ok: false, code: 'no_connect' })
  })

  it('blocks when there is no owner', async () => {
    const res = await resolveSettlementContext(fakeAdmin({ sub: null }), { pageId: 'page_1', ownerId: null })
    expect(res).toMatchObject({ ok: false, code: 'no_connect' })
  })
})

// ---------------------------------------------------------------------------
// Credential kinds. Each protocol hands over a different sort of credential and
// Stripe charges each through a different parameter; the bridge used to send all
// three as `payment_method`, which only ever worked because the end-to-end runs
// fed a raw Stripe PaymentMethod id through the protocol's credential field.
// ---------------------------------------------------------------------------

describe('settlement bridge - delegated credential kinds', () => {
  it('charges a raw PaymentMethod id directly, off_session', async () => {
    const stripe = fakeStripe()
    const res = await createSettlementBridge(stripe)(readySession(), { token: 'pm_card_visa', kind: 'payment_method' }, baseContext())
    expect(res.ok).toBe(true)
    const { params } = stripe.calls[0]
    expect(params.payment_method).toBe('pm_card_visa')
    expect(params.off_session).toBe(true)
    expect(params.payment_method_data).toBeUndefined()
  })

  // Per Stripe's docs the SPT rides payment_method_data[shared_payment_granted_token];
  // Stripe clones the customer's underlying method and sets payment_method itself.
  it('sends an ACP shared payment token as payment_method_data, not payment_method', async () => {
    const stripe = fakeStripe()
    const res = await createSettlementBridge(stripe)(readySession(), { token: 'spt_123', kind: 'shared_payment_token' }, baseContext())
    expect(res.ok).toBe(true)
    const { params, options } = stripe.calls[0]
    expect(params.payment_method_data).toEqual({ shared_payment_granted_token: 'spt_123' })
    expect(params.payment_method).toBeUndefined()
    // The delegation is the mandate; the documented sample sends no off_session.
    expect(params.off_session).toBeUndefined()
    // Preview-gated parameter needs its preview API version.
    expect(options.apiVersion).toBe('2026-04-22.preview')
    // Still a direct charge on the seller's account with the platform fee.
    expect(options.stripeAccount).toBe('acct_seller')
    expect(params.application_fee_amount).toBe(10800)
  })

  it('does not pin a preview API version for ordinary PaymentMethod charges', async () => {
    const stripe = fakeStripe()
    await createSettlementBridge(stripe)(readySession(), { token: 'pm_card_visa', kind: 'payment_method' }, baseContext())
    expect(stripe.calls[0].options.apiVersion).toBeUndefined()
  })

  it('refuses a Google Pay credential without calling Stripe', async () => {
    const stripe = fakeStripe()
    const res = await createSettlementBridge(stripe)(readySession(), { token: 'ECv2_payload', kind: 'google_pay' }, baseContext())
    expect(res).toMatchObject({ ok: false, code: 'unsupported_credential' })
    expect(stripe.calls).toHaveLength(0)
  })

  it('fails closed on an unrecognized kind rather than guessing a parameter', async () => {
    const stripe = fakeStripe()
    const res = await createSettlementBridge(stripe)(readySession(), { token: 'x', kind: 'wire_transfer' } as any, baseContext())
    expect(res).toMatchObject({ ok: false, code: 'unsupported_credential' })
    expect(stripe.calls).toHaveLength(0)
  })

  // The credential check runs after the readiness/amount/connect gates, so a
  // refusal never masks a more fundamental reason not to charge.
  it('still reports no_connect ahead of an unsupported credential', async () => {
    const stripe = fakeStripe()
    const res = await createSettlementBridge(stripe)(
      readySession(),
      { token: 'ECv2_payload', kind: 'google_pay' },
      baseContext({ connectAccountId: '' }),
    )
    expect(res).toMatchObject({ ok: false, code: 'no_connect' })
  })
})
