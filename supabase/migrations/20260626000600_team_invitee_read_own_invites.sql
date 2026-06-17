-- The team collaborator page-access policies (20260603220000 / …240000) grant an
-- invitee read/edit on the owner's pages via `exists(select 1 from team_invites ...)`.
-- But team_invites RLS ("owners manage own invites", auth.uid() = owner_id) only lets
-- the OWNER read their invites — so when that subquery runs in the INVITEE's session,
-- RLS hides the very invite row meant to grant access, and exists() returns false. The
-- same gap silently broke the dashboard "Shared with me" query (team_invites filtered
-- by the invitee's email returned nothing). Net: collaboration never worked end-to-end.
--
-- Fix: let an authenticated user READ invites addressed to THEIR OWN verified email.
-- Unblocks both the page-access policy subquery and the dashboard query. SELECT-only
-- (invitees can't manage invites — the owner FOR ALL policy still governs writes) and
-- scoped to the user's own email (no cross-tenant leak; you only ever see invites sent
-- to you). Additive + idempotent. Matches the init-plan-optimized auth.jwt() style.

drop policy if exists "invitees read own invites" on public.team_invites;
create policy "invitees read own invites"
  on public.team_invites
  for select
  to authenticated
  using (lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), '')));
