-- Atomic A2A v1 message acceptance, worker claims, and owner-bound reads.

create function public.nz_a2a_v1_accept_message(
  p_owner_id uuid,
  p_api_key_id uuid,
  p_message_id text,
  p_request_hash text,
  p_message jsonb,
  p_task_id uuid default null,
  p_context_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.a2a_message_receipts%rowtype;
  v_task public.a2a_tasks%rowtype;
  v_task_id uuid;
  v_context_id text;
  v_message jsonb;
  v_status jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if p_owner_id is null
     or p_api_key_id is null
     or p_message_id is null
     or char_length(p_message_id) not between 1 and 200
     or p_message_id <> btrim(p_message_id)
     or p_request_hash is null
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_message) is distinct from 'object'
     or p_message ->> 'messageId' is distinct from p_message_id
     or p_message ->> 'role' is distinct from 'ROLE_USER'
     or jsonb_typeof(p_message -> 'parts') is distinct from 'array'
     or jsonb_array_length(p_message -> 'parts') = 0
     or jsonb_array_length(p_message -> 'parts') > 20
     or octet_length(p_message::text) > 131072
     or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) is distinct from 'object'
     or octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 65536
     or (
       p_context_id is not null
       and (
         char_length(p_context_id) not between 1 and 200
         or p_context_id <> btrim(p_context_id)
       )
     )
  then
    raise exception 'invalid A2A v1 message acceptance input' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.api_keys
    where id = p_api_key_id
      and owner_id = p_owner_id
      and revoked_at is null
  ) then
    return jsonb_build_object('outcome', 'api_key_invalid');
  end if;

  select * into v_receipt
  from public.a2a_message_receipts
  where owner_id = p_owner_id
    and message_id = p_message_id;

  if found then
    if v_receipt.request_hash = p_request_hash then
      select * into v_task
      from public.a2a_tasks
      where id = v_receipt.task_id
        and owner_id = p_owner_id;
      return jsonb_build_object(
        'outcome', 'duplicate',
        'taskId', v_receipt.task_id,
        'contextId', v_task.context_id,
        'state', v_task.state
      );
    end if;
    return jsonb_build_object('outcome', 'conflict');
  end if;

  begin
    if p_task_id is null then
      v_task_id := gen_random_uuid();
      v_context_id := coalesce(p_context_id, gen_random_uuid()::text);
      v_message := (p_message - 'taskId' - 'contextId') || jsonb_build_object(
        'taskId', v_task_id,
        'contextId', v_context_id
      );
      v_status := jsonb_build_object(
        'state', 'TASK_STATE_SUBMITTED',
        'timestamp', v_now
      );

      insert into public.a2a_tasks (
        id,
        owner_id,
        api_key_id,
        protocol_version,
        context_id,
        state,
        status,
        history,
        metadata,
        status_updated_at,
        created_at,
        updated_at
      ) values (
        v_task_id,
        p_owner_id,
        p_api_key_id,
        '1.0',
        v_context_id,
        'TASK_STATE_SUBMITTED',
        v_status,
        jsonb_build_array(v_message),
        coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
          'nexez:activeMessageId', p_message_id,
          'nexez:createdBy', 'a2a-v1',
          'nexez:protocolVersion', '1.0'
        ),
        v_now,
        v_now,
        v_now
      );
    else
      select * into v_task
      from public.a2a_tasks
      where id = p_task_id
        and owner_id = p_owner_id
      for update;

      if not found then
        return jsonb_build_object('outcome', 'task_not_found');
      end if;
      if p_context_id is not null and p_context_id <> v_task.context_id then
        return jsonb_build_object('outcome', 'context_mismatch');
      end if;
      if v_task.state in (
        'TASK_STATE_COMPLETED',
        'TASK_STATE_FAILED',
        'TASK_STATE_CANCELED',
        'TASK_STATE_REJECTED'
      ) then
        return jsonb_build_object('outcome', 'task_terminal');
      end if;
      if v_task.state not in (
        'TASK_STATE_INPUT_REQUIRED',
        'TASK_STATE_AUTH_REQUIRED'
      ) then
        return jsonb_build_object('outcome', 'task_busy');
      end if;
      if jsonb_array_length(v_task.history) >= 200 then
        return jsonb_build_object('outcome', 'history_limit');
      end if;

      v_task_id := v_task.id;
      v_context_id := v_task.context_id;
      v_message := (p_message - 'taskId' - 'contextId') || jsonb_build_object(
        'taskId', v_task_id,
        'contextId', v_context_id
      );
      v_status := jsonb_build_object(
        'state', 'TASK_STATE_SUBMITTED',
        'timestamp', v_now
      );

      update public.a2a_tasks
      set
        api_key_id = p_api_key_id,
        state = 'TASK_STATE_SUBMITTED',
        status = v_status,
        history = history || jsonb_build_array(v_message),
        metadata = metadata || coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
          'nexez:activeMessageId', p_message_id,
          'nexez:protocolVersion', '1.0'
        ),
        safe_error_code = null,
        safe_error_message = null,
        execution_token = null,
        claimed_at = null,
        lease_expires_at = null,
        settled_at = null,
        status_updated_at = v_now,
        updated_at = v_now
      where id = v_task_id;
    end if;

    insert into public.a2a_message_receipts (
      owner_id,
      message_id,
      task_id,
      request_hash,
      protocol_version
    ) values (
      p_owner_id,
      p_message_id,
      v_task_id,
      p_request_hash,
      '1.0'
    );
  exception
    when unique_violation then
      select * into v_receipt
      from public.a2a_message_receipts
      where owner_id = p_owner_id
        and message_id = p_message_id;

      if found and v_receipt.request_hash = p_request_hash then
        select * into v_task
        from public.a2a_tasks
        where id = v_receipt.task_id
          and owner_id = p_owner_id;
        return jsonb_build_object(
          'outcome', 'duplicate',
          'taskId', v_receipt.task_id,
          'contextId', v_task.context_id,
          'state', v_task.state
        );
      end if;
      return jsonb_build_object('outcome', 'conflict');
  end;

  return jsonb_build_object(
    'outcome', 'created',
    'taskId', v_task_id,
    'contextId', v_context_id,
    'state', 'TASK_STATE_SUBMITTED'
  );
end;
$$;

create function public.nz_a2a_v1_claim_task(
  p_owner_id uuid,
  p_task_id uuid,
  p_lease_seconds integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.a2a_tasks%rowtype;
  v_token uuid := gen_random_uuid();
  v_sequence bigint;
  v_now timestamptz := clock_timestamp();
  v_status jsonb;
  v_event jsonb;
  v_lease_seconds integer := greatest(15, least(coalesce(p_lease_seconds, 90), 120));
begin
  select * into v_task
  from public.a2a_tasks
  where id = p_task_id
    and owner_id = p_owner_id
  for update;

  if not found then
    return jsonb_build_object('claimed', false, 'outcome', 'task_not_found');
  end if;
  if v_task.state <> 'TASK_STATE_SUBMITTED' then
    return jsonb_build_object(
      'claimed', false,
      'outcome', 'task_not_submitted',
      'taskId', v_task.id,
      'contextId', v_task.context_id,
      'state', v_task.state
    );
  end if;
  if v_task.api_key_id is null or not exists (
    select 1
    from public.api_keys
    where id = v_task.api_key_id
      and owner_id = p_owner_id
      and revoked_at is null
  ) then
    return jsonb_build_object(
      'claimed', false,
      'outcome', 'api_key_invalid',
      'taskId', v_task.id,
      'contextId', v_task.context_id,
      'state', v_task.state
    );
  end if;

  v_sequence := v_task.last_event_sequence + 1;
  v_status := jsonb_build_object(
    'state', 'TASK_STATE_WORKING',
    'timestamp', v_now
  );
  v_event := jsonb_build_object(
    'statusUpdate', jsonb_build_object(
      'taskId', v_task.id,
      'contextId', v_task.context_id,
      'status', v_status
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
    gen_random_uuid(),
    'status_update',
    v_event
  );

  update public.a2a_tasks
  set
    state = 'TASK_STATE_WORKING',
    status = v_status,
    execution_token = v_token,
    execution_attempts = execution_attempts + 1,
    claimed_at = v_now,
    lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
    status_updated_at = v_now,
    updated_at = v_now,
    last_event_sequence = v_sequence
  where id = v_task.id;

  return jsonb_build_object(
    'claimed', true,
    'outcome', 'claimed',
    'taskId', v_task.id,
    'contextId', v_task.context_id,
    'executionToken', v_token,
    'leaseExpiresAt', v_now + make_interval(secs => v_lease_seconds),
    'sequence', v_sequence,
    'state', 'TASK_STATE_WORKING'
  );
end;
$$;

create function public.nz_a2a_v1_get_task(
  p_owner_id uuid,
  p_task_id uuid,
  p_history_length integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.a2a_tasks%rowtype;
  v_history jsonb;
  v_metadata jsonb;
begin
  if p_history_length is not null
     and (p_history_length < 0 or p_history_length > 50)
  then
    raise exception 'invalid A2A v1 history length' using errcode = '22023';
  end if;

  select * into v_task
  from public.a2a_tasks
  where id = p_task_id
    and owner_id = p_owner_id;

  if not found then
    return null;
  end if;

  if p_history_length is not null then
    select coalesce(jsonb_agg(item order by ordinal), '[]'::jsonb)
    into v_history
    from jsonb_array_elements(v_task.history) with ordinality as items(item, ordinal)
    where ordinal > greatest(jsonb_array_length(v_task.history) - p_history_length, 0);
  end if;

  v_metadata := v_task.metadata || jsonb_build_object(
    'nexez:eventSequence', v_task.last_event_sequence,
    'nexez:executionAttempts', v_task.execution_attempts,
    'nexez:protocolVersion', v_task.protocol_version
  );
  if v_task.safe_error_code is not null then
    v_metadata := v_metadata || jsonb_build_object(
      'nexez:errorCode', v_task.safe_error_code
    );
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'id', v_task.id,
    'contextId', v_task.context_id,
    'status', v_task.status,
    'artifacts', case
      when jsonb_array_length(v_task.artifacts) > 0 then v_task.artifacts
      else null
    end,
    'history', case
      when p_history_length is null then null
      else v_history
    end,
    'metadata', v_metadata
  ));
end;
$$;

create function public.nz_a2a_v1_list_events(
  p_owner_id uuid,
  p_task_id uuid,
  p_after_sequence bigint default 0,
  p_limit integer default 200
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sequence', event.sequence,
        'eventId', event.event_id,
        'eventKind', event.event_kind,
        'payload', event.payload,
        'createdAt', event.created_at
      )
      order by event.sequence
    ),
    '[]'::jsonb
  )
  from (
    select e.*
    from public.a2a_task_events e
    where e.owner_id = p_owner_id
      and e.task_id = p_task_id
      and e.sequence > greatest(coalesce(p_after_sequence, 0), 0)
    order by e.sequence
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  ) as event;
$$;

create function public.nz_a2a_v1_get_execution_context(
  p_owner_id uuid,
  p_task_id uuid,
  p_execution_token uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'taskId', task.id,
    'contextId', task.context_id,
    'nexxiThreadId', task.nexxi_thread_id,
    'history', task.history,
    'metadata', task.metadata,
    'leaseExpiresAt', task.lease_expires_at
  )
  from public.a2a_tasks task
  where task.id = p_task_id
    and task.owner_id = p_owner_id
    and task.execution_token = p_execution_token
    and task.state = 'TASK_STATE_WORKING'
    and task.lease_expires_at > clock_timestamp();
$$;

revoke all on function public.nz_a2a_v1_accept_message(
  uuid, uuid, text, text, jsonb, uuid, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.nz_a2a_v1_accept_message(
  uuid, uuid, text, text, jsonb, uuid, text, jsonb
) to service_role;

revoke all on function public.nz_a2a_v1_claim_task(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.nz_a2a_v1_claim_task(uuid, uuid, integer)
  to service_role;

revoke all on function public.nz_a2a_v1_get_task(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.nz_a2a_v1_get_task(uuid, uuid, integer)
  to service_role;

revoke all on function public.nz_a2a_v1_list_events(uuid, uuid, bigint, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.nz_a2a_v1_list_events(uuid, uuid, bigint, integer)
  to service_role;

revoke all on function public.nz_a2a_v1_get_execution_context(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.nz_a2a_v1_get_execution_context(uuid, uuid, uuid)
  to service_role;
