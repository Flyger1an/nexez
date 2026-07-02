import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, hasSupabaseAdminEnv } from '../utils/supabase/admin'

// Expo push delivery for Nexie. The mobile app registers an Expo push token per
// device (RLS-scoped to the user); async server flows (negotiation decisions, the
// Stripe webhook, refunds) fan out notifications by user id or account email.
//
// Sends are ALWAYS best-effort: a push failure must never break the money/negotiation
// flow that triggered it.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_BATCH = 100 // Expo accepts up to 100 messages per request

export type PushPlatform = 'ios' | 'android' | 'web' | 'unknown'

/** Buyer-facing push category → matched against the buyer's per-category opt-in. Omit for seller
 *  pushes (they aren't gated by the buyer facet's per-category prefs — only the master switch). */
export type PushCategory = 'orders' | 'alerts' | 'tasks'

export type PushMessage = {
  title: string
  body: string
  data?: Record<string, unknown>
  category?: PushCategory
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
      // best-effort — swallow so a push failure can't break the caller
    }
  }
  return { sent }
}

/**
 * User ids who should NOT receive this push: the master switch (notificationsEnabled === false), OR —
 * when a category is given — that category muted (notificationTypes[category] === false). A missing
 * category (seller pushes) is gated only by the master switch. Each pref defaults ON.
 */
async function pushOptedOutUserIds(
  admin: SupabaseClient,
  userIds: string[],
  category?: PushCategory,
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
    if (category) {
      const types = prefs.notificationTypes as Record<string, unknown> | undefined
      if (types && types[category] === false) out.add(row.user_id)
    }
  }
  return out
}

async function tokensBy(column: 'user_id' | 'email', value: string, category?: PushCategory): Promise<string[]> {
  if (!hasSupabaseAdminEnv()) return []
  const admin = createAdminClient()
  const base = admin.from('user_push_tokens').select('token, user_id')
  const { data } =
    column === 'email'
      ? await base.eq('email', value.toLowerCase()).returns<{ token: string; user_id: string }[]>()
      : await base.eq('user_id', value).returns<{ token: string; user_id: string }[]>()
  const rows = data ?? []
  if (!rows.length) return []
  // Respect each owner's notifications prefs (default ON; fail-open if the lookup fails).
  const optedOut = await pushOptedOutUserIds(
    createAdminClient(),
    [...new Set(rows.map((r) => r.user_id).filter(Boolean))],
    category,
  )
  return rows.filter((r) => !optedOut.has(r.user_id)).map((r) => r.token)
}

/** Push to all of a user's devices (by user id). Service-role; safe from webhooks/cron. */
export async function sendPushToUser(userId: string | null, message: PushMessage): Promise<{ sent: number }> {
  if (!userId) return { sent: 0 }
  return sendPushToTokens(await tokensBy('user_id', userId, message.category), message)
}

/** Push to all devices of the account with this email (negotiations key on buyer_email). */
export async function sendPushToEmail(email: string | null, message: PushMessage): Promise<{ sent: number }> {
  if (!email) return { sent: 0 }
  return sendPushToTokens(await tokensBy('email', email, message.category), message)
}
