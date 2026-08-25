import { describe, expect, it } from 'vitest'
import {
  parseAcpLineItems,
  parseAcpBuyer,
  parseAcpPaymentCredential,
  toAcpStatus,
  toAcpCheckoutSession,
  acpError,
} from '../acp/wire'
import { createSession, type SessionPage } from '../commerce/checkout-session-core'
import type { OfferItem } from '../agent-page'

function offer(partial: Partial<OfferItem> & { name: string; price: string }): OfferItem {
  return { description: '', url: '', ...partial }
}

function makePage(): SessionPage {
  return {
    slug: 'acme',
    name: 'Acme Studio',
    currency: 'usd',
    services: [offer({ name: 'Strategy Session', price: '$1,200' })],
    products: [offer({ name: 'Brand Kit', price: '$450' })],
  }
}

describe('parseAcpLineItems', () => {
  it('parses a single-merchant cart into slug + core items', () => {
    const res = parseAcpLineItems([{ id: 'acme:services-0', quantity: 2 }, { id: 'acme:products-0' }])
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('expected ok')
    expect(res.slug).toBe('acme')
    expect(res.items).toEqual([{ offer: 'services-0', quantity: 2 }, { offer: 'products-0', quantity: 1 }])
  })

  it('rejects a cart that mixes merchants (cross-tenant guard)', () => {
    const res = parseAcpLineItems([{ id: 'acme:services-0' }, { id: 'beta:products-0' }])
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected error')
    expect(res.error.code).toBe('mixed_merchant')
    expect(res.error.param).toBe('$.line_items[1].id')
  })

  it('rejects a malformed / empty item id', () => {
    expect(parseAcpLineItems([{ id: 'no-colon' }]).ok).toBe(false)
    expect(parseAcpLineItems([{ id: ':services-0' }]).ok).toBe(false) // empty slug
    expect(parseAcpLineItems([{ id: 'acme:' }]).ok).toBe(false) // empty offer
    expect(parseAcpLineItems([{ id: '' }]).ok).toBe(false)
    expect(parseAcpLineItems([{}]).ok).toBe(false)
  })

  it('rejects a non-array / empty line_items', () => {
    expect(parseAcpLineItems([]).ok).toBe(false)
    expect(parseAcpLineItems(null).ok).toBe(false)
    expect(parseAcpLineItems('x').ok).toBe(false)
  })
})

describe('parseAcpBuyer', () => {
  it('maps name + email, ignores phone, returns null when empty', () => {
    expect(parseAcpBuyer({ name: 'Dana', email: 'd@x.com', phone: '555' })).toEqual({ name: 'Dana', email: 'd@x.com' })
    expect(parseAcpBuyer({ email: 'd@x.com' })).toEqual({ name: undefined, email: 'd@x.com' })
    expect(parseAcpBuyer({})).toBeNull()
    expect(parseAcpBuyer(null)).toBeNull()
  })
})

describe('parseAcpPaymentCredential', () => {
  it('parses the current typed SPT credential and preserves its handler id', () => {
    expect(parseAcpPaymentCredential({
      handler_id: 'card_tokenized',
      instrument: { type: 'card', credential: { type: 'spt', token: 'spt_123' } },
    })).toEqual({
      ok: true,
      payment: { kind: 'shared_payment_token', token: 'spt_123', handlerId: 'card_tokenized' },
    })
  })

  it('accepts older bare SPT and vaulted-token shapes without accepting a test PaymentMethod', () => {
    expect(parseAcpPaymentCredential({ instrument: { credential: 'vt_123' } })).toEqual({
      ok: true,
      payment: { kind: 'shared_payment_token', token: 'vt_123' },
    })
    expect(parseAcpPaymentCredential({ token: '  spt_456  ' })).toEqual({
      ok: true,
      payment: { kind: 'shared_payment_token', token: 'spt_456' },
    })
    const rawMethod = parseAcpPaymentCredential({ instrument: { credential: 'pm_card_visa' } })
    expect(rawMethod.ok).toBe(false)
    if (!rawMethod.ok) expect(rawMethod.error.code).toBe('invalid_payment_credential')
  })

  it('rejects missing, blank, and unsupported typed credentials', () => {
    for (const input of [{}, { instrument: { credential: '' } }, { token: 123 }, null]) {
      const result = parseAcpPaymentCredential(input)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('missing_payment')
    }
    const wrongType = parseAcpPaymentCredential({
      instrument: { credential: { type: 'network_token', token: 'spt_123' } },
    })
    expect(wrongType.ok).toBe(false)
    if (!wrongType.ok) expect(wrongType.error.code).toBe('unsupported_payment_credential')
  })
})

describe('toAcpStatus', () => {
  it('maps every core status to its ACP name', () => {
    expect(toAcpStatus('pending')).toBe('not_ready_for_payment')
    expect(toAcpStatus('ready')).toBe('ready_for_payment')
    expect(toAcpStatus('completed')).toBe('completed')
    expect(toAcpStatus('canceled')).toBe('canceled')
  })
})

describe('toAcpCheckoutSession', () => {
  it('projects a ready session into the ACP shape (minor units, totals, buyer)', () => {
    const session = createSession({
      id: 'sess_1',
      page: makePage(),
      items: [{ offer: 'services-0', quantity: 2 }],
      buyer: { email: 'b@x.com', name: 'Dana' },
    })
    const acp = toAcpCheckoutSession(session)
    expect(acp.id).toBe('sess_1')
    expect(acp.status).toBe('ready_for_payment')
    expect(acp.currency).toBe('usd')
    expect(acp.line_items).toEqual([
      {
        id: 'services-0',
        item: { id: 'acme:services-0', quantity: 2 },
        base_amount: 120000,
        subtotal: 240000,
        discount: 0,
        tax: 0,
        total: 240000,
      },
    ])
    expect(acp.totals).toEqual([
      { type: 'items_base_amount', display_text: 'Items', amount: 240000 },
      { type: 'subtotal', display_text: 'Subtotal', amount: 240000 },
      { type: 'tax', display_text: 'Tax', amount: 0 },
      { type: 'total', display_text: 'Total', amount: 240000 },
    ])
    expect(acp.buyer).toEqual({ name: 'Dana', email: 'b@x.com' })
    expect(acp.messages).toEqual([])
    expect(acp.order).toBeUndefined()
  })

  it('maps a pending session (negotiable offer) to not_ready_for_payment', () => {
    const page: SessionPage = { ...makePage(), products: [offer({ name: 'Neg', price: '$99', offerType: 'negotiable' })] }
    const session = createSession({ id: 's', page, items: [{ offer: 'products-0' }] })
    expect(toAcpCheckoutSession(session).status).toBe('not_ready_for_payment')
  })

  it('attaches an order ref on a completed session (CheckoutSessionWithOrder)', () => {
    const session = createSession({ id: 'sess_1', page: makePage(), items: [{ offer: 'services-0' }] })
    const order = { id: 'ord_1', checkout_session_id: 'sess_1', permalink_url: 'https://nexez.app/orders/tok', status: 'confirmed' }
    expect(toAcpCheckoutSession(session, { order }).order).toEqual(order)
  })
})

describe('acpError', () => {
  it('builds the {type,code,message,param} shape', () => {
    expect(acpError('bad', 'Bad thing', '$.x')).toEqual({ type: 'invalid_request', code: 'bad', message: 'Bad thing', param: '$.x' })
    expect(acpError('nope', 'No', undefined, 'authentication_error')).toEqual({ type: 'authentication_error', code: 'nope', message: 'No' })
  })
})
