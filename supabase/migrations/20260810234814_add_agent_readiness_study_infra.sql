-- Batch infrastructure for the agent-readiness study (Part 2).
-- study_targets is the sampled frame of SMB sites to scan; study_control holds
-- the sha256 of the runner bearer token plus an enable kill switch. Both are
-- service-role only with the same hardened posture as scan_results.

create table if not exists public.study_targets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cohort text not null,
  vertical text not null,
  url text not null,
  domain text not null,
  sample_source text not null,
  status text not null default 'pending'
    check (status in ('pending', 'done', 'error', 'robots_excluded')),
  attempts integer not null default 0,
  last_error text,
  scanned_at timestamptz,
  unique (cohort, domain)
);

create index if not exists study_targets_claim_idx
  on public.study_targets (cohort, status, attempts, created_at);

create table if not exists public.study_control (
  key text primary key,
  token_sha256 text,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Atomic batch claim: bumps attempts under FOR UPDATE SKIP LOCKED so concurrent
-- runner invocations can never double-scan a target. Rows stay 'pending' until
-- the runner marks a terminal status; attempts >= 3 falls out of the claim set.
create or replace function public.claim_study_targets(batch_size integer, cohort_filter text)
returns setof public.study_targets
language sql
as $$
  update public.study_targets t
  set attempts = t.attempts + 1
  where t.id in (
    select id from public.study_targets
    where cohort = cohort_filter and status = 'pending' and attempts < 3
    order by created_at
    limit batch_size
    for update skip locked
  )
  returning t.*;
$$;

alter table public.study_targets enable row level security;
alter table public.study_control enable row level security;
-- No policies: service-role only.

revoke all privileges on table public.study_targets from anon, authenticated;
revoke all privileges on table public.study_control from anon, authenticated;
revoke all privileges on table public.study_targets from service_role;
grant select, insert, update on table public.study_targets to service_role;
revoke all privileges on table public.study_control from service_role;
grant select on table public.study_control to service_role;

revoke all on function public.claim_study_targets(integer, text) from public, anon, authenticated;
grant execute on function public.claim_study_targets(integer, text) to service_role;
