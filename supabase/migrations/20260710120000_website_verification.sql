-- Plugin Pivot Phase 1: external-website ownership proof, DECOUPLED from custom_domain.
--
-- A listing owner proves they control the host in pages.website_url (their EXISTING
-- site, NOT pointed at Nexez) via DNS TXT / meta tag / well-known file. The proof
-- unlocks the Agent-Ready Kit "verified" state + the onboarding step. It confers NO
-- routing/serving rights (unlike custom_domain), so there is no cross-owner
-- exclusivity requirement in Phase 1.

alter table public.pages
  add column if not exists website_verified_at timestamptz,
  add column if not exists website_verified_method text
    constraint pages_website_verified_method_check
    check (website_verified_method is null or website_verified_method in ('dns','meta','file'));

comment on column public.pages.website_verified_at is
  'Proof the owner controls the host in website_url (DNS TXT / meta tag / well-known file). Set only by /api/pages/[id]/verify-website via the service role. Cleared whenever website_url changes.';

-- Guard: browser roles (anon/authenticated) can never set or alter the proof, and any
-- website_url change clears it (the proof belonged to the OLD url). Style mirrors the
-- newer nz_enforce_custom_domain_single_owner (20260707000200): defensive jwt parse +
-- INSERT coverage (the older domain guard was UPDATE-only).
create or replace function public.nz_pages_guard_website_verification()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  claims text := nullif(current_setting('request.jwt.claims', true), '');
  jwt_role text := '';
begin
  if claims is not null then
    begin
      jwt_role := coalesce(claims::json ->> 'role', '');
    exception when others then
      jwt_role := '';
    end;
  end if;

  if tg_op = 'INSERT' then
    if jwt_role in ('anon', 'authenticated') then
      new.website_verified_at := null;
      new.website_verified_method := null;
    end if;
    return new;
  end if;

  if new.website_url is distinct from old.website_url then
    -- Proof belonged to the previous URL; any change (even path-only) re-requires it.
    new.website_verified_at := null;
    new.website_verified_method := null;
  elsif jwt_role in ('anon', 'authenticated')
        and (new.website_verified_at is distinct from old.website_verified_at
             or new.website_verified_method is distinct from old.website_verified_method) then
    -- Silent revert (matches the custom-domain guard behavior): browser roles keep
    -- their other edits, the verification fields stay server-authoritative.
    new.website_verified_at := old.website_verified_at;
    new.website_verified_method := old.website_verified_method;
  end if;
  return new;
end;
$$;

revoke all on function public.nz_pages_guard_website_verification() from public, anon, authenticated;

drop trigger if exists nz_pages_guard_website_verification on public.pages;
create trigger nz_pages_guard_website_verification
  before insert or update on public.pages
  for each row execute function public.nz_pages_guard_website_verification();

-- Pending verification token, SEPARATE from domain_verification_token: the two flows
-- run concurrently and each clears its token on success — sharing one column would
-- cross-clobber. page_secrets uses COLUMN-level SELECT grants (20260708000000), so the
-- new column needs an explicit grant or the settings UI cannot read it back.
alter table public.page_secrets
  add column if not exists website_verification_token text;

grant select (website_verification_token) on public.page_secrets to authenticated;

-- NOTE: deliberately NOT added to the pages_public projection — verification state is
-- owner-facing; owner reads come from the base pages table under RLS.
