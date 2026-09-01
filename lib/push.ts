import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, hasSupabaseAdminEnv } from '../utils/supabase/admin'
import { shouldDeliverSellerNotification } from './server/seller-notification-preferences'
import type { SellerNotificationEvent, SellerNotificationPayloadType } from './seller-notification-policy'

// Expo push delivery for Nexxi. The mobile app registers an Expo push token per
// device (RLS-scoped to the user); async server flows (negotiation decisions, the
// Stripe webhook, refunds) fan out notifications by user id or account email.
//
// Sends are ALWAYS best-effort: a push failure must never break the money/negotiation
// flow that triggered it.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_BATCH = 100 // Expo accepts up to 100 messages per request

export type PushPlatform = 'ios' | 'android' | 'web' | 'unknown'

/** Buyer-facing push category matched against the buyer facet's per-category opt-in. */
export type PushCategory = 'orders' | 'alerts' | 'tasks'

export type PushMessage = {
  title: string
  body: string
  data?: Record<string, unknown>
}

export type BuyerPushMessage = PushMessage & { category: PushCategory }
export type SellerPushMessage = Omit<PushMessage, 'data'> & {
  data?: Record<string, unknown> & { type: SellerNotificationPayloadType }
}

/** Upsert a device's Expo push token. Pass the USER-SCOPED client (RLS enforces ownership). */
export async function registerPushToken(
  db: SupabaseClient,
  input: { userId: string; email: string | null; token: string; platform: PushPlatform; deviceName?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await db.from('user_push_tokens').upsert(
    {
      user_id: input.userId,
      email: input.email ? input.email.toLowerCase() : null,
      token: input.token,
      platform: input.platform,
      device_name: input.deviceName ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,token' },
  )
  return error ? { ok: false, error: error.message } : { ok: true }
}

function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[.+\]$/.test(token)
}

/** Low-level: deliver a message to a set of Expo push tokens (deduped, chunked). */
export async function sendPushToTokens(tokens: string[], message: PushMessage): Promise<{ sent: number }> {
  const valid = [...new Set(tokens)].filter(isExpoPushToken)
  if (!valid.length) return { sent: 0 }

  let sent = 0
  for (let i = 0; i < valid.length; i += EXPO_BATCH) {
    const batch = valid.slice(i, i + EXPO_BATCH).map((to) => ({
      to,
      title: message.title,
      body: message.body,
      data: message.data ?? {},
      sound: 'default',
    }))
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) sent += batch.length
    } catch {
      // best-effort - swallow so a push failure can't break the caller
    }
  }
  return { sent }
}

/**
 * User ids who should NOT receive this buyer push: the master switch
 * (notificationsEnabled === false), or that buyer category is muted. Each
 * preference defaults on.
 */
async function pushOptedOutUserIds(
  admin: SupabaseClient,
  userIds: string[],
  category: PushCategory,
): Promise<Set<string>> {
  const out = new Set<string>()
  if (!userIds.length) return out
  const { data } = await admin
    .from('user_agents')
    .select('user_id, preferences')
    .in('user_id', userIds)
    .returns<{ user_id: string; preferences: Record<string, unknown> | null }[]>()
  for (const row of data ?? []) {
    const prefs = row.preferences
    if (!prefs) continue
    if (prefs.notificationsEnabled === false) {
      out.add(row.user_id)
      continue
    }
    const types = prefs.notificationTypes as Record<string, unknown> | undefined
    if (types && types[category] === false) out.add(row.user_id)
  }
  return out
}

/** Distinct auth user ids that have a device registered under this email (for the activity feed). */
async function userIdsByEmail(email: string): Promise<string[]> {
  if (!hasSupabaseAdminEnv()) return []
  const { data } = await createAdminClient()
    .from('user_push_tokens')
    .select('user_id')
    .eq('email', email.toLowerCase())
    .returns<{ user_id: string }[]>()
  return [...new Set((data ?? []).map((r) => r.user_id).filter(Boolean))]
}

/**
 * Persist a buyer-facing notification to the in-app activity feed. Seller pushes
 * use a separate delivery function, so the two facets cannot mix. Recorded
 * regardless of push opt-out because the in-app feed is separate from device push.
 */
async function recordNotifications(userIds: string[], message: BuyerPushMessage): Promise<void> {
  if (!userIds.length || !hasSupabaseAdminEnv()) return
  const rows = userIds.map((user_id) => ({
    user_id,
    category: message.category,
    type: typeof message.data?.type === 'string' ? message.data.type : null,
    title: message.title,
    body: message.body,
    data: message.data ?? {},
  }))
  try {
    const { error } = await createAdminClient().from('notifications').insert(rows)
    if (error) console.warn('[push] notification record failed:', error.message)
  } catch {
    // best-effort - never break the push/money flow on a feed write
  }
}

async function buyerTokensBy(column: 'user_id' | 'email', value: string, category: PushCategory): Promise<string[]> {
  if (!hasSupabaseAdminEnv()) return []
  const admin = createAdminClient()
  const base = admin.from('user_push_tokens').select('token, user_id')
  const { data } =
    column === 'email'
      ? await base.eq('email', value.toLowerCase()).returns<{ token: string; user_id: string }[]>()
      : await base.eq('user_id', value).returns<{ token: string; user_id: string }[]>()
  const rows = data ?? []
  if (!rows.length) return []
  // Buyer settings remain on user_agents and never gate the seller facet.
  const optedOut = await pushOptedOutUserIds(
    createAdminClient(),
    [...new Set(rows.map((r) => r.user_id).filter(Boolean))],
    category,
  )
  return rows.filter((r) => !optedOut.has(r.user_id)).map((r) => r.token)
}

/** Push a buyer event to all of the buyer's devices. */
export async function sendPushToUser(userId: string | null, message: BuyerPushMessage): Promise<{ sent: number }> {
  if (!userId) return { sent: 0 }
  await recordNotifications([userId], message)
  return sendPushToTokens(await buyerTokensBy('user_id', userId, message.category), message)
}

/** Push a buyer event to devices resolved through the buyer's account email. */
export async function sendPushToEmail(email: string | null, message: BuyerPushMessage): Promise<{ sent: number }> {
  if (!email) return { sent: 0 }
  await recordNotifications(await userIdsByEmail(email), message)
  return sendPushToTokens(await buyerTokensBy('email', email, message.category), message)
}

/**
 * Push a seller event through the dedicated seller policy. Required transaction
 * events bypass preference reads; optional events honor the cross-device account
 * setting and never consult buyer-agent preferences.
 */
export async function sendSellerPushToUser(
  userId: string | null,
  event: SellerNotificationEvent,
  message: SellerPushMessage,
): Promise<{ sent: number }> {
  if (!userId || !hasSupabaseAdminEnv()) return { sent: 0 }
  const admin = createAdminClient()
  if (!(await shouldDeliverSellerNotification(admin, userId, event))) return { sent: 0 }

  const { data } = await admin
    .from('user_push_tokens')
    .select('token')
    .eq('user_id', userId)
    .returns<{ token: string }[]>()
  return sendPushToTokens((data ?? []).map((row) => row.token), message)
}
