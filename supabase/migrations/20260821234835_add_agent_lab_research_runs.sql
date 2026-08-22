-- Pass 3: durable external-site research for the Agent Lab.
--
-- Only summarized analyzer output is retained. Raw fetched HTML is never stored.
-- Records are immutable so their point-in-time provenance cannot be rewritten.

create table public.agent_lab_research_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('url_snapshot', 'competitor_benchmark')),
  target_url text not null check (char_length(target_url) between 1 and 2048),
  target_host text not null check (char_length(target_host) between 1 and 253),
  compared_page_id uuid references public.pages(id) on delete set null,
  compared_page_slug text,
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz not null default now()
);

create index agent_lab_research_runs_owner_created_idx
  on public.agent_lab_research_runs (owner_id, created_at desc);

create index agent_lab_research_runs_owner_kind_created_idx
  on public.agent_lab_research_runs (owner_id, kind, created_at desc);

comment on table public.agent_lab_research_runs is
  'Immutable owner-scoped Agent Lab URL snapshots and competitor benchmarks. Contains summarized output only, never fetched HTML.';

comment on column public.agent_lab_research_runs.evidence is
  'Point-in-time execution, fetch, cache, storage, and transaction-boundary provenance for an external-site research run.';

alter table public.agent_lab_research_runs enable row level security;
alter table public.agent_lab_research_runs force row level security;

revoke all on public.agent_lab_research_runs from anon;
revoke all on public.agent_lab_research_runs from authenticated;
grant select, insert, delete on public.agent_lab_research_runs to authenticated;
grant all on public.agent_lab_research_runs to service_role;

create policy agent_lab_research_runs_owner_select
  on public.agent_lab_research_runs
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy agent_lab_research_runs_owner_insert
  on public.agent_lab_research_runs
  for insert
  to authenticated
  with check (
    (select auth.uid()) = owner_id
    and (
      compared_page_id is null
      or exists (
        select 1
        from public.pages
        where pages.id = agent_lab_research_runs.compared_page_id
          and pages.owner_id = (select auth.uid())
      )
    )
  );

create policy agent_lab_research_runs_owner_delete
  on public.agent_lab_research_runs
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);
