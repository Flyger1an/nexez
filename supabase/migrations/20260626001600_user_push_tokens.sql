-- Nexxi push notifications: per-user Expo push tokens. The mobile app registers its
-- token after sign-in; the backend fans out pushes on async events (negotiation
-- replies, booking confirmations, refunds). Owner-scoped via RLS for the browser/Data
-- API; server senders read with the service-role client to push across users.

create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Denormalized (lowercased) account email so async senders can resolve a buyer by
  -- email (negotiations key on buyer_email) without joining auth.users.
  email text,
  token text not null,
  platform text not null default 'unknown' check (platform in ('ios', 'android', 'web', 'unknown')),
  device_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists user_push_tokens_user_idx on public.user_push_tokens (user_id);
create index if not exists user_push_tokens_email_idx on public.user_push_tokens (lower(email));

alter table public.user_push_tokens enable row level security;
grant select, insert, update, delete on public.user_push_tokens to authenticated;

drop policy if exists "Users manage own push tokens" on public.user_push_tokens;
create policy "Users manage own push tokens"
  on public.user_push_tokens
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.nz_touch_push_tokens_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.nz_touch_push_tokens_updated_at() from public, anon, authenticated;

drop trigger if exists trg_touch_user_push_tokens_updated_at on public.user_push_tokens;
create trigger trg_touch_user_push_tokens_updated_at
  before update on public.user_push_tokens
  for each row
  execute function public.nz_touch_push_tokens_updated_at();

comment on table public.user_push_tokens is 'Expo push tokens per user for Nexxi push notifications (keyed by user_id + denormalized email).';
