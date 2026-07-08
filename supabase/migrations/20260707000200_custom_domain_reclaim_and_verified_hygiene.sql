-- Custom-domain deferred hardening, three pieces that share one trigger:
--
-- 1. Codify the out-of-band REVOKE (the function had broad EXECUTE at creation;
--    prod was fixed live but schema-as-code never recorded it).
-- 2. Stale-claim reclaim (the deferred-hardening (c) follow-up): an UNVERIFIED
--    claim by another account no longer blocks a real owner forever. Unverified
--    claims never routed traffic (the proxy serves only verified domains), so a
--    new claimant SUPERSEDES them - the squatted/typo'd claim is cleared. Once
--    a claim is VERIFIED it hard-blocks other accounts exactly as before.
-- 3. Verified-flag hygiene (the R3 "server-authoritative" refactor):
--    a. changing custom_domain drops custom_domain_verified - a DNS-TXT proof
--       belongs to ONE domain and must not ride along to a new one (the
--       Settings client already does this; now the DB does too).
--    b. a browser-key (authenticated role) write may never SET the verified
--       flag - only the verification route (service role) does. Clearing is
--       always allowed; unchanged echoes (the Settings save sends the current
--       value back) pass untouched.
--
-- Existing rows are unaffected: nothing is rewritten at apply time; the
-- supersede only fires when a NEW claim arrives on a squatted domain.

revoke execute on function public.nz_enforce_custom_domain_single_owner() from public;
revoke execute on function public.nz_enforce_custom_domain_single_owner() from anon;
revoke execute on function public.nz_enforce_custom_domain_single_owner() from authenticated;

create or replace function public.nz_enforce_custom_domain_single_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claims text := nullif(current_setting('request.jwt.claims', true), '');
  jwt_role text := '';
begin
  -- Defensive parse: the claim GUC can be absent, empty, or (in odd session
  -- states) non-JSON - none of those may crash a page write. Unparseable -> ''
  -- (treated as a direct/admin session, same as absent).
  if claims is not null then
    begin
      jwt_role := coalesce(claims::json ->> 'role', '');
    exception when others then
      jwt_role := '';
    end;
  end if;
  -- (3) verified-flag hygiene
  if tg_op = 'UPDATE' then
    if lower(btrim(coalesce(new.custom_domain, ''))) is distinct from lower(btrim(coalesce(old.custom_domain, ''))) then
      -- the proof was for the OLD domain
      new.custom_domain_verified := null;
    elsif new.custom_domain_verified is distinct from old.custom_domain_verified
      and new.custom_domain_verified is not null
      and jwt_role = 'authenticated' then
      raise exception 'custom_domain_verified is set by the domain verification flow, not directly'
        using errcode = 'insufficient_privilege';
    end if;
  elsif tg_op = 'INSERT' and new.custom_domain_verified is not null and jwt_role = 'authenticated' then
    -- a browser-key insert cannot arrive pre-verified
    new.custom_domain_verified := null;
  end if;

  if new.custom_domain is not null and btrim(new.custom_domain) <> '' then
    -- (2) a VERIFIED claim by another account hard-blocks, as before
    if exists (
      select 1 from public.pages p
      where lower(btrim(p.custom_domain)) = lower(btrim(new.custom_domain))
        and p.owner_id is distinct from new.owner_id
        and p.id <> new.id
        and p.custom_domain_verified is not null
    ) then
      raise exception 'custom_domain "%" is already connected to another Nexez account', new.custom_domain
        using errcode = 'unique_violation';
    end if;

    -- ...but stale UNVERIFIED claims by other accounts are superseded. The
    -- nested update re-fires this trigger for the cleared rows (their domain
    -- becomes null -> early exit), so recursion terminates after one level.
    update public.pages p
      set custom_domain = null, custom_domain_verified = null
      where lower(btrim(p.custom_domain)) = lower(btrim(new.custom_domain))
        and p.owner_id is distinct from new.owner_id
        and p.id <> new.id
        and p.custom_domain_verified is null;
  end if;

  return new;
end;
$$;

revoke execute on function public.nz_enforce_custom_domain_single_owner() from public;
revoke execute on function public.nz_enforce_custom_domain_single_owner() from anon;
revoke execute on function public.nz_enforce_custom_domain_single_owner() from authenticated;

drop trigger if exists trg_custom_domain_single_owner on public.pages;
create trigger trg_custom_domain_single_owner
  before insert or update of custom_domain, custom_domain_verified on public.pages
  for each row
  execute function public.nz_enforce_custom_domain_single_owner();
