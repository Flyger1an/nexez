import { NextResponse } from 'next/server'
import { requirePageAccess } from '../../../../lib/server/require-page-access'
import { buildDuplicatePayload } from '../../../../lib/duplicate-page'
import { OWNER_PAGE_SELECT, type AgentPage } from '../../../../lib/agent-page'
import { enforceRateLimit, rateLimitShared } from '../../../../lib/rate-limit'

/**
 * Duplicate a page. Previously a direct client insert with owner_id = the CALLER -
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

  // The body is read inside the resolver so the check order the tests rely on is
  // preserved: 401 before 503 before the 400 for a missing pageId.
  const gate = await requirePageAccess({
    pageId: async () => {
      const body = (await request.json().catch(() => ({}))) as { pageId?: string }
      const requested = String(body.pageId || '').trim()
      if (!requested) return NextResponse.json({ error: 'pageId is required.' }, { status: 400 })
      return requested
    },
    unavailableMessage: 'Not available on this deployment.',
  })
  if (!gate.ok) return gate.response
  const { access, admin } = gate
  const pageId = access.pageId

  // Per-OWNER cap (on top of the per-IP limit) so an editor-collaborator can't inflate
  // the owner's workspace with cloned drafts (the publish-limit trigger only caps
  // PUBLISHED pages). Generous; abuse-ceiling, not a plan limit.
  const ownerCap = await rateLimitShared(`page-duplicate:owner:${access.ownerId}`, 30, 60 * 60_000)
  if (!ownerCap.ok) {
    return NextResponse.json({ error: 'Too many duplicates for this workspace right now - try again later.' }, { status: 429 })
  }

  // Load the source page (ownership already proven) + the OWNER's existing slugs, both
  // via the admin client so a collaborator can read the owner's rows.
  const [{ data: source }, { data: owned }] = await Promise.all([
    admin.from('pages').select(OWNER_PAGE_SELECT).eq('id', access.pageId).maybeSingle<AgentPage>(),
    admin.from('pages').select('slug').eq('owner_id', access.ownerId).returns<{ slug: string }[]>(),
  ])
  if (!source) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })

  const slugs = (owned ?? []).map((p) => p.slug)
  // Clone under the PAGE OWNER (not the caller). The published-page-limit trigger keys
  // on owner_id, so the owner's quota governs (admins are unlimited).
  //
  // The payload dedupes against the OWNER's slugs, but pages.slug is GLOBALLY unique -
  // another owner may hold the candidate. On a unique violation (23505), add the
  // conflicted slug to the exclusion set and rebuild, so the deterministic suffix walk
  // converges instead of surfacing a 500.
  for (let attempt = 0; attempt < 5; attempt++) {
    const payload = buildDuplicatePayload(source, access.ownerId, slugs)
    const { data: created, error } = await admin
      .from('pages')
      .insert(payload)
      .select('id, slug')
      .single<{ id: string; slug: string }>()
    if (created) return NextResponse.json({ ok: true, id: created.id, slug: created.slug })
    if ((error as { code?: string } | null)?.code === '23505') {
      slugs.push(payload.slug)
      continue
    }
    return NextResponse.json({ error: error?.message || 'Could not duplicate the listing.' }, { status: 500 })
  }
  return NextResponse.json({ error: 'Could not find a free name for the copy - try again.' }, { status: 409 })
}
