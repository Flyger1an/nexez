import 'server-only'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

// THE security primitive for team collaboration on a page. Feature routes used to
// assume `req.user === page.owner` (gate on user.id + scope `.eq('owner_id', user.id)`),
// which blocked editor-collaborators. This resolves the page's ACTUAL owner and
// authorizes the requester as owner OR a non-revoked invited collaborator — so a route
// can then gate on + act as the PAGE OWNER (via the service-role client). Because the
// caller acts with the owner's privileges, ALL authorization MUST be decided here.
//
// Authoritative + fail-CLOSED by construction:
//   - reads page + invite with the SERVICE-ROLE client (decision never depends on the
//     caller's RLS);
//   - owner match is by user id; collaborator match is by the requester's VERIFIED auth
//     email (case-insensitively, never via ilike → no LIKE-wildcard injection);
//     ⚠️ this is load-bearing: the collaborator grant assumes userEmail is a CONFIRMED
//     address the caller controls. Keep Supabase Auth "Confirm email" ON in prod (the
//     pre-existing collaborator RLS in 20260603220000 relies on the same assumption);
//   - `requireEditor` rejects viewers for any write/feature action;
//   - any missing piece (no admin env, no page, no owner, no email, no live invite)
//     returns null → the caller denies. It can only ever GRANT the page's own owner.

export type PageRole = 'owner' | 'editor' | 'viewer'
export type PageAccess = { pageId: string; ownerId: string; role: PageRole }

export async function resolvePageAccess(opts: {
  pageId: string | null | undefined
  userId: string | null | undefined
  userEmail: string | null | undefined
  requireEditor?: boolean
}): Promise<PageAccess | null> {
  const pageId = (opts.pageId || '').trim()
  const userId = (opts.userId || '').trim()
  if (!pageId || !userId || !hasSupabaseAdminEnv()) return null

  const admin = createAdminClient()
  const { data: page } = await admin
    .from('pages')
    .select('id, owner_id')
    .eq('id', pageId)
    .maybeSingle<{ id: string; owner_id: string | null }>()
  if (!page || !page.owner_id) return null

  // The page's own owner always has full access.
  if (page.owner_id === userId) return { pageId: page.id, ownerId: page.owner_id, role: 'owner' }

  // Otherwise: a non-revoked invite to THIS owner under the requester's verified email.
  // Emails are stored lowercased (insert path + client); compare on the lowercased
  // value with `.eq` (exact, no wildcards) — a mixed-case legacy row would simply
  // fail to match, i.e. deny, which is the safe direction.
  const email = (opts.userEmail || '').trim().toLowerCase()
  if (!email) return null
  const { data: invite } = await admin
    .from('team_invites')
    .select('role, status')
    .eq('owner_id', page.owner_id)
    .eq('email', email)
    .neq('status', 'revoked')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ role: string; status: string }>()
  if (!invite) return null

  const role: PageRole = invite.role === 'editor' ? 'editor' : 'viewer'
  if (opts.requireEditor && role !== 'editor') return null
  return { pageId: page.id, ownerId: page.owner_id, role }
}
