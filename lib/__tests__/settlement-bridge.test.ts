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
import { calculateApplicationFeeCents } from '../stripe-billing'

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
    commissionPercent: 10,
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

describe('settlement bridge — happy path', () => {
  it('charges the session total to the connected account with the platform fee', async () => {
    const stripe = fakeStripe()
    const result = await createSettlementBridge(stripe)(readySession(), PAYMENT, baseContext())

    expect(result).toEqual({
      ok: true,
      paymentIntentId: 'pi_success',
      amount: 120000,
      applicationFee: calculateApplicationFeeCents(120000, 10),
      currency: 'usd',
      livemode: false,
    })
    expect(result.ok && result.applicationFee).toBe(12000) // 10% of 120000

    expect(stripe.calls).toHaveLength(1)
    const { params, options } = stripe.calls[0]
    expect(params.amount).toBe(120000)
    expect(params.currency).toBe('usd')
    expect(params.payment_method).toBe('pm_card_visa')
    expect(params.confirm).toBe(true)
    expect(params.off_session).toBe(true)
    expect(params.application_fee_amount).toBe(12000)
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
    expect(md.nexez_commission_percent).toBe('10')
    expect(md.nexez_application_fee_cents).toBe('12000')
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
    const result = await createSettlementBridge(stripe)(readySession(), PAYMENT, baseContext({ commissionPercent: 0 }))
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
      commissionPercent: 10,
      metadata: {
        nexez_source: 'acp',
        // A buggy/hostile adapter trying to falsify the recorded fee + owner.
        nexez_application_fee_cents: '1',
        nexez_owner_id: 'attacker',
      },
    }))
    const md = stripe.calls[0].params.metadata
    expect(md.nexez_source).toBe('acp') // adapter-only key survives
    expect(md.nexez_application_fee_cents).toBe('12000') // money-core wins
    expect(md.nexez_owner_id).toBe('owner_1') // money-core wins
  })

  it('accepts a manual-capture authorization (requires_capture)', async () => {
    const stripe = fakeStripe(() => ({ id: 'pi_auth', status: 'requires_capture', livemode: false }))
    const result = await createSettlementBridge(stripe)(readySession(), PAYMENT, baseContext())
    expect(result).toMatchObject({ ok: true, paymentIntentId: 'pi_auth' })
  })
})

describe('settlement bridge — guards (never charge)', () => {
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

describe('settlement bridge — Stripe failures', () => {
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
  const single = (data: unknown) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) }),
  })
  return {
    from: (table: string) => {
      if (table === 'platform_admins') return single(opts.platformAdmin ? { user_id: 'owner_1' } : null)
      if (table === 'billing_subscriptions') return single(opts.sub ?? null)
      return single(null)
    },
  } as any
}

describe('resolveSettlementContext — lifted account gates', () => {
  const CONNECTED = {
    plan_id: 'pro',
    status: 'active',
    trial_ends_at: null,
    account_origin: 'legacy',
    stripe_connect_account_id: 'acct_seller',
    stripe_connect_charges_enabled: true,
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

  it('blocks a paused (expired trial-origin) seller before any charge', async () => {
    const res = await resolveSettlementContext(
      fakeAdmin({ sub: { ...CONNECTED, status: 'paused', account_origin: 'trial' } }),
      { pageId: 'page_1', ownerId: 'owner_1' },
    )
    expect(res).toMatchObject({ ok: false, code: 'paused' })
  })

  it('blocks a seller whose Connect account cannot accept charges', async () => {
    const res = await resolveSettlementContext(
      fakeAdmin({ sub: { ...CONNECTED, stripe_connect_charges_enabled: false } }),
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
