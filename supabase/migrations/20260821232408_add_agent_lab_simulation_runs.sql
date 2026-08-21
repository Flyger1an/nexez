-- Pass 2: durable, owner-scoped Agent Lab evidence.
--
-- Simulation history used to overwrite pages.simulations JSONB from the browser.
-- That made concurrent runs lossy, capped history at 20, and coupled mutable page
-- content to audit evidence. Runs are now individually immutable records with an explicit
-- engine version and provenance payload. The legacy column remains readable for
-- backwards compatibility but is no longer the source of truth.

create table public.agent_lab_simulation_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  page_slug text not null,
  query text not null check (char_length(query) between 1 and 500),
  engine_version text not null,
  execution_mode text not null check (execution_mode in ('deterministic', 'deterministic_with_llm')),
  readiness integer not null check (readiness between 0 and 100),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz not null default now()
);

create index agent_lab_simulation_runs_owner_created_idx
  on public.agent_lab_simulation_runs (owner_id, created_at desc);

create index agent_lab_simulation_runs_owner_page_created_idx
  on public.agent_lab_simulation_runs (owner_id, page_id, created_at desc);

comment on table public.agent_lab_simulation_runs is
  'Immutable owner-scoped Agent Lab runs with replayable results and explicit provenance. Replaces pages.simulations JSONB as the history source of truth.';

comment on column public.agent_lab_simulation_runs.evidence is
  'Execution provenance, competitive-field coverage, and commerce contract inspection evidence. It must not imply payment execution.';

alter table public.agent_lab_simulation_runs enable row level security;
alter table public.agent_lab_simulation_runs force row level security;

revoke all on public.agent_lab_simulation_runs from anon;
revoke all on public.agent_lab_simulation_runs from authenticated;
grant select, insert, delete on public.agent_lab_simulation_runs to authenticated;
grant all on public.agent_lab_simulation_runs to service_role;

create policy agent_lab_simulation_runs_owner_select
  on public.agent_lab_simulation_runs
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy agent_lab_simulation_runs_owner_insert
  on public.agent_lab_simulation_runs
  for insert
  to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1
      from public.pages
      where pages.id = agent_lab_simulation_runs.page_id
        and pages.owner_id = (select auth.uid())
    )
  );

create policy agent_lab_simulation_runs_owner_delete
  on public.agent_lab_simulation_runs
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);
