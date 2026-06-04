create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid references public.pages(id) on delete set null,
  page_name text,
  subject text not null,
  category text not null default 'general' check (category in ('general', 'page_setup', 'agent_visibility', 'integrations', 'billing', 'bug', 'feature_request')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'waiting_on_user', 'in_review', 'resolved', 'closed')),
  query text not null,
  ai_response text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_owner_created_idx
  on public.support_tickets (owner_id, created_at desc);

create index if not exists support_tickets_owner_status_idx
  on public.support_tickets (owner_id, status, created_at desc);

create or replace function public.set_support_tickets_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

alter function public.set_support_tickets_updated_at() set search_path = '';

drop trigger if exists support_tickets_set_updated_at on public.support_tickets;
create trigger support_tickets_set_updated_at
  before update on public.support_tickets
  for each row
  execute function public.set_support_tickets_updated_at();

alter table public.support_tickets enable row level security;

grant select, insert, update on public.support_tickets to authenticated;

drop policy if exists "owners read own support tickets" on public.support_tickets;
create policy "owners read own support tickets"
  on public.support_tickets for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "owners create own support tickets" on public.support_tickets;
create policy "owners create own support tickets"
  on public.support_tickets for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "owners update own support tickets" on public.support_tickets;
create policy "owners update own support tickets"
  on public.support_tickets for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
