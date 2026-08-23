import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SELLER_NOTIFICATION_PREFERENCES,
  isRequiredSellerNotification,
  isSellerNotificationPreferences,
  parseSellerNotificationPreferencePatch,
  sellerNotificationCategory,
  sellerNotificationPreferencePatchToRow,
  sellerNotificationPreferencesFromRow,
} from './seller-notification-policy'

describe('seller notification policy', () => {
  it('validates complete preference payloads and preserves required transactions', () => {
    expect(isSellerNotificationPreferences(DEFAULT_SELLER_NOTIFICATION_PREFERENCES)).toBe(true)
    expect(isSellerNotificationPreferences({ ...DEFAULT_SELLER_NOTIFICATION_PREFERENCES, transactions: false })).toBe(false)
    expect(isSellerNotificationPreferences({ transactions: true, negotiations: true })).toBe(false)
  })

  it('classifies every money-state event as required transactions', () => {
    const events = [
      'transaction.payment_received',
      'transaction.payment_held',
      'transaction.booking_confirmed',
      'transaction.capture_completed',
      'transaction.refund_updated',
      'transaction.dispute_updated',
    ] as const

    for (const event of events) {
      expect(sellerNotificationCategory(event)).toBe('transactions')
      expect(isRequiredSellerNotification(event)).toBe(true)
    }
  })

  it('maps optional events to their account-level category', () => {
    expect(sellerNotificationCategory('negotiation.created')).toBe('negotiations')
    expect(sellerNotificationCategory('integration.failed')).toBe('integrations')
    expect(sellerNotificationCategory('review.created')).toBe('reviews')
    expect(sellerNotificationCategory('marketing.traffic_spike')).toBe('marketing')
  })

  it('defaults every category on and never reads a mutable transaction value', () => {
    expect(sellerNotificationPreferencesFromRow(null)).toEqual(DEFAULT_SELLER_NOTIFICATION_PREFERENCES)
    expect(sellerNotificationPreferencesFromRow({
      user_id: 'u1',
      negotiations_enabled: false,
      integrations_enabled: true,
      reviews_enabled: false,
      marketing_enabled: true,
    })).toEqual({
      transactions: true,
      negotiations: false,
      integrations: true,
      reviews: false,
      marketing: true,
    })
  })

  it('accepts only explicit boolean patches for mutable categories', () => {
    expect(parseSellerNotificationPreferencePatch({ negotiations: false, reviews: true })).toEqual({
      ok: true,
      patch: { negotiations: false, reviews: true },
    })
    expect(sellerNotificationPreferencePatchToRow({ negotiations: false, reviews: true })).toEqual({
      negotiations_enabled: false,
      reviews_enabled: true,
    })
  })

  it('rejects attempts to mute transactions, unknown keys, empty patches, and non-booleans', () => {
    expect(parseSellerNotificationPreferencePatch({ transactions: false })).toEqual({
      ok: false,
      error: 'Transaction and money-state notifications are required.',
    })
    expect(parseSellerNotificationPreferencePatch({ growth: false })).toEqual({
      ok: false,
      error: 'Unsupported notification preference: growth.',
    })
    expect(parseSellerNotificationPreferencePatch({})).toEqual({
      ok: false,
      error: 'Choose at least one notification preference.',
    })
    expect(parseSellerNotificationPreferencePatch({ marketing: 'no' })).toEqual({
      ok: false,
      error: 'marketing must be true or false.',
    })
  })
})
