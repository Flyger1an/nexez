-- Nexxi BUYER FACET: standing "agent tasks" the buyer asks Nexxi to keep working on
-- ("keep looking for a plumber under $300"). The agent-tasks cron matches each active task against
-- the WHOLE published catalog (existing + new), deduped per task via notified_slugs, and pushes the
-- buyer on fresh matches. Owner-scoped via RLS; cleaned on buyer-account deletion. Results NOTIFY
-- only — money never moves without explicit in-app approval.

create table if not exists public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null, -- the buyer's natural-language task (display + label)
  query text not null default '', -- match text (defaults to the prompt if not refined)
  category text not null default '',
  status text not null default 'active' check (status in ('active', 'paused')),
  notified_slugs text[] not null default '{}', -- slugs already pushed for this task (dedupe)
  created_at timestamptz not null default now(),
  last_run_at timestamptz
);

create index if not exists agent_tasks_user_idx on public.agent_tasks (user_id, created_at desc);
create index if not exists agent_tasks_active_idx on public.agent_tasks (status) where status = 'active';

alter table public.agent_tasks enable row level security;
grant select, insert, update, delete on public.agent_tasks to authenticated;

drop policy if exists "Users manage own agent tasks" on public.agent_tasks;
create policy "Users manage own agent tasks"
  on public.agent_tasks
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.agent_tasks is 'Buyer-facet: standing agent tasks Nexxi monitors + alerts on. Owner-scoped via RLS.';
