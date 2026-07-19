-- Immutable, server-only evidence for every production release decision.
-- The GitHub release workflow inserts one row after CI and live probes finish;
-- Launch Control reads the history through the service-role client.
create table if not exists public.release_certifications (
  id uuid primary key default gen_random_uuid(),
  schema_version smallint not null default 1 check (schema_version = 1),
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 1 and 160),
  source text not null check (source in ('github', 'manual', 'local')),
  environment text not null check (environment in ('production', 'preview', 'development')),
  commit_sha text not null check (commit_sha ~ '^[0-9a-f]{7,64}$'),
  deployed_revision text check (deployed_revision is null or deployed_revision ~ '^[0-9a-f]{7,64}$'),
  deployment_id text check (deployment_id is null or char_length(deployment_id) <= 180),
  deployment_url text not null check (char_length(deployment_url) <= 2048),
  workflow_url text check (workflow_url is null or char_length(workflow_url) <= 2048),
  triggered_by text check (triggered_by is null or char_length(triggered_by) <= 120),
  status text not null check (status in ('passed', 'failed')),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  snapshot_generated_at timestamptz not null,
  launch_status text not null check (launch_status in ('ready', 'attention', 'blocked', 'unknown')),
  launch_score smallint not null check (launch_score between 0 and 100),
  check_count smallint not null check (check_count >= 0),
  required_check_count smallint not null check (required_check_count >= 0),
  required_failed_count smallint not null check (required_failed_count >= 0),
  checks jsonb not null default '[]'::jsonb check (jsonb_typeof(checks) = 'array'),
  launch_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(launch_summary) = 'object'),
  created_at timestamptz not null default now(),
  constraint release_certifications_time_order check (completed_at >= started_at),
  constraint release_certifications_check_counts check (
    required_check_count <= check_count
    and required_failed_count <= required_check_count
  )
);

create index if not exists release_certifications_completed_at_idx
  on public.release_certifications (completed_at desc);

create index if not exists release_certifications_commit_sha_idx
  on public.release_certifications (commit_sha, completed_at desc);

alter table public.release_certifications enable row level security;

revoke all on table public.release_certifications from public, anon, authenticated;
grant select, insert on table public.release_certifications to service_role;

drop policy if exists "release certifications are server only"
  on public.release_certifications;
create policy "release certifications are server only"
  on public.release_certifications
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Release evidence is an audit trail. Corrections are new rows, never mutation
-- of an earlier verdict.
create or replace function public.nz_release_certifications_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'release certifications are append-only'
    using errcode = '55000';
end;
$$;

revoke all on function public.nz_release_certifications_append_only()
  from public, anon, authenticated;

drop trigger if exists nz_release_certifications_append_only
  on public.release_certifications;
create trigger nz_release_certifications_append_only
  before update or delete on public.release_certifications
  for each row execute function public.nz_release_certifications_append_only();

comment on table public.release_certifications is
  'Append-only, server-generated production release verdicts and redacted verification evidence.';
