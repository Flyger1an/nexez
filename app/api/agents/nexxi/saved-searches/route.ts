import { NextResponse, type NextRequest } from 'next/server'
import { authenticateNexxiRequest } from '../../../../../lib/agents/nexxi-auth'
import { enforceRateLimit } from '../../../../../lib/rate-limit'

export const maxDuration = 30

const MAX_QUERY = 120
const MAX_CATEGORY = 80

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

/**
 * GET /api/agents/nexxi/saved-searches - the buyer's standing searches (newest first).
 * Owner-scoped via RLS (buyer facet).
 */
export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexxi:saved-searches', 40, 60_000)
  if (limited) return limited

  const auth = await authenticateNexxiRequest(request)
  if (!auth.ok) return auth.response

  const { data, error } = await auth.db
    .from('saved_searches')
    .select('id, query, category, created_at')
    .order('created_at', { ascending: false })
    .returns<{ id: string; query: string; category: string; created_at: string }[]>()
  if (error) {
    console.error('[Nexxi] saved-searches list failed', error)
    return NextResponse.json({ error: 'Could not load your saved searches.' }, { status: 500 })
  }
  return NextResponse.json({
    ok: true,
    searches: (data ?? []).map((r) => ({ id: r.id, query: r.query, category: r.category, createdAt: r.created_at })),
  })
}

/**
 * POST /api/agents/nexxi/saved-searches { query?, category? } - save a standing search (idempotent).
 * Requires at least one of query/category. last_notified_at defaults to now() so only future
 * publishes trigger alerts (no backfill).
 */
export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexxi:saved-searches', 30, 60_000)
  if (limited) return limited

  const auth = await authenticateNexxiRequest(request)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as { query?: unknown; category?: unknown }
  const query = clean(body.query, MAX_QUERY)
  const category = clean(body.category, MAX_CATEGORY)
  if (!query && !category) {
    return NextResponse.json({ error: 'Add a search term or a category to save.' }, { status: 400 })
  }

  const { error } = await auth.db.from('saved_searches').insert({ user_id: auth.user.id, query, category })
  if (error && (error as { code?: string }).code !== '23505') {
    console.error('[Nexxi] save-search failed', error)
    return NextResponse.json({ error: 'Could not save this search.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, saved: true })
}

/**
 * DELETE /api/agents/nexxi/saved-searches { id } - remove a saved search. RLS scopes to the caller.
 */
export async function DELETE(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexxi:saved-searches', 30, 60_000)
  if (limited) return limited

  const auth = await authenticateNexxiRequest(request)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as { id?: unknown }
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'A valid saved-search id is required.' }, { status: 400 })
  }

  const { error } = await auth.db.from('saved_searches').delete().eq('id', id)
  if (error) {
    console.error('[Nexxi] delete-search failed', error)
    return NextResponse.json({ error: 'Could not remove this saved search.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
