import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'

/**
 * Data export (GDPR/CCPA hygiene): returns everything we hold for the
 * authenticated user as a JSON download. Uses the session (RLS-scoped) client,
 * so only the caller's own rows are returned. Secrets (API key hashes, webhook
 * secrets) are intentionally excluded.
 */
export async function GET() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // RLS limits each of these to the caller's own rows.
  const safe = async <T>(p: PromiseLike<{ data: T | null }>): Promise<T | []> => {
    try {
      const { data } = await p
      return (data ?? []) as T
    } catch {
      return []
    }
  }

  const [pages, events, visits, negotiations, apiKeys] = await Promise.all([
    safe(supabase.from('pages').select('*').eq('owner_id', user.id)),
    safe(supabase.from('checkout_events').select('*').eq('owner_id', user.id).limit(5000)),
    safe(supabase.from('agent_visits').select('*').eq('owner_id', user.id).limit(5000)),
    safe(supabase.from('agent_negotiations').select('*').eq('owner_id', user.id)),
    // Never export key_hash.
    safe(supabase.from('api_keys').select('id, name, prefix, last_used_at, revoked_at, created_at').eq('owner_id', user.id)),
  ])

  const payload = {
    exported_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      profile: user.user_metadata ?? {},
    },
    pages,
    checkout_events: events,
    agent_visits: visits,
    negotiations,
    api_keys: apiKeys,
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="nexez-export-${user.id}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
