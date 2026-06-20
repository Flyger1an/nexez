-- Phase 4: multi-storefront foundation (STOREFRONT_RENAME.md §7).
--
-- Inserts the storefront as the entity BETWEEN account and listing so an account can own
-- 1..N storefronts:  auth.users → storefronts (1..N) → pages/listings (1..N) → offers.
-- Non-breaking: exactly one storefront per account already exists (the §5 backfill), so
-- this only adds pages.storefront_id + backfills it, drops the 1:1 owner_id UNIQUE, and
-- adds nullable money/plan SEAM columns. v1 is ACCOUNT-POOLED: the seam columns stay null
-- and every resolver is `storefront.X ?? account.X`, so behavior is unchanged until a
-- storefront opts into its own Connect account / plan.

-- 1. Billing/payout SEAM columns. NULL => fall back to the account (account-pooled v1).
--    Populated only the day a storefront becomes its own merchant (the deferred step 5).
alter table public.storefronts
  add column if not exists stripe_connect_account_id text,
  add column if not exists plan_id text;

-- 2. Drop the 1:1 constraint so an account can hold several storefronts. The handle stays
--    globally UNIQUE (storefronts_handle_key). Replace the unique's backing index with a
--    plain one for the owner_id lookups the resolvers still do.
alter table public.storefronts drop constraint if exists storefronts_owner_id_key;
create index if not exists storefronts_owner_id_idx on public.storefronts (owner_id);

-- 3. pages.storefront_id: the listing's storefront. KEEP pages.owner_id (denormalized =
--    storefronts.owner_id) so the existing owner_id = auth.uid() RLS is untouched. ON
--    DELETE SET NULL: deleting a storefront reverts its listings to "account-level,
--    unassigned" rather than cascading the listings away.
alter table public.pages
  add column if not exists storefront_id uuid references public.storefronts(id) on delete set null;
create index if not exists pages_storefront_id_idx on public.pages (storefront_id);

-- 4. Backfill every page to its account's (single, existing) storefront. Each account has
--    exactly one storefront today, so this is unambiguous.
update public.pages p
set storefront_id = s.id
from public.storefronts s
where p.owner_id = s.owner_id and p.storefront_id is null;

-- 5. Default + enforce pages.storefront_id.
--    (a) DEFAULT: a new listing with no storefront_id is auto-assigned its account's
--        primary (oldest) storefront, so no insert path can orphan a listing from the
--        store landing — fully non-breaking for every existing create flow.
--    (b) ENFORCE: a page's storefront MUST belong to the page's owner. Without this, an
--        owner could set their listing's storefront_id to another account's storefront
--        (grouping their listing under a victim's brand, or seeding a resolver with a
--        mismatched owner). SECURITY DEFINER so the check sees the storefront's TRUE owner
--        regardless of the writer's RLS; fails closed. Mirrors nz_pages_pin_owner — and
--        since owner_id is already immutable on UPDATE, together they guarantee
--        pages.owner_id == storefronts.owner_id for the assigned storefront.
create or replace function public.nz_pages_enforce_storefront_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.storefront_id is null and new.owner_id is not null then
    select s.id into new.storefront_id
    from public.storefronts s
    where s.owner_id = new.owner_id
    order by s.created_at asc
    limit 1;
  end if;

  if new.storefront_id is not null then
    if not exists (
      select 1 from public.storefronts s
      where s.id = new.storefront_id and s.owner_id = new.owner_id
    ) then
      raise exception 'storefront_id % does not belong to page owner %', new.storefront_id, new.owner_id
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- Triggers run, not called directly: no role needs EXECUTE (mirrors the other pages guards).
revoke all on function public.nz_pages_enforce_storefront_owner() from public, anon, authenticated;

drop trigger if exists nz_pages_enforce_storefront_owner on public.pages;
create trigger nz_pages_enforce_storefront_owner
  before insert or update on public.pages
  for each row execute function public.nz_pages_enforce_storefront_owner();
