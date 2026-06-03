-- G21: programmatic API keys (headless page management).
-- Only a SHA-256 hash of the key is stored; the raw key is shown once on creation.
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'API key',
  key_hash text not null unique,
  prefix text not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists api_keys_owner_idx on public.api_keys (owner_id, created_at desc);
create index if not exists api_keys_hash_idx on public.api_keys (key_hash);

alter table public.api_keys enable row level security;

grant select, insert, update, delete on public.api_keys to authenticated;

drop policy if exists "owners manage own api keys" on public.api_keys;
create policy "owners manage own api keys"
  on public.api_keys
  for all
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
