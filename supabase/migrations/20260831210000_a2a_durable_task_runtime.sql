-- Durable Agent2Agent task execution for the API-key-authenticated Nexxi runtime.
-- This is intentionally separate from public.agent_tasks, which stores standing
-- buyer search alerts rather than protocol execution state.
create table public.a2a_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  api_key_id uuid references public.api_keys(id) on delete set null,
  context_id uuid not null default gen_random_uuid(),
  nexie_thread_id uuid references public.agent_threads(id) on delete set null,
  state text not null default 'submitted' check (
    state in (
      'submitted',
      'working',
      'completed',
      'failed',
      'canceled',
      'input-required',
      'rejected',
      'auth-required'
    )
  ),
  status_message jsonb check (
    status_message is null or jsonb_typeof(status_message) = 'object'
  ),
  artifacts jsonb not null default '[]'::jsonb check (jsonb_typeof(artifacts) = 'array'),
  history jsonb not null default '[]'::jsonb check (jsonb_typeof(history) = 'array'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  safe_error_code text,
  safe_error_message text,
  execution_token uuid,
  execution_attempts integer not null default 0 check (execution_attempts >= 0),
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_event_sequence bigint not null default 0 check (last_event_sequence >= 0),
  constraint a2a_tasks_worker_lease_shape check (
    (state = 'working' and execution_token is not null and claimed_at is not null and lease_expires_at is not null)
    or
    (state <> 'working' and execution_token is null and claimed_at is null and lease_expires_at is null)
  )
);

create table public.a2a_message_receipts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  message_id text not null check (char_length(message_id) between 1 and 200),
  task_id uuid not null references public.a2a_tasks(id) on delete cascade,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (owner_id, message_id)
);

create table public.a2a_task_events (
  task_id uuid not null references public.a2a_tasks(id) on delete cascade,
  sequence bigint not null check (sequence > 0),
  event_id uuid not null unique,
  event_kind text not null check (event_kind in ('artifact-update', 'status-update')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  primary key (task_id, sequence)
);

create index a2a_tasks_owner_updated_idx
  on public.a2a_tasks (owner_id, updated_at desc);
create index a2a_tasks_owner_state_idx
  on public.a2a_tasks (owner_id, state, updated_at desc);
create index a2a_tasks_expired_worker_idx
  on public.a2a_tasks (lease_expires_at)
  where state = 'working';
create index a2a_tasks_api_key_idx
  on public.a2a_tasks (api_key_id, created_at desc)
  where api_key_id is not null;
create index a2a_tasks_nexie_thread_idx
  on public.a2a_tasks (nexie_thread_id)
  where nexie_thread_id is not null;
create index a2a_message_receipts_task_idx
  on public.a2a_message_receipts (task_id);
create index a2a_task_events_task_created_idx
  on public.a2a_task_events (task_id, created_at);

alter table public.a2a_tasks enable row level security;
alter table public.a2a_message_receipts enable row level security;
alter table public.a2a_task_events enable row level security;

revoke all on table public.a2a_tasks from public, anon, authenticated, service_role;
revoke all on table public.a2a_message_receipts from public, anon, authenticated, service_role;
revoke all on table public.a2a_task_events from public, anon, authenticated, service_role;

grant select, insert, update on table public.a2a_tasks to service_role;
grant select, insert on table public.a2a_message_receipts to service_role;
grant select, insert on table public.a2a_task_events to service_role;

create policy "a2a tasks are server only"
  on public.a2a_tasks
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "a2a message receipts are server only"
  on public.a2a_message_receipts
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "a2a task events are server only"
  on public.a2a_task_events
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create function private.nz_a2a_apply_artifact(
  p_artifacts jsonb,
  p_event jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_artifact jsonb := p_event -> 'artifact';
  v_artifact_id text := v_artifact ->> 'artifactId';
  v_append boolean := coalesce((p_event ->> 'append')::boolean, false);
  v_existing jsonb;
  v_merged jsonb;
  v_result jsonb := '[]'::jsonb;
  v_found boolean := false;
begin
  if jsonb_typeof(v_artifact) <> 'object' or coalesce(v_artifact_id, '') = '' then
    raise exception 'invalid A2A artifact event' using errcode = '22023';
  end if;

  for v_existing in
    select value from jsonb_array_elements(coalesce(p_artifacts, '[]'::jsonb))
  loop
    if v_existing ->> 'artifactId' = v_artifact_id then
      v_found := true;
      if v_append then
        v_merged := jsonb_set(
          v_existing,
          '{parts}',
          coalesce(v_existing -> 'parts', '[]'::jsonb) || coalesce(v_artifact -> 'parts', '[]'::jsonb),
          true
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
    v_result := v_result || jsonb_build_array(v_artifact);
  end if;
  return v_result;
end;
$$;

revoke all on function private.nz_a2a_apply_artifact(jsonb, jsonb)
  from public, anon, authenticated, service_role;

create function private.nz_reject_a2a_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Foreign-key cascades must still support account and task deletion. Direct
  -- application mutation reaches this trigger at depth 1 and remains blocked.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'A2A protocol ledgers are append-only' using errcode = '55000';
end;
$$;

revoke all on function private.nz_reject_a2a_ledger_mutation()
  from public, anon, authenticated, service_role;

create trigger nz_reject_a2a_event_mutation
  before update or delete on public.a2a_task_events
  for each row execute function private.nz_reject_a2a_ledger_mutation();

create trigger nz_reject_a2a_receipt_mutation
  before update or delete on public.a2a_message_receipts
  for each row execute function private.nz_reject_a2a_ledger_mutation();

create function public.nz_a2a_accept_message(
  p_owner_id uuid,
  p_api_key_id uuid,
  p_message_id text,
  p_request_hash text,
  p_message jsonb,
  p_task_id uuid default null,
  p_context_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_receipt public.a2a_message_receipts%rowtype;
  v_task public.a2a_tasks%rowtype;
  v_task_id uuid;
  v_context_id uuid;
  v_message jsonb;
begin
  select * into v_receipt
  from public.a2a_message_receipts
  where owner_id = p_owner_id and message_id = p_message_id;

  if found then
    if v_receipt.request_hash = p_request_hash then
      select * into v_task from public.a2a_tasks where id = v_receipt.task_id;
      return jsonb_build_object(
        'outcome', 'duplicate',
        'taskId', v_receipt.task_id,
        'contextId', v_task.context_id
      );
    end if;
    return jsonb_build_object('outcome', 'conflict');
  end if;

  begin
    if p_task_id is null then
      v_task_id := gen_random_uuid();
      v_context_id := coalesce(p_context_id, gen_random_uuid());
      v_message := p_message || jsonb_build_object(
        'taskId', v_task_id,
        'contextId', v_context_id
      );

      insert into public.a2a_tasks (
        id,
        owner_id,
        api_key_id,
        context_id,
        state,
        history,
        metadata
      ) values (
        v_task_id,
        p_owner_id,
        p_api_key_id,
        v_context_id,
        'submitted',
        jsonb_build_array(v_message),
        coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
          'nexez:activeMessageId', p_message_id,
          'nexez:createdBy', 'a2a-v0.3'
        )
      );
    else
      select * into v_task
      from public.a2a_tasks
      where id = p_task_id and owner_id = p_owner_id
      for update;

      if not found then
        return jsonb_build_object('outcome', 'task_not_found');
      end if;
      if p_context_id is not null and p_context_id <> v_task.context_id then
        return jsonb_build_object('outcome', 'context_mismatch');
      end if;
      if v_task.state in ('completed', 'failed', 'canceled', 'rejected', 'auth-required') then
        return jsonb_build_object('outcome', 'task_terminal');
      end if;
      if v_task.state <> 'input-required' then
        return jsonb_build_object('outcome', 'task_busy');
      end if;

      v_task_id := v_task.id;
      v_context_id := v_task.context_id;
      v_message := p_message || jsonb_build_object(
        'taskId', v_task_id,
        'contextId', v_context_id
      );

      update public.a2a_tasks
      set
        api_key_id = p_api_key_id,
        state = 'submitted',
        status_message = null,
        history = history || jsonb_build_array(v_message),
        metadata = metadata || coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
          'nexez:activeMessageId', p_message_id
        ),
        safe_error_code = null,
        safe_error_message = null,
        completed_at = null,
        updated_at = now()
      where id = v_task_id;
    end if;

    insert into public.a2a_message_receipts (
      owner_id,
      message_id,
      task_id,
      request_hash
    ) values (
      p_owner_id,
      p_message_id,
      v_task_id,
      p_request_hash
    );
  exception
    when unique_violation then
      select * into v_receipt
      from public.a2a_message_receipts
      where owner_id = p_owner_id and message_id = p_message_id;

      if found and v_receipt.request_hash = p_request_hash then
        select * into v_task from public.a2a_tasks where id = v_receipt.task_id;
        return jsonb_build_object(
          'outcome', 'duplicate',
          'taskId', v_receipt.task_id,
          'contextId', v_task.context_id
        );
      end if;
      return jsonb_build_object('outcome', 'conflict');
  end;

  return jsonb_build_object(
    'outcome', 'created',
    'taskId', v_task_id,
    'contextId', v_context_id
  );
end;
$$;

create function public.nz_a2a_claim_task(
  p_owner_id uuid,
  p_task_id uuid,
  p_lease_seconds integer default 90
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_task public.a2a_tasks%rowtype;
  v_token uuid := gen_random_uuid();
  v_sequence bigint;
  v_event jsonb;
begin
  select * into v_task
  from public.a2a_tasks
  where id = p_task_id and owner_id = p_owner_id
  for update;

  if not found then
    return jsonb_build_object('claimed', false, 'taskId', p_task_id);
  end if;
  if v_task.state <> 'submitted' then
    return jsonb_build_object(
      'claimed', false,
      'taskId', v_task.id,
      'contextId', v_task.context_id
    );
  end if;

  v_sequence := v_task.last_event_sequence + 1;
  v_event := jsonb_build_object(
    'kind', 'status-update',
    'taskId', v_task.id,
    'contextId', v_task.context_id,
    'status', jsonb_build_object(
      'state', 'working',
      'timestamp', now()
    ),
    'final', false
  );

  insert into public.a2a_task_events (
    task_id,
    sequence,
    event_id,
    event_kind,
    payload
  ) values (
    v_task.id,
    v_sequence,
    gen_random_uuid(),
    'status-update',
    v_event
  );

  update public.a2a_tasks
  set
    state = 'working',
    execution_token = v_token,
    execution_attempts = execution_attempts + 1,
    claimed_at = now(),
    lease_expires_at = now() + make_interval(secs => greatest(15, least(p_lease_seconds, 120))),
    updated_at = now(),
    last_event_sequence = v_sequence
  where id = v_task.id;

  return jsonb_build_object(
    'claimed', true,
    'taskId', v_task.id,
    'contextId', v_task.context_id,
    'executionToken', v_token,
    'sequence', v_sequence
  );
end;
$$;

create function public.nz_a2a_append_event(
  p_owner_id uuid,
  p_task_id uuid,
  p_execution_token uuid,
  p_event_id uuid,
  p_event jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.a2a_tasks%rowtype;
  v_existing_sequence bigint;
  v_sequence bigint;
  v_kind text := p_event ->> 'kind';
  v_state text;
  v_final boolean;
  v_artifacts jsonb;
  v_history jsonb;
  v_status_message jsonb;
  v_thread_id uuid;
  v_thread_text text;
  v_agent_message jsonb;
  v_message_id text;
begin
  select sequence into v_existing_sequence
  from public.a2a_task_events e
  join public.a2a_tasks t on t.id = e.task_id
  where e.event_id = p_event_id
    and e.task_id = p_task_id
    and t.owner_id = p_owner_id;

  if found then
    return jsonb_build_object('sequence', v_existing_sequence, 'duplicate', true);
  end if;

  select * into v_task
  from public.a2a_tasks
  where id = p_task_id
    and owner_id = p_owner_id
    and execution_token = p_execution_token
    and state = 'working'
  for update;

  if not found then
    raise exception 'A2A execution token is no longer active' using errcode = '55000';
  end if;
  if v_kind not in ('artifact-update', 'status-update') then
    raise exception 'unsupported A2A event kind' using errcode = '22023';
  end if;
  if p_event ->> 'taskId' is distinct from v_task.id::text
     or p_event ->> 'contextId' is distinct from v_task.context_id::text
  then
    raise exception 'A2A event identity does not match its task' using errcode = '22023';
  end if;

  v_sequence := v_task.last_event_sequence + 1;
  v_artifacts := v_task.artifacts;
  v_history := v_task.history;
  v_status_message := v_task.status_message;

  v_thread_text := coalesce(
    p_event -> 'artifact' -> 'metadata' ->> 'nexez:threadId',
    p_event -> 'metadata' ->> 'nexez:threadId'
  );
  if v_thread_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select id into v_thread_id
    from public.agent_threads
    where id = v_thread_text::uuid and user_id = p_owner_id;
  end if;

  if v_kind = 'artifact-update' then
    v_artifacts := private.nz_a2a_apply_artifact(v_artifacts, p_event);

    if coalesce((p_event ->> 'lastChunk')::boolean, false)
       and not coalesce((p_event ->> 'append')::boolean, false)
    then
      v_message_id := coalesce(p_event -> 'metadata' ->> 'nexez:messageId', gen_random_uuid()::text);
      v_agent_message := jsonb_build_object(
        'kind', 'message',
        'role', 'agent',
        'messageId', v_message_id,
        'taskId', v_task.id,
        'contextId', v_task.context_id,
        'parts', coalesce(p_event -> 'artifact' -> 'parts', '[]'::jsonb),
        'metadata', coalesce(p_event -> 'artifact' -> 'metadata', '{}'::jsonb)
      );
      v_history := v_history || jsonb_build_array(v_agent_message);
    end if;
  else
    v_state := p_event -> 'status' ->> 'state';
    if v_state not in (
      'submitted',
      'working',
      'completed',
      'failed',
      'canceled',
      'input-required',
      'rejected',
      'auth-required'
    ) then
      raise exception 'invalid A2A task state' using errcode = '22023';
    end if;
    v_final := coalesce((p_event ->> 'final')::boolean, false);
    if v_final and v_state not in ('completed', 'failed', 'canceled', 'input-required', 'rejected', 'auth-required') then
      raise exception 'final A2A status must be settled' using errcode = '22023';
    end if;
    if not v_final and v_state in ('completed', 'failed', 'canceled', 'input-required', 'rejected', 'auth-required') then
      raise exception 'settled A2A status must be final' using errcode = '22023';
    end if;
    if jsonb_typeof(p_event -> 'status' -> 'message') = 'object' then
      v_status_message := p_event -> 'status' -> 'message';
    end if;
  end if;

  insert into public.a2a_task_events (
    task_id,
    sequence,
    event_id,
    event_kind,
    payload
  ) values (
    v_task.id,
    v_sequence,
    p_event_id,
    v_kind,
    p_event
  );

  update public.a2a_tasks
  set
    state = case when v_kind = 'status-update' then v_state else state end,
    status_message = v_status_message,
    artifacts = v_artifacts,
    history = v_history,
    nexie_thread_id = coalesce(v_thread_id, nexie_thread_id),
    execution_token = case when v_kind = 'status-update' and v_final then null else execution_token end,
    claimed_at = case when v_kind = 'status-update' and v_final then null else claimed_at end,
    lease_expires_at = case when v_kind = 'status-update' and v_final then null else lease_expires_at end,
    completed_at = case when v_kind = 'status-update' and v_final then now() else completed_at end,
    updated_at = now(),
    last_event_sequence = v_sequence
  where id = v_task.id;

  return jsonb_build_object('sequence', v_sequence, 'duplicate', false);
end;
$$;

create function public.nz_a2a_fail_execution(
  p_owner_id uuid,
  p_task_id uuid,
  p_execution_token uuid,
  p_event_id uuid,
  p_error_code text,
  p_error_message text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_task public.a2a_tasks%rowtype;
  v_sequence bigint;
  v_message jsonb;
  v_event jsonb;
begin
  if exists (
    select 1 from public.a2a_task_events
    where event_id = p_event_id and task_id = p_task_id
  ) then
    return;
  end if;

  select * into v_task
  from public.a2a_tasks
  where id = p_task_id
    and owner_id = p_owner_id
    and execution_token = p_execution_token
    and state = 'working'
  for update;

  if not found then
    return;
  end if;

  v_sequence := v_task.last_event_sequence + 1;
  v_message := jsonb_build_object(
    'kind', 'message',
    'role', 'agent',
    'messageId', gen_random_uuid(),
    'taskId', v_task.id,
    'contextId', v_task.context_id,
    'parts', jsonb_build_array(jsonb_build_object('kind', 'text', 'text', p_error_message)),
    'metadata', jsonb_build_object('nexez:errorCode', p_error_code)
  );
  v_event := jsonb_build_object(
    'kind', 'status-update',
    'taskId', v_task.id,
    'contextId', v_task.context_id,
    'status', jsonb_build_object(
      'state', 'failed',
      'timestamp', now(),
      'message', v_message
    ),
    'final', true,
    'metadata', jsonb_build_object('nexez:errorCode', p_error_code)
  );

  insert into public.a2a_task_events (
    task_id,
    sequence,
    event_id,
    event_kind,
    payload
  ) values (
    v_task.id,
    v_sequence,
    p_event_id,
    'status-update',
    v_event
  );

  update public.a2a_tasks
  set
    state = 'failed',
    status_message = v_message,
    history = history || jsonb_build_array(v_message),
    safe_error_code = left(p_error_code, 100),
    safe_error_message = left(p_error_message, 1000),
    execution_token = null,
    claimed_at = null,
    lease_expires_at = null,
    completed_at = now(),
    updated_at = now(),
    last_event_sequence = v_sequence
  where id = v_task.id;
end;
$$;

create function public.nz_a2a_reconcile_task(
  p_owner_id uuid,
  p_task_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_task public.a2a_tasks%rowtype;
  v_sequence bigint;
  v_message jsonb;
  v_event jsonb;
  v_error_message constant text :=
    'The previous worker stopped before completion. Nothing was booked, paid, or submitted. Create a new task to try again.';
begin
  select * into v_task
  from public.a2a_tasks
  where id = p_task_id and owner_id = p_owner_id
  for update;

  if not found or v_task.state <> 'working' or v_task.lease_expires_at >= now() then
    return;
  end if;

  v_sequence := v_task.last_event_sequence + 1;
  v_message := jsonb_build_object(
    'kind', 'message',
    'role', 'agent',
    'messageId', gen_random_uuid(),
    'taskId', v_task.id,
    'contextId', v_task.context_id,
    'parts', jsonb_build_array(jsonb_build_object('kind', 'text', 'text', v_error_message)),
    'metadata', jsonb_build_object('nexez:errorCode', 'worker_lease_expired')
  );
  v_event := jsonb_build_object(
    'kind', 'status-update',
    'taskId', v_task.id,
    'contextId', v_task.context_id,
    'status', jsonb_build_object(
      'state', 'failed',
      'timestamp', now(),
      'message', v_message
    ),
    'final', true,
    'metadata', jsonb_build_object('nexez:errorCode', 'worker_lease_expired')
  );

  insert into public.a2a_task_events (
    task_id,
    sequence,
    event_id,
    event_kind,
    payload
  ) values (
    v_task.id,
    v_sequence,
    gen_random_uuid(),
    'status-update',
    v_event
  );

  update public.a2a_tasks
  set
    state = 'failed',
    status_message = v_message,
    history = history || jsonb_build_array(v_message),
    safe_error_code = 'worker_lease_expired',
    safe_error_message = v_error_message,
    execution_token = null,
    claimed_at = null,
    lease_expires_at = null,
    completed_at = now(),
    updated_at = now(),
    last_event_sequence = v_sequence
  where id = v_task.id;
end;
$$;

revoke all on function public.nz_a2a_accept_message(uuid, uuid, text, text, jsonb, uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.nz_a2a_claim_task(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.nz_a2a_append_event(uuid, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.nz_a2a_fail_execution(uuid, uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.nz_a2a_reconcile_task(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.nz_a2a_accept_message(uuid, uuid, text, text, jsonb, uuid, uuid, jsonb)
  to service_role;
grant execute on function public.nz_a2a_claim_task(uuid, uuid, integer)
  to service_role;
grant execute on function public.nz_a2a_append_event(uuid, uuid, uuid, uuid, jsonb)
  to service_role;
grant execute on function public.nz_a2a_fail_execution(uuid, uuid, uuid, uuid, text, text)
  to service_role;
grant execute on function public.nz_a2a_reconcile_task(uuid, uuid)
  to service_role;

comment on table public.a2a_tasks is
  'Durable A2A v0.3 task state for API-key-authenticated Nexxi requests.';
comment on table public.a2a_message_receipts is
  'Owner-scoped A2A messageId idempotency receipts bound to request hashes.';
comment on table public.a2a_task_events is
  'Append-only, per-task monotonically sequenced A2A status and artifact events.';
comment on column public.a2a_tasks.api_key_id is
  'Originating API key when available. Key deletion sets this null and preserves task history.';
