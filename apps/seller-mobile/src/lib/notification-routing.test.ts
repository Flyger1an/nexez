import { describe, expect, it } from 'vitest'
import { normalizeSellerDeepLink, sellerNotificationDestination } from './notification-routing'

describe('normalizeSellerDeepLink', () => {
  it.each([
    ['/overview', '/overview'],
    ['/inbox/orders/order_123?from=push', '/inbox/orders/order_123'],
    ['nexez-seller://inbox/negotiations/neg_123', '/inbox/negotiations/neg_123'],
    ['nexez-seller:///listing/page_123/readiness', '/listing/page_123/readiness'],
    ['https://app.nexez.ai/dashboard', '/overview'],
    ['https://app.nexez.ai/dashboard/finance', '/tools/finance'],
    ['https://app.nexez.ai/dashboard/negotiations/neg_123', '/inbox/negotiations/neg_123'],
  ])('maps %s to %s', (input, destination) => {
    expect(normalizeSellerDeepLink(input)).toBe(destination)
  })

  it.each([
    'https://attacker.example/inbox/orders/order_123',
    'http://app.nexez.ai/dashboard/finance',
    'javascript:alert(1)',
    'nexez-seller://inbox/orders/order%2Fadmin',
    '/inbox/orders/../../settings',
    '/admin',
    '/login',
    '',
  ])('rejects unsafe or unsupported destination %s', (input) => {
    expect(normalizeSellerDeepLink(input)).toBeNull()
  })
})

describe('sellerNotificationDestination', () => {
  it.each([
    [{ type: 'negotiation', negotiationId: 'neg_123' }, '/inbox/negotiations/neg_123'],
    [{ type: 'negotiation' }, '/inbox/negotiations'],
    [{ type: 'order', order_id: 'ord_123' }, '/inbox/orders/ord_123'],
    [{ type: 'order' }, '/inbox/orders'],
    [{ type: 'listing', pageId: 'page_123' }, '/listing/page_123'],
    [{ type: 'page' }, '/listings'],
    [{ type: 'review' }, '/inbox/reviews'],
    [{ type: 'refund_request' }, '/inbox/requests'],
    [{ type: 'dispute' }, '/tools/finance'],
    [{ url: 'nexez-seller://tools/finance' }, '/tools/finance'],
    [{ url: 'https://attacker.example/orders/1', type: 'order' }, '/inbox/orders'],
    [{ type: 'order', orderId: '../settings' }, '/inbox/orders'],
    [{ type: 'unknown' }, '/notifications'],
    [null, '/notifications'],
  ])('routes %# safely', (payload, destination) => {
    expect(sellerNotificationDestination(payload)).toBe(destination)
  })
})
