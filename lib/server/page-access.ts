import 'server-only'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { getOwnerEntitlements } from './plan'

// THE security primitive for team collaboration on a page. Feature routes used to
// assume `req.user === page.owner` (gate on user.id + scope `.eq('owner_id', user.id)`),
// which blocked editor-collaborators. This resolves the page's ACTUAL owner and
// authorizes the requester as owner OR a non-revoked invited collaborator - so a route
// can then gate on + act as the PAGE OWNER (via the service-role client). Because the
// caller acts with the owner's privileges, ALL authorization MUST be decided here.
//
// Authoritative + fail-CLOSED by construction:
//   - reads page + invite with the SERVICE-ROLE client (decision never depends on the
//     caller's RLS);
//   - owner match is by user id; collaborator match is by the requester's VERIFIED auth
//     email (case-insensitively, never via ilike → no LIKE-wildcard injection);
//     ⚠️ this is load-bearing: the collaborator grant assumes userEmail is a CONFIRMED
//     address the caller controls. We now ENFORCE that - the collaborator branch fails
//     closed unless the caller passes a non-null `userEmailConfirmedAt` (Supabase auth
//     `email_confirmed_at`). Keep Supabase Auth "Confirm email" ON in prod (the
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
  // The COLLABORATOR grant joins on the requester's email, so it must be a CONFIRMED
  // address they control (Supabase auth `email_confirmed_at`). Pass it from the route's
  // authed user; absent/null fails the collaborator branch CLOSED. The owner-by-id
  // branch never needs it (an owner is the owner regardless of email state).
  userEmailConfirmedAt?: string | null
  requireEditor?: boolean
}): Promise<PageAccess | null> {
  const pageId = (opts.pageId || '').trim()
  const userId = (opts.userId || '').trim()
  if (!pageId || !userId || !hasSupabaseAdminEnv()) return null

  const admin = createAdminClient()
  const { data: page, error: pageError } = await admin
    .from('pages')
    .select('id, owner_id')
    .eq('id', pageId)
    .maybeSingle<{ id: string; owner_id: string | null }>()
  if (pageError || !page || !page.owner_id) return null

  // The page's own owner always has full access.
  if (page.owner_id === userId) return { pageId: page.id, ownerId: page.owner_id, role: 'owner' }

  // Otherwise: an ACCEPTED invite to THIS owner under the requester's verified email.
  // A merely-`pending` invite does NOT grant access - the invitee must explicitly accept
  // (POST /api/team/accept) first; this mirrors the `status = 'accepted'` RLS gate so the
  // app-layer act-as-owner path can't out-grant the database. Emails are stored lowercased
  // (insert path + client); compare on the lowercased value with `.eq` (exact, no
  // wildcards) - a mixed-case legacy row would simply fail to match, i.e. deny.
  const email = (opts.userEmail || '').trim().toLowerCase()
  if (!email) return null
  // Defense-in-depth (deferred-hardening a): the act-as-owner collaborator grant is
  // only as trustworthy as the email join key - require a CONFIRMED address. Fails
  // closed when the caller didn't pass a confirmation timestamp.
  if (!opts.userEmailConfirmedAt) return null

  // Service-role reads bypass the collaborator RLS policies (including the
  // entitlement-suspension ledger), so this helper must mirror BOTH parts of that
  // decision before it can grant act-as-owner access: the Team Collaboration feature
  // and the owner's finite seat allocation. Configuration remains retained after a
  // downgrade, but collaborators outside the oldest-N accepted seats stop executing.
  //
  // The database ranks accepted invitations before pending ones, then by
  // (created_at, id). Since only accepted invitations can authorize, selecting the
  // first N accepted rows is exactly the same active-seat set without exposing the
  // private suspension ledger through PostgREST.
  const entitlements = await getOwnerEntitlements(admin, page.owner_id)
  if (!entitlements.features.teamCollaboration) return null
  const seatLimit = entitlements.limits.teamSeats
  if (seatLimit !== null && (!Number.isInteger(seatLimit) || seatLimit <= 0)) return null

  let inviteQuery = admin
    .from('team_invites')
    .select('id, email, role, status, created_at')
    .eq('owner_id', page.owner_id)
    .eq('status', 'accepted')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (seatLimit !== null) inviteQuery = inviteQuery.limit(seatLimit)

  const { data: allocatedInvites, error: inviteError } = await inviteQuery.returns<Array<{
    id: string
    email: string
    role: string
    status: string
    created_at: string
  }>>()
  if (inviteError || !allocatedInvites) return null

  // Match the strongest allocated grant for this address. Multiple live invitations
  // should not normally exist, but RLS grants when ANY allocated editor row matches,
  // so the service-role path must not be stricter (or looser) than that policy.
  const emailMatches = allocatedInvites.filter((candidate) => candidate.email.trim().toLowerCase() === email)
  const invite = emailMatches.find((candidate) => candidate.role === 'editor') ?? emailMatches[0]
  if (!invite) return null

  const role: PageRole = invite.role === 'editor' ? 'editor' : 'viewer'
  if (opts.requireEditor && role !== 'editor') return null
  return { pageId: page.id, ownerId: page.owner_id, role }
}

export type FeatureOwner = {
  ownerId: string
  // The page the action is scoped to, or null in the page-less (create/sandbox) flow.
  pageId: string | null
  // true when scoped to an existing page → gate + act AS the owner via the service
  // role; false when self-gating the caller in the page-less flow.
  scoped: boolean
  role: PageRole
}
export type FeatureOwnerResult =
  | ({ ok: true } & FeatureOwner)
  | { ok: false; status: 403 | 503 }

/**
 * Resolve the OWNER a page-feature route must gate on, while authorizing the caller.
 * The OPTIONAL-page companion to resolvePageAccess, for feature routes that run both
 * inside the editor (a saved page → collaboration applies) AND in the page-less
 * create/sandbox flow (no page yet):
 *
 *   - pageId PRESENT → the caller must be the page OWNER or a non-revoked EDITOR
 *     invitee. Returns the PAGE owner with `scoped: true`; the route then gates + acts
 *     AS that owner via the service-role client. Denies (403) a stranger / viewer /
 *     missing page; 503 when the service-role env is absent (can't authorize).
 *   - pageId ABSENT → no page context: the caller acts as THEMSELVES (legacy
 *     self-gate). Returns { ownerId: userId, pageId: null, scoped: false }. Never denies.
 *
 * `requireEditor` defaults to true - these routes mutate/derive from page data, so a
 * viewer-collaborator must not pass.
 */
export async function resolveFeatureOwner(opts: {
  pageId: string | null | undefined
  userId: string
  userEmail: string | null | undefined
  userEmailConfirmedAt?: string | null
  requireEditor?: boolean
}): Promise<FeatureOwnerResult> {
  const pageId = (opts.pageId || '').trim()
  if (!pageId) {
    return { ok: true, ownerId: opts.userId, pageId: null, scoped: false, role: 'owner' }
  }
  if (!hasSupabaseAdminEnv()) return { ok: false, status: 503 }
  const access = await resolvePageAccess({
    pageId,
    userId: opts.userId,
    userEmail: opts.userEmail,
    userEmailConfirmedAt: opts.userEmailConfirmedAt,
    requireEditor: opts.requireEditor ?? true,
  })
  if (!access) return { ok: false, status: 403 }
  return { ok: true, ownerId: access.ownerId, pageId: access.pageId, scoped: true, role: access.role }
}
