-- Keep the SECURITY DEFINER vector matcher behind the service role. Public
-- agent search still returns only the public page projection in application code.
revoke execute on function public.match_nexie_pages(extensions.vector, integer)
  from public, anon, authenticated;
grant execute on function public.match_nexie_pages(extensions.vector, integer)
  to service_role;

-- The page relation is used by intake cleanup and ownership workflows.
create index if not exists intake_sessions_page_id_idx
  on public.intake_sessions (page_id);

-- Combine equivalent SELECT and UPDATE policies. This preserves owner and
-- accepted-collaborator access while avoiding multiple permissive-policy plans.
drop policy if exists "Owners can read own pages" on public.pages;
drop policy if exists "collaborators read shared pages" on public.pages;

create policy "owners and collaborators read pages"
  on public.pages
  for select
  to authenticated
  using (
    (select auth.uid()) = owner_id
    or exists (
      select 1
      from public.team_invites as invite
      where invite.owner_id = pages.owner_id
        and invite.status = 'accepted'
        and lower(invite.email) = lower(
          coalesce((select auth.jwt()) ->> 'email', '')
        )
    )
  );

drop policy if exists "Owners can update own pages" on public.pages;
drop policy if exists "editor collaborators update shared pages" on public.pages;

create policy "owners and editor collaborators update pages"
  on public.pages
  for update
  to authenticated
  using (
    (select auth.uid()) = owner_id
    or exists (
      select 1
      from public.team_invites as invite
      where invite.owner_id = pages.owner_id
        and invite.status = 'accepted'
        and invite.role = 'editor'
        and lower(invite.email) = lower(
          coalesce((select auth.jwt()) ->> 'email', '')
        )
    )
  )
  with check (
    (select auth.uid()) = owner_id
    or exists (
      select 1
      from public.team_invites as invite
      where invite.owner_id = pages.owner_id
        and invite.status = 'accepted'
        and invite.role = 'editor'
        and lower(invite.email) = lower(
          coalesce((select auth.jwt()) ->> 'email', '')
        )
    )
  );

-- Keep one read policy for owners and invitees, then separate owner-only write
-- policies so SELECT does not overlap with an ALL policy.
drop policy if exists "owners manage own invites" on public.team_invites;
drop policy if exists "Invitees can read their own invites" on public.team_invites;
drop policy if exists "invitees read own invites" on public.team_invites;

create policy "owners and invitees read invites"
  on public.team_invites
  for select
  to authenticated
  using (
    (select auth.uid()) = owner_id
    or lower(email) = lower(
      coalesce((select auth.jwt()) ->> 'email', '')
    )
  );

create policy "owners create invites"
  on public.team_invites
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "owners update invites"
  on public.team_invites
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "owners delete invites"
  on public.team_invites
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);
