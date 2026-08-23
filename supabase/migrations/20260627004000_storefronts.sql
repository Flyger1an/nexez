-- Storefronts: the account-level brand entity (STOREFRONT_RENAME.md §5/§7).
--
-- An account = a storefront (1:1 for now via the unique owner_id; the multi-storefront
-- foundation in §7 would drop that constraint + add pages.storefront_id). A storefront
-- is the public brand home that aggregates a seller's published listings at
-- /store/<handle>. Public reads go through the service-role client in the /store route
-- (mirrors [slug]/agent.json + the buyer portal), so there is NO anon/public RLS policy
-- and anon grants are revoked - least privilege, base table never read by anon.

create table if not exists public.storefronts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  handle text not null unique,
  display_name text,
  description text,
  logo_url text,
  accent_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint storefronts_handle_format check (handle ~ '^[a-z0-9-]+$' and char_length(handle) between 1 and 63)
);

alter table public.storefronts enable row level security;

drop policy if exists "owners manage own storefront" on public.storefronts;
create policy "owners manage own storefront" on public.storefronts
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

revoke all on public.storefronts from anon;

-- Backfill one storefront per account that already owns a listing. Handle = the owner's
-- OLDEST listing slug (page slugs are globally unique + already [a-z0-9-]-normalized, so
-- handles are unique by construction; regexp_replace is a defensive identity). Owners can
-- rename the handle later in Storefront settings. display_name prefers the brand name.
insert into public.storefronts (owner_id, handle, display_name)
select distinct on (p.owner_id)
  p.owner_id,
  regexp_replace(lower(p.slug), '[^a-z0-9-]', '-', 'g'),
  coalesce(nullif(p.branding->>'brand_name', ''), p.name)
from public.pages p
where p.owner_id is not null and p.slug is not null and char_length(p.slug) > 0
order by p.owner_id, p.created_at asc
on conflict (owner_id) do nothing;
