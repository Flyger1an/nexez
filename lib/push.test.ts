import { describe, it, expect, vi, beforeEach } from 'vitest'

// Verifies the per-category push opt-in gating added for finer notification prefs. We mock the admin
// client (token lookup + preferences) and the Expo fetch, then assert who gets a send.

const { adminRef } = vi.hoisted(() => ({
  adminRef: { tokens: [] as any[], prefsRows: [] as any[], recorded: [] as any[] },
}))

vi.mock('../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => true,
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => {
        const result = table === 'user_push_tokens' ? { data: adminRef.tokens } : { data: adminRef.prefsRows }
        const leaf = { returns: () => Promise.resolve(result) }
        return { eq: () => leaf, in: () => leaf }
      },
      insert: (rows: any[]) => {
        adminRef.recorded.push(...rows)
        return Promise.resolve({ error: null })
      },
    }),
  }),
}))

import { sendPushToUser } from './push'

const TOKEN = 'ExponentPushToken[abc123]'

beforeEach(() => {
  adminRef.tokens = [{ token: TOKEN, user_id: 'u1' }]
  adminRef.prefsRows = [{ user_id: 'u1', preferences: { notificationsEnabled: true, notificationTypes: { orders: true, alerts: true, tasks: true } } }]
  adminRef.recorded = []
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true }) as any))
})

describe('sendPushToUser - category gating', () => {
  it('sends when the category is enabled', async () => {
    expect((await sendPushToUser('u1', { title: 't', body: 'b', category: 'alerts' })).sent).toBe(1)
  })

  it('skips when that specific category is muted', async () => {
    adminRef.prefsRows = [{ user_id: 'u1', preferences: { notificationsEnabled: true, notificationTypes: { orders: true, alerts: false, tasks: true } } }]
    expect((await sendPushToUser('u1', { title: 't', body: 'b', category: 'alerts' })).sent).toBe(0)
    // A different category on the same user still goes through.
    expect((await sendPushToUser('u1', { title: 't', body: 'b', category: 'orders' })).sent).toBe(1)
  })

  it('an uncategorized push (seller-style) is NOT gated by the buyer category prefs', async () => {
    adminRef.prefsRows = [{ user_id: 'u1', preferences: { notificationsEnabled: true, notificationTypes: { orders: false, alerts: false, tasks: false } } }]
    expect((await sendPushToUser('u1', { title: 't', body: 'b' })).sent).toBe(1)
  })

  it('the master switch mutes every category', async () => {
    adminRef.prefsRows = [{ user_id: 'u1', preferences: { notificationsEnabled: false, notificationTypes: { orders: true, alerts: true, tasks: true } } }]
    expect((await sendPushToUser('u1', { title: 't', body: 'b', category: 'orders' })).sent).toBe(0)
    expect((await sendPushToUser('u1', { title: 't', body: 'b' })).sent).toBe(0)
  })

  it('missing notificationTypes (legacy prefs) → category treated as ON', async () => {
    adminRef.prefsRows = [{ user_id: 'u1', preferences: { notificationsEnabled: true } }]
    expect((await sendPushToUser('u1', { title: 't', body: 'b', category: 'tasks' })).sent).toBe(1)
  })
})

describe('sendPushToUser - activity-feed recording', () => {
  it('records a buyer push (category set) even when that category push is muted', async () => {
    // Push muted for 'alerts', but the in-app feed still records it (feed ≠ device push).
    adminRef.prefsRows = [{ user_id: 'u1', preferences: { notificationsEnabled: true, notificationTypes: { orders: true, alerts: false, tasks: true } } }]
    const res = await sendPushToUser('u1', { title: 'New match', body: 'b', category: 'alerts', data: { type: 'saved_search' } })
    expect(res.sent).toBe(0) // push suppressed
    expect(adminRef.recorded).toHaveLength(1) // but recorded to the feed
    expect(adminRef.recorded[0]).toMatchObject({ user_id: 'u1', category: 'alerts', type: 'saved_search', title: 'New match' })
  })

  it('does NOT record an uncategorized (seller) push - the buyer feed never mixes the seller facet', async () => {
    await sendPushToUser('u1', { title: 'New order', body: 'b', data: { type: 'order' } })
    expect(adminRef.recorded).toHaveLength(0)
  })
})
