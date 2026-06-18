-- Block the page ownership-takeover path (red-team HIGH, reproduced live).
--
-- An editor collaborator (role `authenticated`) could run UPDATE pages SET owner_id=self:
-- RLS lets it through because Postgres OR-combines permissive policies — the editor-
-- collaborator policy's USING matches the owner's row, while the separate "Owners can
-- update own pages" WITH CHECK (auth.uid() = NEW.owner_id) is satisfied by self-
-- assignment — and nothing pinned owner_id. The collaborator could thus seize sole
-- ownership of any shared page (original owner then loses access).
--
-- owner_id is set at INSERT and never legitimately changed by an UPDATE (verified: no
-- code path SETs pages.owner_id on update; duplicate/create use INSERT). Make it
-- immutable via a BEFORE UPDATE trigger (mirrors nz_pages_guard_domain_verification).
-- Triggers fire for every role regardless of RLS, so this closes the takeover for
-- authenticated AND service-role. Normal edits (name/slug/offers/custom_domain/…) are
-- unaffected — the guard only raises when owner_id actually changes.
--
-- The helper takes no table access, so it's SECURITY INVOKER; execute is revoked from
-- anon/authenticated/public anyway (it's a trigger helper, never called directly) —
-- avoiding the broad-default-grant hygiene gap the audit flagged elsewhere.

create or replace function public.nz_pages_pin_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'pages.owner_id is immutable (set at creation only)' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.nz_pages_pin_owner() from anon, authenticated, public;

drop trigger if exists nz_pages_pin_owner on public.pages;
create trigger nz_pages_pin_owner
  before update on public.pages
  for each row
  execute function public.nz_pages_pin_owner();
