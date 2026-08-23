import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SELLER_NOTIFICATION_PREFERENCES,
  normalizeSellerNotificationPreferences,
  sellerNotificationPatchFromLegacyStorage,
} from './seller-notification-preferences'

describe('seller notification mobile preferences', () => {
  it('keeps money-state notifications required by default', () => {
    expect(DEFAULT_SELLER_NOTIFICATION_PREFERENCES).toEqual({
      transactions: true,
      negotiations: true,
      integrations: true,
      reviews: true,
      marketing: true,
    })
  })

  it('accepts only complete server preferences with required transactions enabled', () => {
    expect(normalizeSellerNotificationPreferences(DEFAULT_SELLER_NOTIFICATION_PREFERENCES)).toEqual(
      DEFAULT_SELLER_NOTIFICATION_PREFERENCES,
    )
    expect(normalizeSellerNotificationPreferences({
      ...DEFAULT_SELLER_NOTIFICATION_PREFERENCES,
      transactions: false,
    })).toBeNull()
    expect(normalizeSellerNotificationPreferences({ transactions: true, reviews: true })).toBeNull()
  })

  it('collapses legacy event switches conservatively into account categories', () => {
    expect(sellerNotificationPatchFromLegacyStorage(JSON.stringify({
      negotiation: true,
      accepted: false,
      payment: false,
      review: true,
      readiness: false,
      integration: true,
      spike: true,
    }))).toEqual({
      negotiations: false,
      integrations: true,
      reviews: true,
      marketing: false,
    })
  })

  it('ignores an old payment opt-out because transaction notices cannot be muted', () => {
    expect(sellerNotificationPatchFromLegacyStorage(JSON.stringify({ payment: false }))).toBeNull()
  })

  it.each([null, '', 'not-json', '[]', '{}', '{"review":"off"}'])(
    'does not migrate malformed or irrelevant legacy storage: %s',
    (raw) => {
      expect(sellerNotificationPatchFromLegacyStorage(raw)).toBeNull()
    },
  )
})
