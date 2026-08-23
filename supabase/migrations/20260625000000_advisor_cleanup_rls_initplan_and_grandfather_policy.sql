-- Advisor cleanup (launch readiness):
-- 1) auth_rls_initplan WARN on the two collaborator policies on public.pages -
--    they already wrapped auth in a subquery, but as `(select (auth.jwt() ->> 'email'))`,
--    which the linter doesn't recognize. Recreate with the canonical
--    `((select auth.jwt()) ->> 'email')` form (extraction outside the scalar
--    subquery) so it's a single init-plan eval AND the advisor clears. Semantics
--    are identical.
-- 2) rls_enabled_no_policy INFO on public.published_page_grandfather - a
--    service-role-managed table with no authenticated grant (harmless), but declare
--    intent with an owner-read policy + grant so the advisor clears. Baseline is
--    non-sensitive (the owner's grandfathered published-page allowance).

drop policy if exists "collaborators read shared pages" on public.pages;
create policy "collaborators read shared pages"
  on public.pages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.team_invites ti
      where ti.owner_id = pages.owner_id
        and lower(ti.email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
        and ti.status <> 'revoked'
    )
  );

drop policy if exists "editor collaborators update shared pages" on public.pages;
create policy "editor collaborators update shared pages"
  on public.pages
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.team_invites ti
      where ti.owner_id = pages.owner_id
        and lower(ti.email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
        and ti.status <> 'revoked'
        and ti.role = 'editor'
    )
  )
  with check (
    exists (
      select 1
      from public.team_invites ti
      where ti.owner_id = pages.owner_id
        and lower(ti.email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
        and ti.status <> 'revoked'
        and ti.role = 'editor'
    )
  );

grant select on public.published_page_grandfather to authenticated;
drop policy if exists "Owners can read own grandfather baseline" on public.published_page_grandfather;
create policy "Owners can read own grandfather baseline"
  on public.published_page_grandfather
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);
