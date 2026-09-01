import { describe, expect, it } from 'vitest'
import {
  createSession,
  updateSession,
  cancelSession,
  markSessionCompleted,
  isSessionPayable,
  cartFingerprint,
  checkApprovalDrift,
  MAX_LINE_QUANTITY,
  type SessionPage,
} from '../commerce/checkout-session-core'
import type { OfferItem } from '../agent-page'
import { normalizeCurrency, toStripeAmount } from '../currency'
import { parseMoney } from '../checkout'

function offer(partial: Partial<OfferItem> & { name: string; price: string }): OfferItem {
  return { description: '', url: '', ...partial }
}

function makePage(overrides: Partial<SessionPage> = {}): SessionPage {
  return {
    slug: 'acme',
    name: 'Acme Studio',
    currency: 'usd',
    services: [
      offer({ name: 'Strategy Session', price: '$1,200', description: 'A deep-dive.' }),
      offer({ name: 'Retainer', price: 'Custom quote' }), // unpriced
    ],
    products: [
      offer({ name: 'Brand Kit', price: '$450' }),
      offer({ name: 'Negotiable Logo', price: '$2,000', offerType: 'negotiable' }),
      offer({ name: 'Sold Out Poster', price: '$40', availability: 'sold_out' }),
      offer({ name: 'Limited Print', price: '$80', availability: 'limited' }),
    ],
    ...overrides,
  }
}

describe('createSession - resolution + pricing parity', () => {
  it('resolves a fixed service to a ready, correctly-priced session', () => {
    const s = createSession({ id: 'sess_1', page: makePage(), items: [{ offer: 'services-0' }] })
    expect(s.status).toBe('ready')
    expect(isSessionPayable(s)).toBe(true)
    expect(s.issues).toEqual([])
    expect(s.lineItems).toHaveLength(1)
    const li = s.lineItems[0]
    expect(li.offerKey).toBe('services-0')
    expect(li.name).toBe('Strategy Session')
    expect(li.quantity).toBe(1)
    // Exact parity with the live checkout route's amount computation.
    expect(li.unitAmount).toBe(toStripeAmount(parseMoney('$1,200') ?? 0, 'usd'))
    expect(li.unitAmount).toBe(120000)
    expect(li.subtotal).toBe(120000)
    expect(s.totals).toEqual({ currency: 'usd', subtotal: 120000, tax: 0, total: 120000 })
    expect(s.source).toEqual({ slug: 'acme', pageName: 'Acme Studio' })
  })

  it('multiplies subtotal by quantity', () => {
    const s = createSession({ id: 'sess_q', page: makePage(), items: [{ offer: 'products-0', quantity: 3 }] })
    expect(s.status).toBe('ready')
    expect(s.lineItems[0].unitAmount).toBe(45000)
    expect(s.lineItems[0].subtotal).toBe(135000)
    expect(s.totals.total).toBe(135000)
  })

  it('honors the page currency as the settlement source of truth (not the symbol in the string)', () => {
    // A "$450" string on a GBP page charges 450 GBP - currency comes from the page.
    const s = createSession({ id: 'sess_gbp', page: makePage({ currency: 'gbp' }), items: [{ offer: 'products-0' }] })
    expect(s.currency).toBe('gbp')
    expect(s.lineItems[0].currency).toBe('gbp')
    expect(s.lineItems[0].unitAmount).toBe(toStripeAmount(450, 'gbp'))
    expect(s.lineItems[0].unitAmount).toBe(45000)
  })

  it('handles zero-decimal currencies (JPY) without the ×100', () => {
    const page = makePage({ currency: 'jpy', services: [offer({ name: 'Ticket', price: '3000' })], products: [] })
    const s = createSession({ id: 'sess_jpy', page, items: [{ offer: 'services-0' }] })
    expect(s.currency).toBe('jpy')
    expect(s.lineItems[0].unitAmount).toBe(3000) // NOT 300000
    expect(s.lineItems[0].unitAmount).toBe(toStripeAmount(parseMoney('3000') ?? 0, 'jpy'))
  })

  it('falls back to usd for an unsupported / missing page currency', () => {
    const s = createSession({ id: 'sess_x', page: makePage({ currency: null }), items: [{ offer: 'products-0' }] })
    expect(s.currency).toBe('usd')
    expect(normalizeCurrency(null)).toBe('usd')
  })

  it('resolves offers by name (natural-language fallback), matching the checkout route', () => {
    const s = createSession({ id: 'sess_name', page: makePage(), items: [{ offer: 'the strategy session' }] })
    expect(s.status).toBe('ready')
    expect(s.lineItems[0].offerKey).toBe('services-0')
  })
})

describe('createSession - issues gate readiness', () => {
  it('flags a not-found offer', () => {
    const s = createSession({ id: 'i1', page: makePage(), items: [{ offer: 'services-99' }] })
    expect(s.status).toBe('pending')
    expect(s.lineItems).toEqual([])
    expect(s.issues).toEqual([{ offer: 'services-99', code: 'not_found', message: expect.any(String) }])
  })

  it('flags a negotiable offer (routes to negotiation, not checkout)', () => {
    const s = createSession({ id: 'i2', page: makePage(), items: [{ offer: 'products-1' }] })
    expect(s.status).toBe('pending')
    expect(s.issues[0].code).toBe('negotiable')
  })

  it('flags a sold-out offer but allows a limited one', () => {
    const soldOut = createSession({ id: 'i3', page: makePage(), items: [{ offer: 'products-2' }] })
    expect(soldOut.issues[0].code).toBe('sold_out')
    expect(soldOut.status).toBe('pending')

    const limited = createSession({ id: 'i4', page: makePage(), items: [{ offer: 'products-3' }] })
    expect(limited.status).toBe('ready')
    expect(limited.lineItems[0].availability).toBe('limited')
  })

  it('flags an unpriced ("Custom quote") offer', () => {
    const s = createSession({ id: 'i5', page: makePage(), items: [{ offer: 'services-1' }] })
    expect(s.issues[0].code).toBe('unpriced')
    expect(s.status).toBe('pending')
  })

  it('fails closed instead of charging a staged offer as one protocol line', () => {
    const staged = offer({
      name: 'Web Project',
      price: '$10,000',
      stagedSettlementTerms: {
        schemaVersion: 1,
        paymentModel: 'staged-fixed-total',
        approvalPolicy: 'buyer-approves-each-stage',
        mutationPolicy: 'immutable-after-first-payment',
        stages: [
          { id: 'kickoff', label: 'Kickoff', kind: 'commitment', allocationBps: 3000 },
          { id: 'handoff', label: 'Handoff', kind: 'completion', allocationBps: 7000 },
        ],
      },
    } as any)
    const session = createSession({
      id: 'staged',
      page: makePage({ services: [staged], products: [] }),
      items: [{ offer: 'services-0' }],
    })

    expect(session.status).toBe('pending')
    expect(session.lineItems).toEqual([])
    expect(session.issues[0].code).toBe('staged_settlement_not_supported')
  })

  it.each([[0], [-1], [1.5], [MAX_LINE_QUANTITY + 1], [Number.NaN]])(
    'flags invalid quantity %p',
    (quantity) => {
      const s = createSession({ id: 'iq', page: makePage(), items: [{ offer: 'products-0', quantity }] })
      expect(s.issues[0].code).toBe('invalid_quantity')
      expect(s.status).toBe('pending')
    },
  )

  it('keeps the whole session pending when any one item has an issue', () => {
    const s = createSession({
      id: 'mix',
      page: makePage(),
      items: [{ offer: 'services-0' }, { offer: 'products-1' }], // one valid, one negotiable
    })
    expect(s.status).toBe('pending')
    expect(s.lineItems).toHaveLength(1)
    expect(s.issues).toHaveLength(1)
    expect(s.issues[0].code).toBe('negotiable')
  })

  it('an empty cart is pending with a zero total', () => {
    const s = createSession({ id: 'empty', page: makePage(), items: [] })
    expect(s.status).toBe('pending')
    expect(s.lineItems).toEqual([])
    expect(s.totals.total).toBe(0)
  })
})

describe('createSession - duplicate merging + buyer', () => {
  it('merges duplicate offer keys into one line, summing quantity', () => {
    const s = createSession({
      id: 'dup',
      page: makePage(),
      items: [{ offer: 'products-0', quantity: 2 }, { offer: 'products-0', quantity: 3 }],
    })
    expect(s.lineItems).toHaveLength(1)
    expect(s.lineItems[0].quantity).toBe(5)
    expect(s.lineItems[0].subtotal).toBe(45000 * 5)
  })

  it('caps a merged quantity at the per-line ceiling', () => {
    const s = createSession({
      id: 'dupcap',
      page: makePage(),
      items: [
        { offer: 'products-0', quantity: MAX_LINE_QUANTITY },
        { offer: 'products-0', quantity: 10 },
      ],
    })
    expect(s.lineItems[0].quantity).toBe(MAX_LINE_QUANTITY)
  })

  it('normalizes buyer identity (trims, drops empty)', () => {
    const s = createSession({
      id: 'buyer',
      page: makePage(),
      items: [{ offer: 'services-0' }],
      buyer: { email: '  buyer@x.com ', name: '', reference: null, agent: 'nexxi' },
    })
    expect(s.buyer).toEqual({ email: 'buyer@x.com', name: undefined, reference: undefined, agent: 'nexxi' })
  })

  it('treats an all-empty buyer as null', () => {
    const s = createSession({ id: 'nb', page: makePage(), items: [{ offer: 'services-0' }], buyer: { email: '  ' } })
    expect(s.buyer).toBeNull()
  })

  it('sanitizes buyer fields to direct-checkout parity (drops invalid email, caps length, strips control chars)', () => {
    const s = createSession({
      id: 'san',
      page: makePage(),
      items: [{ offer: 'services-0' }],
      buyer: {
        email: 'not-an-email', // invalid → dropped (would corrupt the order-portal lookup)
        name: 'Da\nna', // control char stripped
        reference: 'x'.repeat(600), // capped well under Stripe's 500-char metadata limit
        agent: 'Nexxi',
      },
    })
    expect(s.buyer?.email).toBeUndefined()
    expect(s.buyer?.name).toBe('Dana')
    expect((s.buyer?.reference ?? '').length).toBeLessThanOrEqual(200)
    expect(s.buyer?.agent).toBe('Nexxi')
  })
})

describe('updateSession', () => {
  it('replaces the cart and recomputes totals', () => {
    const s = createSession({ id: 'u1', page: makePage(), items: [{ offer: 'services-0' }] })
    const updated = updateSession(s, { page: makePage(), items: [{ offer: 'products-0', quantity: 2 }] })
    expect(updated.lineItems[0].offerKey).toBe('products-0')
    expect(updated.totals.total).toBe(90000)
    expect(updated.status).toBe('ready')
    expect(updated.id).toBe('u1') // identity preserved
  })

  it('can flip a pending session to ready when the blocking item is removed', () => {
    const s = createSession({ id: 'u2', page: makePage(), items: [{ offer: 'products-1' }] }) // negotiable → pending
    expect(s.status).toBe('pending')
    const fixed = updateSession(s, { page: makePage(), items: [{ offer: 'services-0' }] })
    expect(fixed.status).toBe('ready')
    expect(fixed.issues).toEqual([])
  })

  it('re-prices existing line items when items are omitted', () => {
    const s = createSession({ id: 'u3', page: makePage(), items: [{ offer: 'products-0' }] })
    // Re-supply the page with a higher price for the same offer → re-priced.
    const repriced = updateSession(s, {
      page: makePage({ products: [offer({ name: 'Brand Kit', price: '$900' })] }),
    })
    expect(repriced.lineItems[0].unitAmount).toBe(90000)
  })

  it('merges buyer only when provided (undefined keeps existing, null clears)', () => {
    const s = createSession({ id: 'u4', page: makePage(), items: [{ offer: 'services-0' }], buyer: { email: 'a@b.com' } })
    const kept = updateSession(s, { page: makePage() })
    expect(kept.buyer).toEqual({ email: 'a@b.com', name: undefined, reference: undefined, agent: undefined })
    const cleared = updateSession(s, { page: makePage(), buyer: null })
    expect(cleared.buyer).toBeNull()
  })

  it('throws on a terminal session', () => {
    const s = createSession({ id: 'u5', page: makePage(), items: [{ offer: 'services-0' }] })
    const done = markSessionCompleted(s)
    expect(() => updateSession(done, { page: makePage() })).toThrow(/completed/)
    const canceled = cancelSession(s)
    expect(() => updateSession(canceled, { page: makePage() })).toThrow(/canceled/)
  })
})

describe('state transitions', () => {
  it('completes only a ready session', () => {
    const ready = createSession({ id: 't1', page: makePage(), items: [{ offer: 'services-0' }] })
    expect(markSessionCompleted(ready).status).toBe('completed')

    const pending = createSession({ id: 't2', page: makePage(), items: [{ offer: 'services-1' }] })
    expect(() => markSessionCompleted(pending)).toThrow(/not ready/)
  })

  it('cancels a live session, is idempotent, and refuses a completed one', () => {
    const s = createSession({ id: 't3', page: makePage(), items: [{ offer: 'services-0' }] })
    const canceled = cancelSession(s)
    expect(canceled.status).toBe('canceled')
    expect(cancelSession(canceled)).toBe(canceled) // idempotent (same ref)

    const completed = markSessionCompleted(s)
    expect(() => cancelSession(completed)).toThrow(/completed/)
  })

  it('does not mutate the input session (pure transitions)', () => {
    const s = createSession({ id: 't4', page: makePage(), items: [{ offer: 'services-0' }] })
    const before = JSON.stringify(s)
    markSessionCompleted(s)
    cancelSession(s)
    updateSession(s, { page: makePage(), items: [{ offer: 'products-0' }] })
    expect(JSON.stringify(s)).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// Buyer-approved amount: frozen at the first `ready`, judged at settlement.
// ---------------------------------------------------------------------------

/** The page with the Strategy Session repriced, standing in for a merchant edit
 * between the buyer's authorization and the agent's /complete call. */
function repricedPage(price: string): SessionPage {
  const base = makePage()
  return {
    ...base,
    services: [offer({ name: 'Strategy Session', price, description: 'A deep-dive.' }), base.services![1]],
  }
}

describe('approval freezing', () => {
  it('freezes amount, currency and cart the moment a session is payable', () => {
    const s = createSession({ id: 'a1', page: makePage(), items: [{ offer: 'services-0' }] })
    expect(s.approval).toEqual({
      amount: 120000,
      currency: 'usd',
      cartFingerprint: cartFingerprint(s.lineItems),
    })
  })

  it('records no approval while the session is not payable', () => {
    const s = createSession({ id: 'a2', page: makePage(), items: [{ offer: 'services-1' }] })
    expect(s.status).toBe('pending')
    expect(s.approval).toBeNull()
  })

  it('carries the original approval through a re-price that omits items', () => {
    const s = createSession({ id: 'a3', page: makePage(), items: [{ offer: 'services-0' }] })
    const repriced = updateSession(s, { page: repricedPage('$1,900') })
    expect(repriced.totals.total).toBe(190000)
    expect(repriced.approval).toEqual(s.approval)
  })

  it('re-freezes when the agent deliberately supplies a new cart', () => {
    const s = createSession({ id: 'a4', page: makePage(), items: [{ offer: 'services-0' }] })
    const recarted = updateSession(s, { page: makePage(), items: [{ offer: 'products-0' }] })
    expect(recarted.approval?.amount).toBe(45000)
    expect(recarted.approval?.cartFingerprint).not.toBe(s.approval?.cartFingerprint)
  })

  it('freezes on the update that first makes a session payable', () => {
    const s = createSession({ id: 'a5', page: makePage(), items: [] })
    expect(s.approval).toBeNull()
    const ready = updateSession(s, { page: makePage(), items: [{ offer: 'services-0' }] })
    expect(ready.status).toBe('ready')
    expect(ready.approval?.amount).toBe(120000)
  })
})

describe('cartFingerprint', () => {
  it('is order-independent', () => {
    const a = createSession({ id: 'f1', page: makePage(), items: [{ offer: 'services-0' }, { offer: 'products-0' }] })
    const b = createSession({ id: 'f2', page: makePage(), items: [{ offer: 'products-0' }, { offer: 'services-0' }] })
    expect(cartFingerprint(a.lineItems)).toBe(cartFingerprint(b.lineItems))
  })

  it('changes with quantity and with composition', () => {
    const one = createSession({ id: 'f3', page: makePage(), items: [{ offer: 'services-0' }] })
    const two = createSession({ id: 'f4', page: makePage(), items: [{ offer: 'services-0', quantity: 2 }] })
    const other = createSession({ id: 'f5', page: makePage(), items: [{ offer: 'products-0' }] })
    expect(cartFingerprint(one.lineItems)).not.toBe(cartFingerprint(two.lineItems))
    expect(cartFingerprint(one.lineItems)).not.toBe(cartFingerprint(other.lineItems))
  })

  // Price is deliberately excluded so a price DROP is not mistaken for a different
  // cart; the amount comparison is what judges price movement.
  it('ignores price', () => {
    const before = createSession({ id: 'f6', page: makePage(), items: [{ offer: 'services-0' }] })
    const after = createSession({ id: 'f7', page: repricedPage('$999'), items: [{ offer: 'services-0' }] })
    expect(cartFingerprint(before.lineItems)).toBe(cartFingerprint(after.lineItems))
  })
})

describe('checkApprovalDrift', () => {
  const authorized = () => createSession({ id: 'd1', page: makePage(), items: [{ offer: 'services-0' }] })

  it('passes an unchanged quote', () => {
    expect(checkApprovalDrift(authorized())).toEqual({ ok: true })
  })

  it('passes when the merchant LOWERED the price', () => {
    const cheaper = updateSession(authorized(), { page: repricedPage('$900') })
    expect(cheaper.totals.total).toBe(90000)
    expect(checkApprovalDrift(cheaper)).toEqual({ ok: true })
  })

  it('refuses an increase, reporting both amounts', () => {
    const dearer = updateSession(authorized(), { page: repricedPage('$1,900') })
    const drift = checkApprovalDrift(dearer)
    expect(drift.ok).toBe(false)
    if (drift.ok) throw new Error('expected drift')
    expect(drift.code).toBe('amount_increased')
    expect(drift.approved.amount).toBe(120000)
    expect(drift.current.amount).toBe(190000)
  })

  it('refuses a one-minor-unit increase (no tolerance band)', () => {
    const dearer = updateSession(authorized(), { page: repricedPage('$1,200.01') })
    expect(dearer.totals.total).toBe(120001)
    const drift = checkApprovalDrift(dearer)
    expect(drift.ok).toBe(false)
    if (!drift.ok) expect(drift.code).toBe('amount_increased')
  })

  it('refuses a currency change', () => {
    const swapped = updateSession(authorized(), { page: { ...makePage(), currency: 'eur' } })
    const drift = checkApprovalDrift(swapped)
    expect(drift.ok).toBe(false)
    if (!drift.ok) expect(drift.code).toBe('currency_changed')
  })

  // Guards the mapper contract: a session whose stored approval describes a
  // different cart must not settle, even if the new cart is cheaper.
  it('refuses a cart that no longer matches the authorization', () => {
    const s = authorized()
    const swappedCart = { ...updateSession(s, { page: makePage(), items: [{ offer: 'products-0' }] }), approval: s.approval }
    const drift = checkApprovalDrift(swappedCart)
    expect(drift.ok).toBe(false)
    if (!drift.ok) expect(drift.code).toBe('cart_changed')
  })

  // Rows created before the approval columns existed. They expire inside one deploy
  // cycle; failing them closed would strand every in-flight checkout.
  it('passes a session with no approval on file', () => {
    expect(checkApprovalDrift({ ...authorized(), approval: null })).toEqual({ ok: true })
  })
})
