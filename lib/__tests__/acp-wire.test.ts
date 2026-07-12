import { describe, expect, it } from 'vitest'
import {
  parseAcpLineItems,
  parseAcpBuyer,
  parseAcpPaymentToken,
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

describe('parseAcpPaymentToken', () => {
  it('extracts the credential from the standard + flatter shapes', () => {
    expect(parseAcpPaymentToken({ instrument: { credential: 'vt_123' } })).toBe('vt_123')
    expect(parseAcpPaymentToken({ token: '  vt_456  ' })).toBe('vt_456')
    expect(parseAcpPaymentToken({ credential: 'vt_789' })).toBe('vt_789')
  })
  it('returns null when absent/blank/non-string', () => {
    expect(parseAcpPaymentToken({})).toBeNull()
    expect(parseAcpPaymentToken({ instrument: { credential: '' } })).toBeNull()
    expect(parseAcpPaymentToken({ token: 123 })).toBeNull()
    expect(parseAcpPaymentToken(null)).toBeNull()
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
