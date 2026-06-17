import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { resolvePageAccess } from '../../../../lib/server/page-access'
import { buildDuplicatePayload } from '../../../../lib/duplicate-page'
import { OWNER_PAGE_SELECT, type AgentPage } from '../../../../lib/agent-page'
import { enforceRateLimit, rateLimitShared } from '../../../../lib/rate-limit'

/**
 * Duplicate a page. Previously a direct client insert with owner_id = the CALLER —
 * which, for an editor-collaborator, silently created the clone under the EDITOR's
 * own (Free) account instead of the owner's. Now a server route: it authorizes the
 * caller as owner OR editor of the source page, then clones it under the PAGE OWNER
 * via the service-role client (RLS would block an editor inserting a row owned by
 * someone else). The clone is then visible to the editor via the same collaborator
 * RLS. Unlisted /api/* → app host (owner/editor session).
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'page-duplicate', 20, 60_000)
  if (limited) return limited

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Not available on this deployment.' }, { status: 503 })
  }

  const body = (await request.json().catch(() => ({}))) as { pageId?: string }
  const pageId = String(body.pageId || '').trim()
  if (!pageId) return NextResponse.json({ error: 'pageId is required.' }, { status: 400 })

  const access = await resolvePageAccess({ pageId, userId: user.id, userEmail: user.email, userEmailConfirmedAt: user.email_confirmed_at, requireEditor: true })
  if (!access) return NextResponse.json({ error: 'You do not have edit access to this page.' }, { status: 403 })

  // Per-OWNER cap (on top of the per-IP limit) so an editor-collaborator can't inflate
  // the owner's workspace with cloned drafts (the publish-limit trigger only caps
  // PUBLISHED pages). Generous; abuse-ceiling, not a plan limit.
  const ownerCap = await rateLimitShared(`page-duplicate:owner:${access.ownerId}`, 30, 60 * 60_000)
  if (!ownerCap.ok) {
    return NextResponse.json({ error: 'Too many duplicates for this workspace right now — try again later.' }, { status: 429 })
  }

  const admin = createAdminClient()
  // Load the source page (ownership already proven) + the OWNER's existing slugs, both
  // via the admin client so a collaborator can read the owner's rows.
  const [{ data: source }, { data: owned }] = await Promise.all([
    admin.from('pages').select(OWNER_PAGE_SELECT).eq('id', access.pageId).maybeSingle<AgentPage>(),
    admin.from('pages').select('slug').eq('owner_id', access.ownerId).returns<{ slug: string }[]>(),
  ])
  if (!source) return NextResponse.json({ error: 'Page not found.' }, { status: 404 })

  const slugs = (owned ?? []).map((p) => p.slug)
  // Clone under the PAGE OWNER (not the caller). The published-page-limit trigger keys
  // on owner_id, so the owner's quota governs (admins are unlimited).
  const { data: created, error } = await admin
    .from('pages')
    .insert(buildDuplicatePayload(source, access.ownerId, slugs))
    .select('id, slug')
    .single<{ id: string; slug: string }>()
  if (error || !created) {
    return NextResponse.json({ error: error?.message || 'Could not duplicate the page.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: created.id, slug: created.slug })
}
