-- Durable A2A v1 protocol ledgers.
--
-- These tables are intentionally separate from public.agent_tasks, which stores
-- standing buyer-search work rather than Agent2Agent protocol execution state.
-- Browser roles and service_role receive no direct table access. The application
-- reaches the ledger only through the bounded, service-role-only RPCs introduced
-- by the following migrations.

create schema if not exists private;

create table public.a2a_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  api_key_id uuid references public.api_keys(id) on delete set null,
  protocol_version text not null default '1.0',
  context_id text not null default gen_random_uuid()::text,
  nexie_thread_id uuid references public.agent_threads(id) on delete set null,
  state text not null default 'TASK_STATE_SUBMITTED',
  status jsonb not null default jsonb_build_object(
    'state', 'TASK_STATE_SUBMITTED',
    'timestamp', now()
  ),
  artifacts jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  safe_error_code text,
  safe_error_message text,
  execution_token uuid,
  execution_attempts integer not null default 0,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  settled_at timestamptz,
  status_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_event_sequence bigint not null default 0,

  constraint a2a_tasks_id_owner_unique unique (id, owner_id),
  constraint a2a_tasks_protocol_version_check check (protocol_version = '1.0'),
  constraint a2a_tasks_context_id_check check (
    char_length(context_id) between 1 and 200
    and context_id = btrim(context_id)
  ),
  constraint a2a_tasks_state_check check (
    state in (
      'TASK_STATE_SUBMITTED',
      'TASK_STATE_WORKING',
      'TASK_STATE_COMPLETED',
      'TASK_STATE_FAILED',
      'TASK_STATE_CANCELED',
      'TASK_STATE_INPUT_REQUIRED',
      'TASK_STATE_REJECTED',
      'TASK_STATE_AUTH_REQUIRED'
    )
  ),
  constraint a2a_tasks_status_check check (
    jsonb_typeof(status) = 'object'
    and status ->> 'state' = state
    and octet_length(status::text) <= 65536
  ),
  constraint a2a_tasks_artifacts_check check (
    jsonb_typeof(artifacts) = 'array'
    and jsonb_array_length(artifacts) <= 64
    and octet_length(artifacts::text) <= 4194304
  ),
  constraint a2a_tasks_history_check check (
    jsonb_typeof(history) = 'array'
    and jsonb_array_length(history) <= 200
    and octet_length(history::text) <= 4194304
  ),
  constraint a2a_tasks_metadata_check check (
    jsonb_typeof(metadata) = 'object'
    and octet_length(metadata::text) <= 65536
  ),
  constraint a2a_tasks_safe_error_code_check check (
    safe_error_code is null
    or char_length(safe_error_code) between 1 and 128
  ),
  constraint a2a_tasks_safe_error_message_check check (
    safe_error_message is null
    or char_length(safe_error_message) between 1 and 1000
  ),
  constraint a2a_tasks_execution_attempts_check check (execution_attempts >= 0),
  constraint a2a_tasks_event_sequence_check check (last_event_sequence >= 0),
  constraint a2a_tasks_worker_lease_shape_check check (
    (
      state = 'TASK_STATE_WORKING'
      and execution_token is not null
      and claimed_at is not null
      and lease_expires_at is not null
      and settled_at is null
    )
    or
    (
      state <> 'TASK_STATE_WORKING'
      and execution_token is null
      and claimed_at is null
      and lease_expires_at is null
    )
  ),
  constraint a2a_tasks_settlement_shape_check check (
    (
      state in ('TASK_STATE_SUBMITTED', 'TASK_STATE_WORKING')
      and settled_at is null
    )
    or
    (
      state in (
        'TASK_STATE_COMPLETED',
        'TASK_STATE_FAILED',
        'TASK_STATE_CANCELED',
        'TASK_STATE_INPUT_REQUIRED',
        'TASK_STATE_REJECTED',
        'TASK_STATE_AUTH_REQUIRED'
      )
      and settled_at is not null
    )
  )
);

create table public.a2a_message_receipts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  message_id text not null,
  task_id uuid not null,
  request_hash text not null,
  protocol_version text not null default '1.0',
  created_at timestamptz not null default now(),

  primary key (owner_id, message_id),
  constraint a2a_message_receipts_message_id_check check (
    char_length(message_id) between 1 and 200
    and message_id = btrim(message_id)
  ),
  constraint a2a_message_receipts_request_hash_check check (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint a2a_message_receipts_protocol_version_check check (
    protocol_version = '1.0'
  ),
  constraint a2a_message_receipts_task_owner_fkey
    foreign key (task_id, owner_id)
    references public.a2a_tasks(id, owner_id)
    on delete cascade
);

create table public.a2a_task_events (
  owner_id uuid not null,
  task_id uuid not null,
  sequence bigint not null,
  event_id uuid not null,
  event_kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),

  primary key (task_id, sequence),
  constraint a2a_task_events_task_event_unique unique (task_id, event_id),
  constraint a2a_task_events_sequence_check check (sequence > 0),
  constraint a2a_task_events_kind_check check (
    event_kind in ('artifact_update', 'status_update')
  ),
  constraint a2a_task_events_payload_check check (
    jsonb_typeof(payload) = 'object'
    and octet_length(payload::text) <= 524288
  ),
  constraint a2a_task_events_task_owner_fkey
    foreign key (task_id, owner_id)
    references public.a2a_tasks(id, owner_id)
    on delete cascade
);

create index a2a_tasks_owner_status_updated_idx
  on public.a2a_tasks (owner_id, status_updated_at desc, id desc);
create index a2a_tasks_owner_state_status_idx
  on public.a2a_tasks (owner_id, state, status_updated_at desc, id desc);
create index a2a_tasks_owner_context_status_idx
  on public.a2a_tasks (owner_id, context_id, status_updated_at desc, id desc);
create index a2a_tasks_expired_worker_idx
  on public.a2a_tasks (lease_expires_at)
  where state = 'TASK_STATE_WORKING';
create index a2a_tasks_api_key_created_idx
  on public.a2a_tasks (api_key_id, created_at desc)
  where api_key_id is not null;
create index a2a_tasks_nexie_thread_idx
  on public.a2a_tasks (nexie_thread_id)
  where nexie_thread_id is not null;
create index a2a_message_receipts_task_idx
  on public.a2a_message_receipts (task_id);
create index a2a_task_events_owner_task_sequence_idx
  on public.a2a_task_events (owner_id, task_id, sequence);

alter table public.a2a_tasks enable row level security;
alter table public.a2a_message_receipts enable row level security;
alter table public.a2a_task_events enable row level security;

revoke all on table public.a2a_tasks
  from public, anon, authenticated, service_role;
revoke all on table public.a2a_message_receipts
  from public, anon, authenticated, service_role;
revoke all on table public.a2a_task_events
  from public, anon, authenticated, service_role;

create function private.nz_a2a_v1_apply_artifact(
  p_artifacts jsonb,
  p_event jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_update jsonb := p_event -> 'artifactUpdate';
  v_artifact jsonb := v_update -> 'artifact';
  v_artifact_id text := v_artifact ->> 'artifactId';
  v_append boolean := case
    when jsonb_typeof(v_update -> 'append') = 'boolean'
      then (v_update ->> 'append')::boolean
    else false
  end;
  v_existing jsonb;
  v_existing_parts jsonb;
  v_merged jsonb;
  v_result jsonb := '[]'::jsonb;
  v_found boolean := false;
begin
  if jsonb_typeof(p_artifacts) is distinct from 'array'
     or jsonb_typeof(v_update) is distinct from 'object'
     or jsonb_typeof(v_artifact) is distinct from 'object'
     or coalesce(v_artifact_id, '') = ''
     or char_length(v_artifact_id) > 200
     or jsonb_typeof(v_artifact -> 'parts') is distinct from 'array'
     or jsonb_array_length(v_artifact -> 'parts') = 0
     or jsonb_array_length(v_artifact -> 'parts') > 20
  then
    raise exception 'invalid A2A v1 artifact update' using errcode = '22023';
  end if;

  for v_existing in
    select value from jsonb_array_elements(p_artifacts)
  loop
    if v_existing ->> 'artifactId' = v_artifact_id then
      v_found := true;
      if v_append then
        v_existing_parts := v_existing -> 'parts';
        if jsonb_typeof(v_existing_parts) is distinct from 'array'
           or jsonb_array_length(v_existing_parts) + jsonb_array_length(v_artifact -> 'parts') > 100
        then
          raise exception 'stored A2A artifact parts are invalid' using errcode = '22023';
        end if;
        v_merged := v_existing
          || (v_artifact - 'parts')
          || jsonb_build_object(
            'parts', v_existing_parts || (v_artifact -> 'parts')
          );
        v_result := v_result || jsonb_build_array(v_merged);
      else
        v_result := v_result || jsonb_build_array(v_artifact);
      end if;
    else
      v_result := v_result || jsonb_build_array(v_existing);
    end if;
  end loop;

  if not v_found then
    if v_append then
      raise exception 'cannot append to a missing A2A artifact' using errcode = '22023';
    end if;
    if jsonb_array_length(p_artifacts) >= 64 then
      raise exception 'too many A2A artifacts' using errcode = '22023';
    end if;
    v_result := v_result || jsonb_build_array(v_artifact);
  end if;

  if octet_length(v_result::text) > 4194304 then
    raise exception 'A2A artifact storage limit exceeded' using errcode = '22023';
  end if;

  return v_result;
end;
$$;

revoke all on function private.nz_a2a_v1_apply_artifact(jsonb, jsonb)
  from public, anon, authenticated, service_role;
