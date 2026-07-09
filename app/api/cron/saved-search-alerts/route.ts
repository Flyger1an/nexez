import { NextResponse } from 'next/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { sendPushToUser } from '../../../../lib/push'
import { captureError } from '../../../../lib/observability'

// Saved-search alerts (Vercel cron - see vercel.json). For each buyer saved search, finds newly
// PUBLISHED catalog entries (since that search's last_notified_at) that match its query/category and
// pushes the buyer. sendPushToUser already honors each user's notifications pref (fail-open). We only
// advance last_notified_at when we actually notify, so a page can't be skipped between runs.
//
// Protected: scheduled runs must send `Authorization: Bearer ${CRON_SECRET}`.

export const maxDuration = 60
const PAGE_WINDOW_DAYS = 14 // bound the candidate set; we never backfill older publishes
const PAGE_LIMIT = 500
const SEARCH_LIMIT = 2000

type RecentPage = {
  slug: string
  name: string | null
  description: string | null
  industry: string | null
  location: string | null
  created_at: string
}
type SavedSearch = { id: string; user_id: string; query: string; category: string; last_notified_at: string }

function pageText(p: RecentPage): string {
  return `${p.name ?? ''} ${p.description ?? ''} ${p.industry ?? ''} ${p.location ?? ''}`.toLowerCase()
}

// Mirror the Discover client match: category exact (industry), query as a substring of the page text.
function matches(p: RecentPage, s: SavedSearch): boolean {
  if (s.category && (p.industry ?? '').toLowerCase() !== s.category.toLowerCase()) return false
  const q = s.query.trim().toLowerCase()
  if (q && !pageText(p).includes(q)) return false
  return true
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'cron_secret_not_configured' }, { status: 503 })
  }
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  }

  const admin = createAdminClient()
  const sinceIso = new Date(Date.now() - PAGE_WINDOW_DAYS * 86_400_000).toISOString()

  try {
    const { data: pages } = await admin
      .from('pages_public')
      // serving=true excludes PAUSED sellers (expired no-card trial): the service-role
      // client bypasses the anon RLS `is_published AND serving` gate, so without this a
      // paused seller's offline listings would still be pushed to buyers (who'd land on a
      // 404). serving is NOT NULL default true, so active/legacy/admin rows are unaffected.
      .select('slug, name, description, industry, location, created_at')
      .eq('is_published', true)
      .eq('serving', true)
      .gt('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(PAGE_LIMIT)
      .returns<RecentPage[]>()

    const recent = pages ?? []
    if (!recent.length) {
      return NextResponse.json({ ok: true, processed: 0, notified: 0, reason: 'no_new_pages' })
    }

    const { data: searches } = await admin
      .from('saved_searches')
      .select('id, user_id, query, category, last_notified_at')
      .limit(SEARCH_LIMIT)
      .returns<SavedSearch[]>()

    let notified = 0
    for (const s of searches ?? []) {
      const fresh = recent.filter((p) => p.created_at > s.last_notified_at && matches(p, s))
      if (!fresh.length) continue
      const label = s.query || s.category || 'your search'
      await sendPushToUser(s.user_id, {
        title: `New on Nexez for "${label}"`,
        body:
          fresh.length === 1
            ? `${fresh[0].name ?? 'A new business'} just matched your saved search.`
            : `${fresh.length} new businesses match your saved search.`,
        data: { type: 'saved_search', query: s.query, category: s.category },
        category: 'alerts',
      })
      await admin.from('saved_searches').update({ last_notified_at: new Date().toISOString() }).eq('id', s.id)
      notified += 1
    }

    return NextResponse.json({ ok: true, processed: (searches ?? []).length, notified })
  } catch (error) {
    captureError(error instanceof Error ? error : new Error('saved-search-alerts failed'), { scope: 'cron:saved-search-alerts' })
    return NextResponse.json({ ok: false, error: 'failed' }, { status: 500 })
  }
}
