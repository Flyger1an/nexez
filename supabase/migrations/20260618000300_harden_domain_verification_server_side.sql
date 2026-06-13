-- Make custom-domain verification server-owned.
--
-- The browser can still save `custom_domain`, but it must not be able to forge
-- `custom_domain_verified`. Verification is persisted only by the authenticated
-- server route after a DNS TXT lookup, and any domain change clears the old proof.

create or replace function public.nz_pages_guard_domain_verification()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  jwt_role text := current_setting('request.jwt.claim.role', true);
begin
  if new.custom_domain is distinct from old.custom_domain then
    new.custom_domain_verified = null;
  elsif jwt_role in ('anon', 'authenticated')
        and new.custom_domain_verified is distinct from old.custom_domain_verified then
    new.custom_domain_verified = old.custom_domain_verified;
  end if;

  return new;
end;
$function$;

revoke all on function public.nz_pages_guard_domain_verification() from public;

drop trigger if exists nz_pages_guard_domain_verification on public.pages;
create trigger nz_pages_guard_domain_verification
  before update on public.pages
  for each row
  execute function public.nz_pages_guard_domain_verification();

update public.pages
set custom_domain_verified = null
where custom_domain is null
  and custom_domain_verified is not null;
