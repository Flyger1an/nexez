import { describe, expect, it } from 'vitest'
import {
  parseUcpLineItems,
  parseUcpBuyer,
  parseUcpPaymentToken,
  toUcpStatus,
  toUcpCheckoutSession,
  ucpError,
} from '../ucp/wire'
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

describe('parseUcpLineItems', () => {
  it('parses nested item.id into slug + core items', () => {
    const res = parseUcpLineItems([{ item: { id: 'acme:services-0' }, quantity: 2 }, { item: { id: 'acme:products-0' } }])
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('expected ok')
    expect(res.slug).toBe('acme')
    expect(res.items).toEqual([{ offer: 'services-0', quantity: 2 }, { offer: 'products-0', quantity: 1 }])
  })

  it('rejects a mixed-merchant cart (cross-tenant guard)', () => {
    const res = parseUcpLineItems([{ item: { id: 'acme:services-0' } }, { item: { id: 'beta:products-0' } }])
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected error')
    expect(res.error.code).toBe('mixed_merchant')
    expect(res.error.field).toBe('line_items[1].item.id')
  })

  it('rejects malformed / empty ids', () => {
    expect(parseUcpLineItems([{ item: { id: 'nocolon' } }]).ok).toBe(false)
    expect(parseUcpLineItems([{ item: { id: 'acme:' } }]).ok).toBe(false)
    expect(parseUcpLineItems([{ item: {} }]).ok).toBe(false)
    expect(parseUcpLineItems([{}]).ok).toBe(false)
    expect(parseUcpLineItems([]).ok).toBe(false)
    expect(parseUcpLineItems(null).ok).toBe(false)
  })
})

describe('parseUcpBuyer', () => {
  it('reads buyer, then contact, then billing_address', () => {
    expect(parseUcpBuyer({ buyer: { name: 'Dana', email: 'd@x.com' } })).toEqual({ name: 'Dana', email: 'd@x.com' })
    expect(parseUcpBuyer({ contact: { email: 'c@x.com' } })).toEqual({ name: undefined, email: 'c@x.com' })
    expect(parseUcpBuyer({ billing_address: { name: 'Bill' } })).toEqual({ name: 'Bill', email: undefined })
    expect(parseUcpBuyer({})).toBeNull()
    expect(parseUcpBuyer(null)).toBeNull()
  })
})

describe('parseUcpPaymentToken', () => {
  it('extracts the Google Pay token from instruments[].credential.token + flatter shapes', () => {
    expect(parseUcpPaymentToken({ instruments: [{ credential: { token: 'gp_123' } }] })).toBe('gp_123')
    expect(parseUcpPaymentToken({ credential: { token: '  gp_456  ' } })).toBe('gp_456')
    expect(parseUcpPaymentToken({ token: 'gp_789' })).toBe('gp_789')
  })
  it('returns null when absent/blank', () => {
    expect(parseUcpPaymentToken({ instruments: [] })).toBeNull()
    expect(parseUcpPaymentToken({ instruments: [{ credential: { token: '' } }] })).toBeNull()
    expect(parseUcpPaymentToken({})).toBeNull()
    expect(parseUcpPaymentToken(null)).toBeNull()
  })
})

describe('toUcpStatus', () => {
  it('collapses pending/ready to incomplete; completed/canceled pass through', () => {
    expect(toUcpStatus('pending')).toBe('incomplete')
    expect(toUcpStatus('ready')).toBe('incomplete')
    expect(toUcpStatus('completed')).toBe('completed')
    expect(toUcpStatus('canceled')).toBe('canceled')
  })
})

describe('toUcpCheckoutSession', () => {
  it('projects a session into the UCP shape (nested item.id, totals, links)', () => {
    const session = createSession({ id: 'sess_1', page: makePage(), items: [{ offer: 'services-0', quantity: 2 }], buyer: { email: 'b@x.com' } })
    const ucp = toUcpCheckoutSession(session)
    expect(ucp.id).toBe('sess_1')
    expect(ucp.status).toBe('incomplete')
    expect(ucp.currency).toBe('usd')
    expect(ucp.line_items).toEqual([{ item: { id: 'acme:services-0' }, quantity: 2, base_amount: 120000, subtotal: 240000, total: 240000 }])
    expect(ucp.totals).toEqual([
      { type: 'subtotal', amount: 240000 },
      { type: 'fulfillment', amount: 0 },
      { type: 'tax', amount: 0 },
      { type: 'total', amount: 240000 },
    ])
    expect(ucp.links.terms).toMatch(/\/terms$/)
    expect(ucp.links.privacy).toMatch(/\/privacy$/)
    expect(ucp.buyer).toEqual({ email: 'b@x.com' })
    expect(ucp.order).toBeUndefined()
  })

  it('attaches an order ref on a completed session', () => {
    const session = createSession({ id: 'sess_1', page: makePage(), items: [{ offer: 'services-0' }] })
    const order = { id: 'ord_1', label: 'Order #1', permalink_url: 'https://nexez.app/orders/tok', status: 'completed' }
    expect(toUcpCheckoutSession(session, { order }).order).toEqual(order)
  })
})

describe('ucpError', () => {
  it('builds the {type,code,message,field} shape', () => {
    expect(ucpError('bad', 'Bad', 'line_items')).toEqual({ type: 'invalid_request', code: 'bad', message: 'Bad', field: 'line_items' })
    expect(ucpError('nope', 'No', undefined, 'authentication_error')).toEqual({ type: 'authentication_error', code: 'nope', message: 'No' })
  })
})
