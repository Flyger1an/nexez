-- Atomic A2A v1 event persistence, cancellation, and fail-closed recovery.

create function public.nz_a2a_v1_append_event(
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
  v_key_count integer;
  v_event_kind text;
  v_event_body jsonb;
  v_event jsonb := p_event;
  v_status jsonb;
  v_state text;
  v_settled boolean := false;
  v_artifacts jsonb;
  v_history jsonb;
  v_thread_id uuid;
  v_thread_text text;
  v_final_artifact jsonb;
  v_agent_message jsonb;
  v_history_message jsonb;
  v_history_has_message boolean := false;
  v_message_id text;
  v_artifact_id text;
  v_now timestamptz := clock_timestamp();
begin
  if p_owner_id is null
     or p_task_id is null
     or p_execution_token is null
     or p_event_id is null
     or jsonb_typeof(v_event) is distinct from 'object'
     or octet_length(v_event::text) > 524288
  then
    raise exception 'invalid A2A v1 stream response' using errcode = '22023';
  end if;

  select count(*)::integer into v_key_count
  from jsonb_object_keys(v_event);
  if v_key_count <> 1 then
    raise exception 'A2A v1 stream response must contain one result field' using errcode = '22023';
  end if;

  if jsonb_typeof(v_event -> 'artifactUpdate') = 'object' then
    v_event_kind := 'artifact_update';
    v_event_body := v_event -> 'artifactUpdate';
  elsif jsonb_typeof(v_event -> 'statusUpdate') = 'object' then
    v_event_kind := 'status_update';
    v_event_body := v_event -> 'statusUpdate';
  else
    raise exception 'unsupported A2A v1 stream response' using errcode = '22023';
  end if;

  select e.sequence into v_existing_sequence
  from public.a2a_task_events e
  where e.owner_id = p_owner_id
    and e.task_id = p_task_id
    and e.event_id = p_event_id;

  if found then
    return jsonb_build_object(
      'sequence', v_existing_sequence,
      'duplicate', true
    );
  end if;

  select * into v_task
  from public.a2a_tasks
  where id = p_task_id
    and owner_id = p_owner_id
    and execution_token = p_execution_token
    and state = 'TASK_STATE_WORKING'
    and lease_expires_at > v_now
  for update;

  if not found then
    raise exception 'A2A v1 execution token is no longer active' using errcode = '55000';
  end if;

  if v_event_body ->> 'taskId' is distinct from v_task.id::text
     or v_event_body ->> 'contextId' is distinct from v_task.context_id
  then
    raise exception 'A2A v1 event identity does not match its task' using errcode = '22023';
  end if;
  if v_event_body ? 'metadata'
     and jsonb_typeof(v_event_body -> 'metadata') is distinct from 'object'
  then
    raise exception 'A2A v1 event metadata must be an object' using errcode = '22023';
  end if;

  v_sequence := v_task.last_event_sequence + 1;
  v_status := v_task.status;
  v_artifacts := v_task.artifacts;
  v_history := v_task.history;

  v_thread_text := coalesce(
    v_event -> 'artifactUpdate' -> 'artifact' -> 'metadata' ->> 'nexez:threadId',
    v_event -> 'artifactUpdate' -> 'metadata' ->> 'nexez:threadId',
    v_event -> 'statusUpdate' -> 'metadata' ->> 'nexez:threadId'
  );
  if v_thread_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select id into v_thread_id
    from public.agent_threads
    where id = v_thread_text::uuid
      and user_id = p_owner_id;
  end if;

  if v_event_kind = 'artifact_update' then
    if (v_event_body ? 'append'
        and jsonb_typeof(v_event_body -> 'append') is distinct from 'boolean')
       or (v_event_body ? 'lastChunk'
        and jsonb_typeof(v_event_body -> 'lastChunk') is distinct from 'boolean')
    then
      raise exception 'A2A v1 artifact flags must be booleans' using errcode = '22023';
    end if;

    v_artifacts := private.nz_a2a_v1_apply_artifact(v_artifacts, v_event);

    if coalesce((v_event_body ->> 'lastChunk')::boolean, false) then
      v_artifact_id := v_event_body -> 'artifact' ->> 'artifactId';
      select value into v_final_artifact
      from jsonb_array_elements(v_artifacts)
      where value ->> 'artifactId' = v_artifact_id
      limit 1;

      v_message_id := coalesce(
        nullif(v_event_body -> 'metadata' ->> 'nexez:messageId', ''),
        p_event_id::text
      );
      if char_length(v_message_id) > 200 then
        raise exception 'A2A v1 agent message identifier is too long' using errcode = '22023';
      end if;

      for v_history_message in
        select value from jsonb_array_elements(v_history)
      loop
        if v_history_message ->> 'messageId' = v_message_id then
          v_history_has_message := true;
          exit;
        end if;
      end loop;

      if not v_history_has_message then
        if jsonb_array_length(v_history) >= 200 then
          raise exception 'A2A v1 task history limit exceeded' using errcode = '22023';
        end if;
        v_agent_message := jsonb_build_object(
          'messageId', v_message_id,
          'taskId', v_task.id,
          'contextId', v_task.context_id,
          'role', 'ROLE_AGENT',
          'parts', coalesce(v_final_artifact -> 'parts', '[]'::jsonb),
          'metadata', coalesce(v_final_artifact -> 'metadata', '{}'::jsonb)
        );
        v_history := v_history || jsonb_build_array(v_agent_message);
      end if;
    end if;
  else
    v_status := v_event_body -> 'status';
    if jsonb_typeof(v_status) is distinct from 'object' then
      raise exception 'invalid A2A v1 task status' using errcode = '22023';
    end if;

    v_state := v_status ->> 'state';
    if v_state not in (
      'TASK_STATE_WORKING',
      'TASK_STATE_COMPLETED',
      'TASK_STATE_FAILED',
      'TASK_STATE_CANCELED',
      'TASK_STATE_INPUT_REQUIRED',
      'TASK_STATE_REJECTED',
      'TASK_STATE_AUTH_REQUIRED'
    ) then
      raise exception 'invalid A2A v1 task state' using errcode = '22023';
    end if;
    if v_status ? 'message'
       and jsonb_typeof(v_status -> 'message') is distinct from 'object'
    then
      raise exception 'A2A v1 status message must be an object' using errcode = '22023';
    end if;
    if v_state = 'TASK_STATE_COMPLETED'
       and jsonb_array_length(v_artifacts) = 0
    then
      raise exception 'completed A2A v1 tasks require an artifact' using errcode = '22023';
    end if;

    -- Database chronology is authoritative; worker timestamps are replaced.
    v_status := jsonb_set(v_status, '{timestamp}', to_jsonb(v_now), true);
    v_event_body := jsonb_set(v_event_body, '{status}', v_status, true);
    v_event := jsonb_build_object('statusUpdate', v_event_body);
    v_settled := v_state in (
      'TASK_STATE_COMPLETED',
      'TASK_STATE_FAILED',
      'TASK_STATE_CANCELED',
      'TASK_STATE_INPUT_REQUIRED',
      'TASK_STATE_REJECTED',
      'TASK_STATE_AUTH_REQUIRED'
    );
  end if;

  insert into public.a2a_task_events (
    owner_id,
    task_id,
    sequence,
    event_id,
    event_kind,
    payload
  ) values (
    v_task.owner_id,
    v_task.id,
    v_sequence,
    p_event_id,
    v_event_kind,
    v_event
  );

  update public.a2a_tasks
  set
    state = case
      when v_event_kind = 'status_update' then v_state
      else state
    end,
    status = case
      when v_event_kind = 'status_update' then v_status
      else status
    end,
    artifacts = v_artifacts,
    history = v_history,
    nexie_thread_id = coalesce(v_thread_id, nexie_thread_id),
    execution_token = case when v_settled then null else execution_token end,
    claimed_at = case when v_settled then null else claimed_at end,
    lease_expires_at = case when v_settled then null else lease_expires_at end,
    settled_at = case when v_settled then v_now else settled_at end,
    status_updated_at = case
      when v_event_kind = 'status_update' then v_now
      else status_updated_at
    end,
    updated_at = v_now,
    last_event_sequence = v_sequence
  where id = v_task.id;

  return jsonb_build_object(
    'sequence', v_sequence,
    'duplicate', false,
    'settled', v_settled
  );
end;
$$;

create function public.nz_a2a_v1_cancel_task(
  p_owner_id uuid,
  p_task_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.a2a_tasks%rowtype;
  v_sequence bigint;
  v_event_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_status jsonb;
  v_event jsonb;
begin
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) is distinct from 'object'
     or octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 65536
  then
    raise exception 'invalid A2A v1 cancellation metadata' using errcode = '22023';
  end if;

  select * into v_task
  from public.a2a_tasks
  where id = p_task_id
    and owner_id = p_owner_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'task_not_found');
  end if;
  if v_task.state = 'TASK_STATE_CANCELED' then
    return jsonb_build_object(
      'outcome', 'already_canceled',
      'taskId', v_task.id,
      'contextId', v_task.context_id,
      'state', v_task.state,
      'sequence', v_task.last_event_sequence
    );
  end if;
  if v_task.state in (
    'TASK_STATE_COMPLETED',
    'TASK_STATE_FAILED',
    'TASK_STATE_REJECTED'
  ) then
    return jsonb_build_object(
      'outcome', 'task_not_cancelable',
      'taskId', v_task.id,
      'contextId', v_task.context_id,
      'state', v_task.state
    );
  end if;

  v_sequence := v_task.last_event_sequence + 1;
  v_status := jsonb_build_object(
    'state', 'TASK_STATE_CANCELED',
    'timestamp', v_now
  );
  v_event := jsonb_build_object(
    'statusUpdate', jsonb_build_object(
      'taskId', v_task.id,
      'contextId', v_task.context_id,
      'status', v_status,
      'metadata', coalesce(p_metadata, '{}'::jsonb)
        || jsonb_build_object('nexez:canceledBy', 'a2a-client')
    )
  );

  insert into public.a2a_task_events (
    owner_id,
    task_id,
    sequence,
    event_id,
    event_kind,
    payload
  ) values (
    v_task.owner_id,
    v_task.id,
    v_sequence,
    v_event_id,
    'status_update',
    v_event
  );

  update public.a2a_tasks
  set
    state = 'TASK_STATE_CANCELED',
    status = v_status,
    execution_token = null,
    claimed_at = null,
    lease_expires_at = null,
    settled_at = v_now,
    status_updated_at = v_now,
    updated_at = v_now,
    last_event_sequence = v_sequence
  where id = v_task.id;

  return jsonb_build_object(
    'outcome', 'canceled',
    'taskId', v_task.id,
    'contextId', v_task.context_id,
    'state', 'TASK_STATE_CANCELED',
    'sequence', v_sequence,
    'eventId', v_event_id
  );
end;
$$;

create function public.nz_a2a_v1_fail_execution(
  p_owner_id uuid,
  p_task_id uuid,
  p_execution_token uuid,
  p_event_id uuid,
  p_error_code text,
  p_error_message text
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
  v_code text := left(
    coalesce(nullif(btrim(p_error_code), ''), 'execution_failed'),
    128
  );
  v_message_text text := left(
    coalesce(nullif(btrim(p_error_message), ''), 'The task could not be completed.'),
    1000
  );
  v_now timestamptz := clock_timestamp();
  v_message jsonb;
  v_status jsonb;
  v_event jsonb;
begin
  select e.sequence into v_existing_sequence
  from public.a2a_task_events e
  where e.owner_id = p_owner_id
    and e.task_id = p_task_id
    and e.event_id = p_event_id;

  if found then
    return jsonb_build_object(
      'stored', true,
      'sequence', v_existing_sequence,
      'duplicate', true
    );
  end if;

  select * into v_task
  from public.a2a_tasks
  where id = p_task_id
    and owner_id = p_owner_id
    and execution_token = p_execution_token
    and state = 'TASK_STATE_WORKING'
  for update;

  if not found then
    return jsonb_build_object('stored', false, 'duplicate', false);
  end if;

  v_sequence := v_task.last_event_sequence + 1;
  v_message := jsonb_build_object(
    'messageId', p_event_id,
    'taskId', v_task.id,
    'contextId', v_task.context_id,
    'role', 'ROLE_AGENT',
    'parts', jsonb_build_array(jsonb_build_object(
      'text', v_message_text,
      'mediaType', 'text/plain'
    )),
    'metadata', jsonb_build_object('nexez:errorCode', v_code)
  );
  v_status := jsonb_build_object(
    'state', 'TASK_STATE_FAILED',
    'message', v_message,
    'timestamp', v_now
  );
  v_event := jsonb_build_object(
    'statusUpdate', jsonb_build_object(
      'taskId', v_task.id,
      'contextId', v_task.context_id,
      'status', v_status,
      'metadata', jsonb_build_object('nexez:errorCode', v_code)
    )
  );

  insert into public.a2a_task_events (
    owner_id,
    task_id,
    sequence,
    event_id,
    event_kind,
    payload
  ) values (
    v_task.owner_id,
    v_task.id,
    v_sequence,
    p_event_id,
    'status_update',
    v_event
  );

  update public.a2a_tasks
  set
    state = 'TASK_STATE_FAILED',
    status = v_status,
    history = case
      when jsonb_array_length(history) < 200
        then history || jsonb_build_array(v_message)
      else history
    end,
    safe_error_code = v_code,
    safe_error_message = v_message_text,
    execution_token = null,
    claimed_at = null,
    lease_expires_at = null,
    settled_at = v_now,
    status_updated_at = v_now,
    updated_at = v_now,
    last_event_sequence = v_sequence
  where id = v_task.id;

  return jsonb_build_object(
    'stored', true,
    'sequence', v_sequence,
    'duplicate', false
  );
end;
$$;

create function public.nz_a2a_v1_reconcile_task(
  p_owner_id uuid,
  p_task_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.a2a_tasks%rowtype;
  v_sequence bigint;
  v_event_id uuid := gen_random_uuid();
  v_code text := 'worker_lease_expired';
  v_message_text text := 'The task stopped before completion. Create a new task to try again.';
  v_now timestamptz := clock_timestamp();
  v_message jsonb;
  v_status jsonb;
  v_event jsonb;
begin
  select * into v_task
  from public.a2a_tasks
  where id = p_task_id
    and owner_id = p_owner_id
    and state = 'TASK_STATE_WORKING'
    and lease_expires_at <= v_now
  for update;

  if not found then
    return jsonb_build_object('reconciled', false);
  end if;

  v_sequence := v_task.last_event_sequence + 1;
  v_message := jsonb_build_object(
    'messageId', v_event_id,
    'taskId', v_task.id,
    'contextId', v_task.context_id,
    'role', 'ROLE_AGENT',
    'parts', jsonb_build_array(jsonb_build_object(
      'text', v_message_text,
      'mediaType', 'text/plain'
    )),
    'metadata', jsonb_build_object('nexez:errorCode', v_code)
  );
  v_status := jsonb_build_object(
    'state', 'TASK_STATE_FAILED',
    'message', v_message,
    'timestamp', v_now
  );
  v_event := jsonb_build_object(
    'statusUpdate', jsonb_build_object(
      'taskId', v_task.id,
      'contextId', v_task.context_id,
      'status', v_status,
      'metadata', jsonb_build_object('nexez:errorCode', v_code)
    )
  );

  insert into public.a2a_task_events (
    owner_id,
    task_id,
    sequence,
    event_id,
    event_kind,
    payload
  ) values (
    v_task.owner_id,
    v_task.id,
    v_sequence,
    v_event_id,
    'status_update',
    v_event
  );

  update public.a2a_tasks
  set
    state = 'TASK_STATE_FAILED',
    status = v_status,
    history = case
      when jsonb_array_length(history) < 200
        then history || jsonb_build_array(v_message)
      else history
    end,
    safe_error_code = v_code,
    safe_error_message = v_message_text,
    execution_token = null,
    claimed_at = null,
    lease_expires_at = null,
    settled_at = v_now,
    status_updated_at = v_now,
    updated_at = v_now,
    last_event_sequence = v_sequence
  where id = v_task.id;

  return jsonb_build_object(
    'reconciled', true,
    'sequence', v_sequence,
    'eventId', v_event_id
  );
end;
$$;

revoke all on function public.nz_a2a_v1_append_event(uuid, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.nz_a2a_v1_append_event(uuid, uuid, uuid, uuid, jsonb)
  to service_role;

revoke all on function public.nz_a2a_v1_cancel_task(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.nz_a2a_v1_cancel_task(uuid, uuid, jsonb)
  to service_role;

revoke all on function public.nz_a2a_v1_fail_execution(uuid, uuid, uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.nz_a2a_v1_fail_execution(uuid, uuid, uuid, uuid, text, text)
  to service_role;

revoke all on function public.nz_a2a_v1_reconcile_task(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.nz_a2a_v1_reconcile_task(uuid, uuid)
  to service_role;
