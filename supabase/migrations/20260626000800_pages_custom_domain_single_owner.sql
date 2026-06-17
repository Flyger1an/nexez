-- Deferred-hardening (c): a custom_domain may be claimed by AT MOST ONE account.
-- Two DIFFERENT owners holding the same custom_domain produced ambiguous proxy
-- resolution + cross-tenant Vercel attach/remove. A plain global-UNIQUE index is WRONG
-- here — multi-page custom domains (a real feature) legitimately put the SAME
-- custom_domain on several of the SAME owner's pages (distinguished by domain_path).
-- So enforce "one domain -> one owner" with a trigger: block a DIFFERENT owner from
-- claiming a domain another account already holds, while letting the owner reuse it
-- across their own pages. The proxy already only serves a custom domain whose
-- custom_domain_verified is set (DNS-TXT ownership proof), so this closes the remaining
-- collision/attach surface. (An UNVERIFIED stale claim still blocks a later real owner —
-- a low-severity, support-resolvable edge; full reclaim/expiry is a separate follow-up.)
-- Existing rows already satisfy this (4 distinct domains, no cross-owner collisions).

create index if not exists pages_custom_domain_lower_idx
  on public.pages (lower(btrim(custom_domain)))
  where custom_domain is not null and btrim(custom_domain) <> '';

create or replace function public.nz_enforce_custom_domain_single_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.custom_domain is not null and btrim(new.custom_domain) <> '' then
    if exists (
      select 1 from public.pages p
      where lower(btrim(p.custom_domain)) = lower(btrim(new.custom_domain))
        and p.owner_id is distinct from new.owner_id
        and p.id <> new.id
    ) then
      raise exception 'custom_domain "%" is already connected to another Nexez account', new.custom_domain
        using errcode = 'unique_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_custom_domain_single_owner on public.pages;
create trigger trg_custom_domain_single_owner
  before insert or update of custom_domain on public.pages
  for each row
  execute function public.nz_enforce_custom_domain_single_owner();
