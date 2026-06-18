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

export type PushMessage = {
  title: string
  body: string
  data?: Record<string, unknown>
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

async function tokensBy(column: 'user_id' | 'email', value: string): Promise<string[]> {
  if (!hasSupabaseAdminEnv()) return []
  const admin = createAdminClient()
  const base = admin.from('user_push_tokens').select('token')
  const { data } =
    column === 'email'
      ? await base.eq('email', value.toLowerCase()).returns<{ token: string }[]>()
      : await base.eq('user_id', value).returns<{ token: string }[]>()
  return (data ?? []).map((r) => r.token)
}

/** Push to all of a user's devices (by user id). Service-role; safe from webhooks/cron. */
export async function sendPushToUser(userId: string | null, message: PushMessage): Promise<{ sent: number }> {
  if (!userId) return { sent: 0 }
  return sendPushToTokens(await tokensBy('user_id', userId), message)
}

/** Push to all devices of the account with this email (negotiations key on buyer_email). */
export async function sendPushToEmail(email: string | null, message: PushMessage): Promise<{ sent: number }> {
  if (!email) return { sent: 0 }
  return sendPushToTokens(await tokensBy('email', email), message)
}
