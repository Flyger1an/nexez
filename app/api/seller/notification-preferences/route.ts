import { NextResponse, type NextRequest } from 'next/server'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { resolveRequestAuth } from '../../../../lib/server/request-auth'
import {
  loadSellerNotificationPreferences,
  SELLER_NOTIFICATION_PREFERENCES_SELECT,
} from '../../../../lib/server/seller-notification-preferences'
import {
  parseSellerNotificationPreferencePatch,
  sellerNotificationPreferencePatchToRow,
  sellerNotificationPreferencesFromRow,
  type SellerNotificationPreferencesRow,
} from '../../../../lib/seller-notification-policy'

export const maxDuration = 20

function unauthorized() {
  return NextResponse.json(
    { error: 'Sign in to manage seller notification preferences.', code: 'auth_required' },
    { status: 401 },
  )
}

export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'seller:notification-preferences:get', 40, 60_000)
  if (limited) return limited

  const { supabase, user } = await resolveRequestAuth(request)
  if (!user) return unauthorized()

  try {
    const result = await loadSellerNotificationPreferences(supabase, user.id)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('[seller-notifications] preference load failed', error)
    return NextResponse.json({ error: 'Could not load notification preferences.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'seller:notification-preferences:patch', 30, 60_000)
  if (limited) return limited

  const { supabase, user } = await resolveRequestAuth(request)
  if (!user) return unauthorized()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected a preferences object.' }, { status: 400 })
  }
  const topLevel = body as Record<string, unknown>
  const topLevelKeys = Object.keys(topLevel)
  if (topLevelKeys.length !== 1 || topLevelKeys[0] !== 'preferences') {
    return NextResponse.json({ error: 'Only the preferences field is accepted.' }, { status: 400 })
  }

  const parsed = parseSellerNotificationPreferencePatch(topLevel.preferences)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const { data, error } = await supabase
      .from('seller_notification_preferences')
      .upsert(
        { user_id: user.id, ...sellerNotificationPreferencePatchToRow(parsed.patch) },
        { onConflict: 'user_id' },
      )
      .select(SELLER_NOTIFICATION_PREFERENCES_SELECT)
      .single<SellerNotificationPreferencesRow>()

    if (error || !data) throw error ?? new Error('Preference row was not returned.')
    return NextResponse.json({
      ok: true,
      configured: true,
      preferences: sellerNotificationPreferencesFromRow(data),
    })
  } catch (error) {
    console.error('[seller-notifications] preference update failed', error)
    return NextResponse.json({ error: 'Could not save notification preferences.' }, { status: 500 })
  }
}
