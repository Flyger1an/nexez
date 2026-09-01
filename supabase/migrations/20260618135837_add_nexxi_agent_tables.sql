-- Nexxi: buyer-facing personal agent memory, chat threads, and approval ledger.
-- Runtime access is owner-scoped with RLS. Server routes may also use the
-- service-role client, but policies keep the browser/Data API safe.

create table if not exists public.user_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Nexxi',
  persona text not null default 'personal_buyer_agent',
  voice text not null default 'warm_concise',
  preferences jsonb not null default '{}'::jsonb,
  memory jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.agent_threads (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.user_agents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Nexxi chat',
  channel text not null default 'TEXT' check (channel in ('TEXT', 'VOICE')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.agent_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('USER', 'ASSISTANT', 'TOOL', 'SYSTEM')),
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_action_approvals (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.agent_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_name text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED')),
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  completed_at timestamptz
);

create index if not exists user_agents_user_idx on public.user_agents (user_id);
create index if not exists agent_threads_user_updated_idx on public.agent_threads (user_id, updated_at desc);
create index if not exists agent_threads_agent_updated_idx on public.agent_threads (agent_id, updated_at desc);
create index if not exists agent_messages_thread_created_idx on public.agent_messages (thread_id, created_at asc);
create index if not exists agent_messages_user_created_idx on public.agent_messages (user_id, created_at desc);
create index if not exists agent_action_approvals_thread_status_idx on public.agent_action_approvals (thread_id, status, created_at desc);
create index if not exists agent_action_approvals_user_status_idx on public.agent_action_approvals (user_id, status, created_at desc);

alter table public.user_agents enable row level security;
alter table public.agent_threads enable row level security;
alter table public.agent_messages enable row level security;
alter table public.agent_action_approvals enable row level security;

grant select, insert, update, delete on public.user_agents to authenticated;
grant select, insert, update, delete on public.agent_threads to authenticated;
grant select, insert, update, delete on public.agent_messages to authenticated;
grant select, insert, update, delete on public.agent_action_approvals to authenticated;

drop policy if exists "Users manage own Nexxi agent" on public.user_agents;
create policy "Users manage own Nexxi agent"
  on public.user_agents
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage own Nexxi threads" on public.agent_threads;
create policy "Users manage own Nexxi threads"
  on public.agent_threads
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage own Nexxi messages" on public.agent_messages;
create policy "Users manage own Nexxi messages"
  on public.agent_messages
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage own Nexxi approvals" on public.agent_action_approvals;
create policy "Users manage own Nexxi approvals"
  on public.agent_action_approvals
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.nz_touch_nexxi_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.nz_touch_nexxi_updated_at() from public, anon, authenticated;

drop trigger if exists trg_touch_user_agents_updated_at on public.user_agents;
create trigger trg_touch_user_agents_updated_at
  before update on public.user_agents
  for each row
  execute function public.nz_touch_nexxi_updated_at();

drop trigger if exists trg_touch_agent_threads_updated_at on public.agent_threads;
create trigger trg_touch_agent_threads_updated_at
  before update on public.agent_threads
  for each row
  execute function public.nz_touch_nexxi_updated_at();

comment on table public.user_agents is 'Buyer-owned Nexxi profile, preferences, and durable memory.';
comment on table public.agent_threads is 'Mobile-first Nexxi chat threads for buyer discovery and transactions.';
comment on table public.agent_messages is 'Conversation transcript for Nexxi text and voice turns.';
comment on table public.agent_action_approvals is 'Explicit user approval ledger before Nexxi negotiates, books, or starts checkout.';
