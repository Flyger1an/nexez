import { describe, expect, it } from 'vitest'
import {
  buildCommerceAttentionSummary,
  commerceAttentionBadgeLabel,
} from './commerce-attention'
import type { CommerceActionRecord } from './commerce-actions'

function action(href: string, urgent = false): CommerceActionRecord {
  return {
    key: href,
    record: {
      key: `checkout:${href}`,
      id: href,
      rail: 'checkout',
      railLabel: 'Checkout order',
      offerName: 'Portrait session',
      buyerLabel: 'Buyer',
      buyerEmail: 'buyer@example.com',
      channelLabel: 'Agent checkout',
      sourceStatus: { key: 'paid', label: 'Paid', tone: 'ready' },
      paymentState: { key: 'paid', label: 'Paid', tone: 'ready' },
      fulfillmentState: { key: 'not_started', label: 'Not started', tone: 'muted' },
      amountCents: 10_000,
      amountRole: 'recorded_payment',
      amountLabel: 'Recorded payment',
      currency: 'usd',
      mode: 'live',
      createdAt: '2026-08-23T10:00:00.000Z',
      updatedAt: '2026-08-23T11:00:00.000Z',
      href,
      actionLabel: 'Open order',
    },
    actions: [{
      key: urgent ? 'payment_dispute' : 'fulfillment',
      label: urgent ? 'Review payment dispute' : 'Start fulfillment',
      detail: 'Evidence-backed action.',
      priority: urgent ? 100 : 55,
      urgent,
      updatedAt: '2026-08-23T11:00:00.000Z',
    }],
    primaryAction: {
      key: urgent ? 'payment_dispute' : 'fulfillment',
      label: urgent ? 'Review payment dispute' : 'Start fulfillment',
      detail: 'Evidence-backed action.',
      priority: urgent ? 100 : 55,
      urgent,
      updatedAt: '2026-08-23T11:00:00.000Z',
    },
    urgent,
  }
}

describe('commerce attention summary', () => {
  it('deep-links one fully known action to its native workspace', () => {
    const summary = buildCommerceAttentionSummary({
      actions: [action('/dashboard/orders/order-1')],
      urgentCount: 0,
      isTruncated: false,
      issues: [],
    })

    expect(summary).toMatchObject({
      visibleCount: 1,
      status: 'complete',
      href: '/dashboard/orders/order-1',
    })
    expect(commerceAttentionBadgeLabel(summary)).toBe('1 commerce action')
  })

  it('routes multiple or bounded actions to Commerce instead of guessing a native destination', () => {
    const summary = buildCommerceAttentionSummary({
      actions: [action('/dashboard/orders/order-1'), action('/dashboard/orders/order-2', true)],
      urgentCount: 1,
      isTruncated: true,
      issues: [],
    })

    expect(summary.href).toBe('/dashboard/commerce')
    expect(commerceAttentionBadgeLabel(summary)).toBe('2 or more commerce actions, 1 urgent')
  })

  it('marks partial and unavailable source coverage without presenting an all-clear', () => {
    const partial = buildCommerceAttentionSummary({
      actions: [action('/dashboard/orders/order-1')],
      urgentCount: 0,
      isTruncated: false,
      issues: ['Negotiations could not be checked.'],
    })
    const unavailable = buildCommerceAttentionSummary({
      actions: [],
      urgentCount: 0,
      isTruncated: false,
      issues: ['Commerce actions could not be checked.'],
    })

    expect(partial).toMatchObject({ status: 'partial', href: '/dashboard/commerce' })
    expect(commerceAttentionBadgeLabel(partial)).toBe('1 or more commerce actions')
    expect(unavailable.status).toBe('unavailable')
    expect(commerceAttentionBadgeLabel(unavailable)).toBe('Commerce actions unavailable')
  })

  it('does not describe a truncated zero-result window as an all-clear or an action', () => {
    const summary = buildCommerceAttentionSummary({
      actions: [],
      urgentCount: 0,
      isTruncated: true,
      issues: [],
    })

    expect(summary.status).toBe('partial')
    expect(commerceAttentionBadgeLabel(summary)).toBe('Commerce action coverage incomplete')
  })
})
