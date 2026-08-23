import { beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({
  tokens: [] as { token: string; user_id: string }[],
  buyerPrefsRows: [] as { user_id: string; preferences: Record<string, unknown> | null }[],
  sellerPrefs: null as null | Record<string, boolean>,
  sellerPrefsError: null as null | { message: string },
  recorded: [] as Record<string, unknown>[],
  selectedTables: [] as string[],
}))

vi.mock('../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => true,
  createAdminClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => {
          refs.selectedTables.push(table)
          return query
        },
        eq: () => query,
        in: () => query,
        returns: async () => ({
          data: table === 'user_push_tokens'
            ? refs.tokens
            : table === 'user_agents'
              ? refs.buyerPrefsRows
              : null,
        }),
        maybeSingle: async () => ({ data: refs.sellerPrefs, error: refs.sellerPrefsError }),
        insert: async (rows: Record<string, unknown>[]) => {
          refs.recorded.push(...rows)
          return { error: null }
        },
      }
      return query
    },
  }),
}))

import { sendPushToUser, sendSellerPushToUser } from './push'

const TOKEN = 'ExponentPushToken[abc123]'

beforeEach(() => {
  refs.tokens = [{ token: TOKEN, user_id: 'u1' }]
  refs.buyerPrefsRows = [{
    user_id: 'u1',
    preferences: {
      notificationsEnabled: true,
      notificationTypes: { orders: true, alerts: true, tasks: true },
    },
  }]
  refs.sellerPrefs = null
  refs.sellerPrefsError = null
  refs.recorded = []
  refs.selectedTables = []
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true }) as any))
})

describe('buyer push policy', () => {
  it('sends when the buyer category is enabled', async () => {
    expect((await sendPushToUser('u1', {
      title: 't',
      body: 'b',
      category: 'alerts',
    })).sent).toBe(1)
  })

  it('suppresses only the muted buyer category', async () => {
    refs.buyerPrefsRows = [{
      user_id: 'u1',
      preferences: {
        notificationsEnabled: true,
        notificationTypes: { orders: true, alerts: false, tasks: true },
      },
    }]
    expect((await sendPushToUser('u1', { title: 't', body: 'b', category: 'alerts' })).sent).toBe(0)
    expect((await sendPushToUser('u1', { title: 't', body: 'b', category: 'orders' })).sent).toBe(1)
  })

  it('records a buyer event even when device push is muted', async () => {
    refs.buyerPrefsRows = [{
      user_id: 'u1',
      preferences: {
        notificationsEnabled: true,
        notificationTypes: { orders: true, alerts: false, tasks: true },
      },
    }]
    const result = await sendPushToUser('u1', {
      title: 'New match',
      body: 'b',
      category: 'alerts',
      data: { type: 'saved_search' },
    })
    expect(result.sent).toBe(0)
    expect(refs.recorded).toEqual([
      expect.objectContaining({ user_id: 'u1', category: 'alerts', type: 'saved_search' }),
    ])
  })
})

describe('seller push policy', () => {
  it('delivers required money-state events without consulting mutable preferences', async () => {
    refs.sellerPrefs = {
      negotiations_enabled: false,
      integrations_enabled: false,
      reviews_enabled: false,
      marketing_enabled: false,
    }
    refs.sellerPrefsError = { message: 'database unavailable' }
    refs.buyerPrefsRows = [{ user_id: 'u1', preferences: { notificationsEnabled: false } }]

    const result = await sendSellerPushToUser('u1', 'transaction.payment_received', {
      title: 'Payment received',
      body: '$100',
    })

    expect(result.sent).toBe(1)
    expect(refs.selectedTables).not.toContain('seller_notification_preferences')
    expect(refs.selectedTables).not.toContain('user_agents')
    expect(refs.recorded).toHaveLength(0)
  })

  it('defaults optional seller events on when no preference row exists', async () => {
    const result = await sendSellerPushToUser('u1', 'negotiation.created', {
      title: 'New negotiation',
      body: 'A buyer made an offer.',
    })
    expect(result.sent).toBe(1)
  })

  it('suppresses an optional seller category that the seller muted', async () => {
    refs.sellerPrefs = { negotiations_enabled: false }
    const result = await sendSellerPushToUser('u1', 'negotiation.created', {
      title: 'New negotiation',
      body: 'A buyer made an offer.',
    })
    expect(result.sent).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails closed for optional events when the preference store cannot be read', async () => {
    refs.sellerPrefsError = { message: 'database unavailable' }
    const result = await sendSellerPushToUser('u1', 'review.created', {
      title: 'New review',
      body: 'A buyer left a review.',
    })
    expect(result.sent).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })
})
