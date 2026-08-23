-- Seller notification authority. Buyer-agent preferences remain on user_agents;
-- this table is intentionally separate so one account can use both facets without
-- either settings surface muting the other.

create table if not exists public.seller_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  negotiations_enabled boolean not null default true,
  integrations_enabled boolean not null default true,
  reviews_enabled boolean not null default true,
  marketing_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.seller_notification_preferences enable row level security;

-- Grants determine Data API reachability. RLS below determines row ownership.
revoke all on table public.seller_notification_preferences from anon, authenticated, service_role;
grant select, insert, update on table public.seller_notification_preferences to authenticated;
grant select on table public.seller_notification_preferences to service_role;

drop policy if exists "Sellers read own notification preferences" on public.seller_notification_preferences;
create policy "Sellers read own notification preferences"
  on public.seller_notification_preferences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Sellers create own notification preferences" on public.seller_notification_preferences;
create policy "Sellers create own notification preferences"
  on public.seller_notification_preferences
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Sellers update own notification preferences" on public.seller_notification_preferences;
create policy "Sellers update own notification preferences"
  on public.seller_notification_preferences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.nz_touch_seller_notification_preferences_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.nz_touch_seller_notification_preferences_updated_at() from public, anon, authenticated;

drop trigger if exists trg_touch_seller_notification_preferences_updated_at
  on public.seller_notification_preferences;
create trigger trg_touch_seller_notification_preferences_updated_at
  before update on public.seller_notification_preferences
  for each row execute function public.nz_touch_seller_notification_preferences_updated_at();

comment on table public.seller_notification_preferences is
  'Seller-facet push preferences. Transaction and money-state notices are mandatory in application policy and are not stored as mutable columns.';
