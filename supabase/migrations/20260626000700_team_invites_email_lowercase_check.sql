-- Deferred-hardening (b): enforce the lowercase-email invariant on team_invites at the
-- DB. The app inserts lowercased emails and resolvePageAccess matches on lower(email)
-- with `.eq` (no wildcards), so a mixed-case row silently fails to match (deny). This
-- makes the invariant authoritative rather than convention - defense-in-depth for the
-- act-as-owner collaborator grant. Idempotent; existing rows already comply (verified 0
-- non-lowercase before applying).
update public.team_invites set email = lower(email) where email <> lower(email);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'team_invites_email_lowercase'
      and conrelid = 'public.team_invites'::regclass
  ) then
    alter table public.team_invites
      add constraint team_invites_email_lowercase check (email = lower(email));
  end if;
end $$;
