-- Retain durable release certificates while removing bounded, synthetic A2A
-- task payloads after their operational value expires. Cleanup is deliberately
-- limited to registered test principals and known certification message IDs.

create table private.a2a_test_principals (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  principal_kind text not null,
  retention_days integer not null default 30,
  active boolean not null default true,
  registered_at timestamptz not null default now(),

  constraint a2a_test_principals_kind_check check (
    principal_kind in ('certification_primary', 'certification_secondary')
  ),
  constraint a2a_test_principals_retention_check check (
    retention_days between 7 and 365
  )
);

comment on table private.a2a_test_principals is
  'Operator-registered synthetic A2A principals eligible for prefix-scoped task cleanup. No customer account is eligible by age alone.';

alter table private.a2a_test_principals enable row level security;

revoke all on table private.a2a_test_principals
  from public, anon, authenticated, service_role;

create index a2a_tasks_test_retention_idx
  on public.a2a_tasks (owner_id, settled_at, id)
  where state in (
    'TASK_STATE_COMPLETED',
    'TASK_STATE_FAILED',
    'TASK_STATE_CANCELED',
    'TASK_STATE_INPUT_REQUIRED',
    'TASK_STATE_REJECTED',
    'TASK_STATE_AUTH_REQUIRED'
  );

create or replace function private.nz_cleanup_a2a_test_evidence(
  p_batch_size integer default 100
)
returns table (
  removed_tasks integer,
  removed_receipts integer,
  removed_events integer
)
language plpgsql
set search_path = ''
as $$
declare
  v_task_ids uuid[] := '{}'::uuid[];
  v_removed_tasks integer := 0;
  v_removed_receipts integer := 0;
  v_removed_events integer := 0;
begin
  if p_batch_size < 1 or p_batch_size > 1000 then
    raise exception 'p_batch_size must be between 1 and 1000';
  end if;

  select coalesce(array_agg(candidate.id), '{}'::uuid[])
  into v_task_ids
  from (
    select task.id
    from public.a2a_tasks as task
    join private.a2a_test_principals as principal
      on principal.owner_id = task.owner_id
     and principal.active
    where task.state in (
        'TASK_STATE_COMPLETED',
        'TASK_STATE_FAILED',
        'TASK_STATE_CANCELED',
        'TASK_STATE_INPUT_REQUIRED',
        'TASK_STATE_REJECTED',
        'TASK_STATE_AUTH_REQUIRED'
      )
      and task.settled_at < clock_timestamp() - make_interval(days => principal.retention_days)
      and exists (
        select 1
        from public.a2a_message_receipts as receipt
        where receipt.task_id = task.id
          and receipt.owner_id = task.owner_id
          and (
            receipt.message_id like 'a2a-cert-%'
            or receipt.message_id like 'a2a-canary-%'
          )
      )
      and not exists (
        select 1
        from public.a2a_message_receipts as receipt
        where receipt.task_id = task.id
          and receipt.owner_id = task.owner_id
          and receipt.message_id not like 'a2a-cert-%'
          and receipt.message_id not like 'a2a-canary-%'
      )
    order by task.settled_at, task.id
    limit p_batch_size
    for update of task skip locked
  ) as candidate;

  if cardinality(v_task_ids) = 0 then
    return query select 0, 0, 0;
    return;
  end if;

  select count(*)::integer
  into v_removed_receipts
  from public.a2a_message_receipts
  where task_id = any(v_task_ids);

  select count(*)::integer
  into v_removed_events
  from public.a2a_task_events
  where task_id = any(v_task_ids);

  delete from public.a2a_tasks
  where id = any(v_task_ids);
  get diagnostics v_removed_tasks = row_count;

  return query select v_removed_tasks, v_removed_receipts, v_removed_events;
end;
$$;

comment on function private.nz_cleanup_a2a_test_evidence(integer) is
  'Deletes a bounded batch of settled synthetic A2A tasks only when both the owner registration and every message-receipt prefix prove certification or canary scope.';

revoke all on function private.nz_cleanup_a2a_test_evidence(integer)
  from public, anon, authenticated, service_role;

do $a2a_retention_schedule$
declare
  existing_job bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for existing_job in
      select jobid from cron.job where jobname = 'nexez_cleanup_a2a_test_evidence'
    loop
      perform cron.unschedule(existing_job);
    end loop;

    perform cron.schedule(
      'nexez_cleanup_a2a_test_evidence',
      '17 5 * * *',
      $command$select * from private.nz_cleanup_a2a_test_evidence(100)$command$
    );
  end if;
end
$a2a_retention_schedule$;
