-- Team access: collaborators (email match on non-revoked invite) read owner pages;
-- editors can update. ADDITIVE RLS (OR-combined) - owner/public policies unchanged.
create policy "collaborators read shared pages" on public.pages for select to authenticated
  using (exists (select 1 from public.team_invites ti where ti.owner_id = pages.owner_id
    and lower(ti.email) = lower(coalesce(auth.jwt() ->> 'email','')) and ti.status <> 'revoked'));

create policy "editor collaborators update shared pages" on public.pages for update to authenticated
  using (exists (select 1 from public.team_invites ti where ti.owner_id = pages.owner_id
    and lower(ti.email) = lower(coalesce(auth.jwt() ->> 'email','')) and ti.status <> 'revoked' and ti.role = 'editor'))
  with check (exists (select 1 from public.team_invites ti where ti.owner_id = pages.owner_id
    and lower(ti.email) = lower(coalesce(auth.jwt() ->> 'email','')) and ti.status <> 'revoked' and ti.role = 'editor'));
