begin;
set local search_path = public, extensions;

select plan(14);

select ok(to_regclass('public.a2a_tasks') is not null, 'A2A tasks table exists');
select ok(to_regclass('public.a2a_message_receipts') is not null, 'A2A message receipts table exists');
select ok(to_regclass('public.a2a_task_events') is not null, 'A2A task events table exists');

select ok(
  (select bool_and(relrowsecurity)
   from pg_class
   where oid in (
     'public.a2a_tasks'::regclass,
     'public.a2a_message_receipts'::regclass,
     'public.a2a_task_events'::regclass
   )),
  'every exposed A2A table has RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'public.a2a_tasks', 'select')
    and not has_table_privilege('authenticated', 'public.a2a_tasks', 'select')
    and not has_table_privilege('service_role', 'public.a2a_tasks', 'select')
    and not has_table_privilege('service_role', 'public.a2a_task_events', 'insert')
    and not has_table_privilege('service_role', 'public.a2a_message_receipts', 'delete'),
  'all direct ledger table access is denied'
);

select is(
  (select count(*) from pg_policies
   where schemaname = 'public'
     and tablename in ('a2a_tasks', 'a2a_message_receipts', 'a2a_task_events')),
  0::bigint,
  'no browser-facing policy exposes the server-only ledgers'
);

select ok(
  has_function_privilege('service_role', 'public.nz_a2a_v1_accept_message(uuid,uuid,text,text,jsonb,uuid,text,jsonb)', 'execute')
    and has_function_privilege('service_role', 'public.nz_a2a_v1_claim_task(uuid,uuid,integer)', 'execute')
    and has_function_privilege('service_role', 'public.nz_a2a_v1_get_task(uuid,uuid,integer)', 'execute')
    and has_function_privilege('service_role', 'public.nz_a2a_v1_list_events(uuid,uuid,bigint,integer)', 'execute')
    and has_function_privilege('service_role', 'public.nz_a2a_v1_get_execution_context(uuid,uuid,uuid)', 'execute')
    and has_function_privilege('service_role', 'public.nz_a2a_v1_append_event(uuid,uuid,uuid,uuid,jsonb)', 'execute')
    and has_function_privilege('service_role', 'public.nz_a2a_v1_cancel_task(uuid,uuid,jsonb)', 'execute')
    and has_function_privilege('service_role', 'public.nz_a2a_v1_fail_execution(uuid,uuid,uuid,uuid,text,text)', 'execute')
    and has_function_privilege('service_role', 'public.nz_a2a_v1_reconcile_task(uuid,uuid)', 'execute'),
  'service role may invoke the bounded A2A ledger API'
);

select ok(
  not has_function_privilege('anon', 'public.nz_a2a_v1_accept_message(uuid,uuid,text,text,jsonb,uuid,text,jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.nz_a2a_v1_append_event(uuid,uuid,uuid,uuid,jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.nz_a2a_v1_cancel_task(uuid,uuid,jsonb)', 'execute'),
  'browser roles cannot invoke A2A ledger RPCs'
);

select ok(
  not has_function_privilege('service_role', 'private.nz_a2a_v1_apply_artifact(jsonb,jsonb)', 'execute'),
  'the private artifact reducer is not a direct service-role API'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'nz_a2a_v1_%'
      and (
        not p.prosecdef
        or not (
          coalesce(p.proconfig, '{}'::text[])
          @> array['search_path=""']::text[]
        )
      )
  ),
  'every public A2A RPC is security definer with an empty search path'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.a2a_message_receipts'::regclass
      and conname = 'a2a_message_receipts_task_owner_fkey'
      and pg_get_constraintdef(oid) like '%FOREIGN KEY (task_id, owner_id)%'
  )
  and exists (
    select 1 from pg_constraint
    where conrelid = 'public.a2a_task_events'::regclass
      and conname = 'a2a_task_events_task_owner_fkey'
      and pg_get_constraintdef(oid) like '%FOREIGN KEY (task_id, owner_id)%'
  ),
  'receipts and events are tenant-bound to their task owner'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.a2a_tasks'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) like '%api_keys(id) ON DELETE SET NULL%'
  ),
  'API-key deletion preserves historical tasks'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'a2a_tasks_owner_context_status_idx'
  )
  and exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'a2a_tasks_expired_worker_idx'
  ),
  'context reads and expired-worker recovery are indexed'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.a2a_tasks'::regclass
      and conname = 'a2a_tasks_worker_lease_shape_check'
  )
  and exists (
    select 1
    from pg_constraint
    where conrelid = 'public.a2a_tasks'::regclass
      and conname = 'a2a_tasks_settlement_shape_check'
  ),
  'worker leases and settlement states are database-enforced'
);

select * from finish();
rollback;
