import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

/**
 * Permanently delete the authenticated user's account and all associated data.
 * The target is ALWAYS the session user — never accepted from the request body —
 * so a session can only ever delete its own account. Requires the service-role
 * client to remove the auth user.
 */
export async function POST() {
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json(
      { error: 'Account deletion is not available on this deployment (missing service role key).' },
      { status: 503 },
    )
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const admin = createAdminClient()
  const ownerId = user.id

  // Explicit, owner-scoped deletes (robust regardless of FK cascade config).
  const ownerScoped = ['checkout_events', 'agent_visits', 'agent_negotiations', 'api_keys', 'page_secrets', 'pages']
  for (const table of ownerScoped) {
    try {
      await admin.from(table).delete().eq('owner_id', ownerId)
    } catch {
      // ignore missing tables / already-clean
    }
  }

  const { error } = await admin.auth.admin.deleteUser(ownerId)
  if (error) {
    return NextResponse.json({ error: `Could not delete account: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
