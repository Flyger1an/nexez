-- Team seats foundation: owners invite teammates by email + role.
-- Access enforcement (cross-tenant page editing) is a deliberate later step.
create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now()
);
create index if not exists team_invites_owner_idx on public.team_invites (owner_id, created_at desc);
alter table public.team_invites enable row level security;
grant select, insert, update, delete on public.team_invites to authenticated;
drop policy if exists "owners manage own invites" on public.team_invites;
create policy "owners manage own invites"
  on public.team_invites for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
