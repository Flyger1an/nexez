import { NextResponse, type NextRequest } from 'next/server'
import { authenticateNexxiRequest } from '../../../../../lib/agents/nexxi-auth'
import { enforceRateLimit } from '../../../../../lib/rate-limit'

export const maxDuration = 30

// Slugs are lowercase alphanumeric + hyphen; bound the length defensively.
function cleanSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const slug = value.trim().toLowerCase()
  return /^[a-z0-9-]{1,120}$/.test(slug) ? slug : null
}

/**
 * GET /api/agents/nexxi/saved - the authenticated buyer's saved business slugs (newest first).
 * Owner-scoped via RLS on saved_pages (buyer facet).
 */
export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexxi:saved', 40, 60_000)
  if (limited) return limited

  const auth = await authenticateNexxiRequest(request)
  if (!auth.ok) return auth.response

  const { data, error } = await auth.db
    .from('saved_pages')
    .select('slug, created_at')
    .order('created_at', { ascending: false })
    .returns<{ slug: string; created_at: string }[]>()
  if (error) {
    console.error('[Nexxi] saved list failed', error)
    return NextResponse.json({ error: 'Could not load your saved businesses.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, saved: (data ?? []).map((r) => ({ slug: r.slug, createdAt: r.created_at })) })
}

/**
 * POST /api/agents/nexxi/saved { slug } - save a business for the authenticated buyer (idempotent;
 * a repeat save is a no-op). The row's owner is the session user (RLS WITH CHECK enforces it).
 */
export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexxi:saved', 30, 60_000)
  if (limited) return limited

  const auth = await authenticateNexxiRequest(request)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as { slug?: unknown }
  const slug = cleanSlug(body.slug)
  if (!slug) return NextResponse.json({ error: 'A valid business slug is required.' }, { status: 400 })

  // Idempotent: ignore a duplicate (unique user_id+slug → 23505).
  const { error } = await auth.db.from('saved_pages').insert({ user_id: auth.user.id, slug })
  if (error && (error as { code?: string }).code !== '23505') {
    console.error('[Nexxi] save failed', error)
    return NextResponse.json({ error: 'Could not save this business.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, saved: true })
}

/**
 * DELETE /api/agents/nexxi/saved { slug } - unsave a business. RLS scopes the delete to the caller.
 */
export async function DELETE(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexxi:saved', 30, 60_000)
  if (limited) return limited

  const auth = await authenticateNexxiRequest(request)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as { slug?: unknown }
  const slug = cleanSlug(body.slug)
  if (!slug) return NextResponse.json({ error: 'A valid business slug is required.' }, { status: 400 })

  const { error } = await auth.db.from('saved_pages').delete().eq('slug', slug)
  if (error) {
    console.error('[Nexxi] unsave failed', error)
    return NextResponse.json({ error: 'Could not remove this business.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, saved: false })
}
