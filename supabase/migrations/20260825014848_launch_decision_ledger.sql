-- Human launch decisions are recorded against the exact production revision,
-- release certificate, and Launch Control snapshot the operator reviewed.
-- This ledger records a decision only. It does not deploy, roll back, or move
-- money.
create table public.launch_decisions (
  id bigint generated always as identity primary key,
  schema_version smallint not null default 1 check (schema_version = 1),
  idempotency_key uuid not null unique,
  decision text not null check (decision in ('go', 'hold')),
  reason text not null check (char_length(reason) between 3 and 1000),
  operator_id uuid not null,
  operator_email text not null check (char_length(operator_email) between 3 and 320),
  release_certification_id uuid references public.release_certifications(id) on delete restrict,
  certificate_commit_sha text check (
    certificate_commit_sha is null or certificate_commit_sha ~ '^[0-9a-f]{7,64}$'
  ),
  production_revision text check (
    production_revision is null or production_revision ~ '^[0-9a-f]{7,64}$'
  ),
  snapshot_generated_at timestamptz not null,
  launch_status text not null check (launch_status in ('ready', 'attention', 'blocked', 'unknown')),
  launch_score smallint not null check (launch_score between 0 and 100),
  required_blocker_count smallint not null check (required_blocker_count >= 0),
  required_blockers jsonb not null default '[]'::jsonb check (jsonb_typeof(required_blockers) = 'array'),
  incident_count integer not null check (incident_count >= 0),
  created_at timestamptz not null default now(),
  constraint launch_decisions_fresh_snapshot check (
    snapshot_generated_at >= created_at - interval '10 minutes'
    and snapshot_generated_at <= created_at + interval '1 minute'
  ),
  constraint launch_decisions_blocker_evidence_matches check (
    jsonb_array_length(required_blockers) = required_blocker_count
  )
);

create index launch_decisions_created_at_idx
  on public.launch_decisions (created_at desc);

create index launch_decisions_release_certification_id_idx
  on public.launch_decisions (release_certification_id)
  where release_certification_id is not null;

create index launch_decisions_operator_id_idx
  on public.launch_decisions (operator_id)
  where operator_id is not null;

alter table public.launch_decisions enable row level security;

revoke all on table public.launch_decisions from public, anon, authenticated, service_role;
revoke all on sequence public.launch_decisions_id_seq from public, anon, authenticated, service_role;
grant select, insert on table public.launch_decisions to service_role;
grant usage, select on sequence public.launch_decisions_id_seq to service_role;

create policy "launch decisions are server only"
  on public.launch_decisions
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- A go decision is valid only when the referenced certificate proves the same
-- production revision and every required gate is green. Holds can be recorded
-- when evidence is absent or red, which is the point of the hold decision.
create function private.nz_validate_launch_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_release public.release_certifications%rowtype;
begin
  if new.decision <> 'go' then
    return new;
  end if;

  if new.release_certification_id is null then
    raise exception 'go decisions require an exact release certificate'
      using errcode = '23514';
  end if;

  select *
  into v_release
  from public.release_certifications
  where id = new.release_certification_id;

  if not found
    or v_release.status <> 'passed'
    or v_release.environment <> 'production'
    or v_release.launch_status <> 'ready'
    or v_release.required_failed_count <> 0
    or v_release.deployed_revision is null
    or v_release.deployed_revision <> v_release.commit_sha
    or new.production_revision is distinct from v_release.deployed_revision
    or new.certificate_commit_sha is distinct from v_release.commit_sha
    or new.launch_status <> 'ready'
    or new.launch_score <> 100
    or new.required_blocker_count <> 0
  then
    raise exception 'go decision evidence is not launch eligible'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.nz_validate_launch_decision()
  from public, anon, authenticated, service_role;

create trigger nz_validate_launch_decision
  before insert on public.launch_decisions
  for each row execute function private.nz_validate_launch_decision();

create function private.nz_reject_launch_decision_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'launch decisions are append-only'
    using errcode = '55000';
end;
$$;

revoke all on function private.nz_reject_launch_decision_mutation()
  from public, anon, authenticated, service_role;

create trigger nz_reject_launch_decision_mutation
  before update or delete on public.launch_decisions
  for each row execute function private.nz_reject_launch_decision_mutation();

comment on table public.launch_decisions is
  'Append-only human go or hold decisions bound to exact production launch evidence.';

comment on column public.launch_decisions.operator_id is
  'Immutable auth user identifier captured at decision time, retained if the account is later deleted.';
