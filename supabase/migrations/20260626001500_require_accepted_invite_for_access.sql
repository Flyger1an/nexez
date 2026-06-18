-- Require an ACCEPTED invite for collaborator page access.
--
-- The collaborator SELECT/UPDATE policies on `pages` granted access to ANY non-revoked
-- invite — so a merely-`pending` invite gave read/edit to whoever signed up with the
-- invited email, before that person ever consciously accepted. Tighten the gate to
-- `status = 'accepted'`. A new /api/team/accept flow flips pending -> accepted on the
-- invitee's explicit click from the invite email; resolvePageAccess matches this gate.
--
-- Grandfather: existing `pending` invites already had access under the old gate, so flip
-- them to `accepted` to preserve current collaboration (no access regression). Only NEW
-- invites land in the stricter pending state. (`revoked` is untouched.)
update public.team_invites set status = 'accepted' where status = 'pending';

drop policy if exists "collaborators read shared pages" on public.pages;
create policy "collaborators read shared pages" on public.pages
  for select to authenticated
  using (
    exists (
      select 1 from public.team_invites ti
      where ti.owner_id = pages.owner_id
        and lower(ti.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        and ti.status = 'accepted'
    )
  );

drop policy if exists "editor collaborators update shared pages" on public.pages;
create policy "editor collaborators update shared pages" on public.pages
  for update to authenticated
  using (
    exists (
      select 1 from public.team_invites ti
      where ti.owner_id = pages.owner_id
        and lower(ti.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        and ti.status = 'accepted'
        and ti.role = 'editor'
    )
  )
  with check (
    exists (
      select 1 from public.team_invites ti
      where ti.owner_id = pages.owner_id
        and lower(ti.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        and ti.status = 'accepted'
        and ti.role = 'editor'
    )
  );
