-- Per-user integration connection status. Replaces the browser-only localStorage
-- status the Integrations dashboard read from (which was wrong on a new device).
-- Non-secret status only - provider tokens stay in sessionStorage / page_secrets;
-- this table records "this owner connected provider X, last event at T".

create table if not exists public.user_integrations (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null default 'connected',
  detail text,
  last_event_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, provider)
);

create index if not exists user_integrations_user_idx
  on public.user_integrations (user_id);

alter table public.user_integrations enable row level security;

grant select, insert, update, delete on public.user_integrations to authenticated;

drop policy if exists "Owners can read own integrations" on public.user_integrations;
drop policy if exists "Owners can create own integrations" on public.user_integrations;
drop policy if exists "Owners can update own integrations" on public.user_integrations;
drop policy if exists "Owners can delete own integrations" on public.user_integrations;

create policy "Owners can read own integrations"
  on public.user_integrations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners can create own integrations"
  on public.user_integrations
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Owners can update own integrations"
  on public.user_integrations
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owners can delete own integrations"
  on public.user_integrations
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
