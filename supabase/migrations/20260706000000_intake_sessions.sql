-- Seller intake interview (spec: nexez-intake-interview-spec.md §4).
-- One row per interview session. The full machine state (sources, extractions,
-- gaps, answers, working draft, provenance, messages) lives in `state` JSONB -
-- messages ride inside state.messages[] for v1 and get promoted to a table only
-- if volume demands it. Sessions are resumable across devices (mobile ⇄ web):
-- the threads API reads/writes through the caller's RLS-bound client.
--
-- Additive + idempotent. Owner-only RLS in the (select auth.uid()) init-plan form.

create table if not exists public.intake_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid references public.pages(id) on delete set null, -- set at REVIEW_HANDOFF (or when re-interviewing an existing page)
  status text not null default 'active' check (status in ('active', 'handed_off', 'abandoned')),
  phase text not null default 'INGEST'
    check (phase in ('INGEST', 'EXTRACT', 'GAP_ANALYSIS', 'INTERVIEW', 'SYNTHESIS', 'REVIEW_HANDOFF')),
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists intake_sessions_owner_idx on public.intake_sessions (owner_id, status, updated_at desc);

alter table public.intake_sessions enable row level security;
grant select, insert, update, delete on public.intake_sessions to authenticated;

drop policy if exists "Owners manage own intake sessions" on public.intake_sessions;
create policy "Owners manage own intake sessions"
  on public.intake_sessions
  for all
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- Keep updated_at honest on every write (mirrors nz_touch_push_tokens_updated_at).
create or replace function public.nz_touch_intake_sessions_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists intake_sessions_touch_updated_at on public.intake_sessions;
create trigger intake_sessions_touch_updated_at
  before update on public.intake_sessions
  for each row execute function public.nz_touch_intake_sessions_updated_at();
