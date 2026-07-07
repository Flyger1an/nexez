import { NextResponse, type NextRequest } from 'next/server'
import { authenticateNexieRequest } from '../../../../../lib/agents/nexie-auth'
import { enforceRateLimit } from '../../../../../lib/rate-limit'

export const maxDuration = 30

const LIST_LIMIT = 50

type Row = {
  id: string
  category: string
  type: string | null
  title: string
  body: string
  data: Record<string, unknown> | null
  read_at: string | null
  created_at: string
}

/** GET - the buyer's in-app activity feed (newest first) + unread count. Owner-scoped via RLS. */
export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexie:notifications', 60, 60_000)
  if (limited) return limited

  const auth = await authenticateNexieRequest(request)
  if (!auth.ok) return auth.response

  const { data, error } = await auth.db
    .from('notifications')
    .select('id, category, type, title, body, data, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT)
    .returns<Row[]>()
  if (error) {
    console.error('[Nexie] notifications list failed', error)
    return NextResponse.json({ error: 'Could not load your activity.' }, { status: 500 })
  }

  const rows = data ?? []
  return NextResponse.json({
    ok: true,
    unreadCount: rows.filter((r) => !r.read_at).length,
    notifications: rows.map((r) => ({
      id: r.id,
      category: r.category,
      type: r.type,
      title: r.title,
      body: r.body,
      data: r.data ?? {},
      read: Boolean(r.read_at),
      createdAt: r.created_at,
    })),
  })
}

/**
 * PATCH { id } | { all: true } - mark one notification, or all unread, as read. RLS scopes writes to
 * the caller, so no explicit user_id filter is needed for safety (it's owner-only either way).
 */
export async function PATCH(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexie:notifications', 60, 60_000)
  if (limited) return limited

  const auth = await authenticateNexieRequest(request)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as { id?: unknown; all?: unknown }
  const nowIso = new Date().toISOString()

  let query = auth.db.from('notifications').update({ read_at: nowIso }).is('read_at', null)
  if (body.all === true) {
    // mark every unread as read (the `is('read_at', null)` above already scopes to unread)
  } else if (typeof body.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id)) {
    query = query.eq('id', body.id)
  } else {
    return NextResponse.json({ error: 'Provide a valid id, or { all: true }.' }, { status: 400 })
  }

  const { error } = await query
  if (error) {
    console.error('[Nexie] notifications mark-read failed', error)
    return NextResponse.json({ error: 'Could not update your activity.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
