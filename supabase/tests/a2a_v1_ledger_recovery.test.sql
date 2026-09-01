begin;
set local search_path = public, extensions;

select plan(17);

insert into auth.users (id)
values
  ('10000000-0000-4000-8000-000000000203'),
  ('10000000-0000-4000-8000-000000000204'),
  ('10000000-0000-4000-8000-000000000205'),
  ('10000000-0000-4000-8000-000000000206');

insert into public.billing_subscriptions (
  owner_id,
  plan_id,
  status,
  trial_ends_at,
  account_origin
)
values
  ('10000000-0000-4000-8000-000000000203', 'pro', 'active', null, 'legacy'),
  ('10000000-0000-4000-8000-000000000204', 'pro', 'active', null, 'legacy'),
  ('10000000-0000-4000-8000-000000000205', 'pro', 'active', null, 'legacy'),
  ('10000000-0000-4000-8000-000000000206', 'pro', 'active', null, 'legacy');

insert into public.api_keys (id, owner_id, name, key_hash, prefix)
values
  ('20000000-0000-4000-8000-000000000203', '10000000-0000-4000-8000-000000000203', 'A2A key deletion', repeat('c', 64), 'nxz_a2a_3'),
  ('20000000-0000-4000-8000-000000000204', '10000000-0000-4000-8000-000000000204', 'A2A account cascade', repeat('d', 64), 'nxz_a2a_4'),
  ('20000000-0000-4000-8000-000000000205', '10000000-0000-4000-8000-000000000205', 'A2A revoked key', repeat('e', 64), 'nxz_a2a_5'),
  ('20000000-0000-4000-8000-000000000206', '10000000-0000-4000-8000-000000000206', 'A2A retention key', repeat('f', 64), 'nxz_a2a_6');

create temporary table a2a_v1_test_state (
  key text primary key,
  value jsonb not null
) on commit drop;

insert into a2a_v1_test_state (key, value)
select 'key-delete-task', public.nz_a2a_v1_accept_message(
  '10000000-0000-4000-8000-000000000203',
  '20000000-0000-4000-8000-000000000203',
  'key-delete-message',
  repeat('6', 64),
  '{"messageId":"key-delete-message","role":"ROLE_USER","parts":[{"text":"Preserve this task."}]}'::jsonb
);

delete from public.api_keys
where id = '20000000-0000-4000-8000-000000000203';

select ok(
  (select api_key_id is null
   from public.a2a_tasks
   where id = (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'key-delete-task')),
  'deleting an API key preserves its task history'
);

insert into a2a_v1_test_state (key, value)
select 'revoked-task', public.nz_a2a_v1_accept_message(
  '10000000-0000-4000-8000-000000000205',
  '20000000-0000-4000-8000-000000000205',
  'revoked-message',
  repeat('7', 64),
  '{"messageId":"revoked-message","role":"ROLE_USER","parts":[{"text":"Do not execute after revocation."}]}'::jsonb
);

update public.api_keys
set revoked_at = clock_timestamp()
where id = '20000000-0000-4000-8000-000000000205';

select is(
  public.nz_a2a_v1_claim_task(
    '10000000-0000-4000-8000-000000000205',
    (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'revoked-task')
  ) ->> 'outcome',
  'api_key_invalid',
  'a revoked originating key blocks delayed execution'
);

insert into a2a_v1_test_state (key, value)
select 'reconcile-task', public.nz_a2a_v1_accept_message(
  '10000000-0000-4000-8000-000000000204',
  '20000000-0000-4000-8000-000000000204',
  'reconcile-message',
  repeat('8', 64),
  '{"messageId":"reconcile-message","role":"ROLE_USER","parts":[{"text":"Start and stop."}]}'::jsonb
);

insert into a2a_v1_test_state (key, value)
select 'reconcile-claim', public.nz_a2a_v1_claim_task(
  '10000000-0000-4000-8000-000000000204',
  (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'reconcile-task'),
  15
);

update public.a2a_tasks
set lease_expires_at = clock_timestamp() - interval '1 second'
where id = (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'reconcile-task');

select ok(
  (public.nz_a2a_v1_reconcile_task(
    '10000000-0000-4000-8000-000000000204',
    (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'reconcile-task')
  ) ->> 'reconciled')::boolean,
  'an expired worker lease is reconciled'
);

select ok(
  (select state = 'TASK_STATE_FAILED'
      and safe_error_code = 'worker_lease_expired'
      and execution_token is null
      and settled_at is not null
      and last_event_sequence = 2
   from public.a2a_tasks
   where id = (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'reconcile-task')),
  'expired workers fail closed instead of being replayed'
);

select ok(
  not (public.nz_a2a_v1_reconcile_task(
    '10000000-0000-4000-8000-000000000204',
    (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'reconcile-task')
  ) ->> 'reconciled')::boolean
  and
  (select count(*) from public.a2a_task_events
   where task_id = (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'reconcile-task')) = 2,
  'worker reconciliation is idempotent'
);

insert into a2a_v1_test_state (key, value)
select 'failure-task', public.nz_a2a_v1_accept_message(
  '10000000-0000-4000-8000-000000000204',
  '20000000-0000-4000-8000-000000000204',
  'failure-message',
  repeat('9', 64),
  '{"messageId":"failure-message","role":"ROLE_USER","parts":[{"text":"Fail safely."}]}'::jsonb
);

insert into a2a_v1_test_state (key, value)
select 'failure-claim', public.nz_a2a_v1_claim_task(
  '10000000-0000-4000-8000-000000000204',
  (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'failure-task')
);

insert into a2a_v1_test_state (key, value)
select 'failure-store', public.nz_a2a_v1_fail_execution(
  '10000000-0000-4000-8000-000000000204',
  (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'failure-task'),
  (select (value ->> 'executionToken')::uuid from a2a_v1_test_state where key = 'failure-claim'),
  '50000000-0000-4000-8000-000000000208',
  'provider_failure',
  'The task could not be completed.'
);

select ok(
  (select value ->> 'stored' from a2a_v1_test_state where key = 'failure-store')::boolean,
  'a worker failure is durably stored'
);

select ok(
  (select state = 'TASK_STATE_FAILED'
      and safe_error_code = 'provider_failure'
      and safe_error_message = 'The task could not be completed.'
      and status -> 'message' ->> 'role' = 'ROLE_AGENT'
      and execution_token is null
   from public.a2a_tasks
   where id = (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'failure-task')),
  'worker failure exposes only the bounded safe status'
);

select ok(
  (public.nz_a2a_v1_fail_execution(
    '10000000-0000-4000-8000-000000000204',
    (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'failure-task'),
    (select (value ->> 'executionToken')::uuid from a2a_v1_test_state where key = 'failure-claim'),
    '50000000-0000-4000-8000-000000000208',
    'ignored',
    'ignored'
  ) ->> 'duplicate')::boolean,
  'failure events are idempotent by event ID'
);

select is(
  public.nz_a2a_v1_get_task(
    '10000000-0000-4000-8000-000000000203',
    (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'failure-task'),
    null
  ),
  null::jsonb,
  'GetTask does not disclose another owner task'
);

select is(
  jsonb_array_length(
    public.nz_a2a_v1_list_events(
      '10000000-0000-4000-8000-000000000204',
      (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'failure-task'),
      1,
      20
    )
  ),
  1,
  'event cursors return only events after the requested sequence'
);

select ok(
  not exists (
    select 1
    from public.a2a_task_events
    where payload ? 'kind'
       or payload ? 'final'
       or payload::text like '%a2a-v0.3%'
  ),
  'persisted events contain no retired v0.3 discriminators'
);

select ok(
  (select relrowsecurity
   from pg_class
   where oid = 'private.a2a_test_principals'::regclass)
  and not has_table_privilege('anon', 'private.a2a_test_principals', 'select')
  and not has_table_privilege('authenticated', 'private.a2a_test_principals', 'select')
  and not has_table_privilege('service_role', 'private.a2a_test_principals', 'select')
  and not has_function_privilege(
    'service_role',
    'private.nz_cleanup_a2a_test_evidence(integer)',
    'execute'
  ),
  'test-principal registration and cleanup stay outside every application role'
);

insert into private.a2a_test_principals (
  owner_id,
  principal_kind,
  retention_days
) values (
  '10000000-0000-4000-8000-000000000206',
  'certification_primary',
  30
);

insert into a2a_v1_test_state (key, value)
select 'retention-eligible', public.nz_a2a_v1_accept_message(
  '10000000-0000-4000-8000-000000000206',
  '20000000-0000-4000-8000-000000000206',
  'a2a-cert-retention-old',
  repeat('a', 64),
  '{"messageId":"a2a-cert-retention-old","role":"ROLE_USER","parts":[{"text":"Synthetic certification task."}]}'::jsonb
);

insert into a2a_v1_test_state (key, value)
select 'retention-customer', public.nz_a2a_v1_accept_message(
  '10000000-0000-4000-8000-000000000206',
  '20000000-0000-4000-8000-000000000206',
  'customer-retention-old',
  repeat('b', 64),
  '{"messageId":"customer-retention-old","role":"ROLE_USER","parts":[{"text":"Customer task must remain."}]}'::jsonb
);

insert into a2a_v1_test_state (key, value)
select 'retention-recent', public.nz_a2a_v1_accept_message(
  '10000000-0000-4000-8000-000000000206',
  '20000000-0000-4000-8000-000000000206',
  'a2a-canary-retention-recent',
  repeat('c', 64),
  '{"messageId":"a2a-canary-retention-recent","role":"ROLE_USER","parts":[{"text":"Recent canary task."}]}'::jsonb
);

select public.nz_a2a_v1_cancel_task(
  '10000000-0000-4000-8000-000000000206',
  (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'retention-eligible')
);
select public.nz_a2a_v1_cancel_task(
  '10000000-0000-4000-8000-000000000206',
  (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'retention-customer')
);
select public.nz_a2a_v1_cancel_task(
  '10000000-0000-4000-8000-000000000206',
  (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'retention-recent')
);
select public.nz_a2a_v1_cancel_task(
  '10000000-0000-4000-8000-000000000205',
  (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'revoked-task')
);

update public.a2a_message_receipts
set message_id = 'a2a-cert-unregistered-old'
where owner_id = '10000000-0000-4000-8000-000000000205'
  and message_id = 'revoked-message';

update public.a2a_tasks
set
  settled_at = clock_timestamp() - interval '31 days',
  status_updated_at = clock_timestamp() - interval '31 days',
  updated_at = clock_timestamp() - interval '31 days'
where id in (
  (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'retention-eligible'),
  (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'retention-customer'),
  (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'revoked-task')
);

create temporary table a2a_retention_result on commit drop as
select * from private.nz_cleanup_a2a_test_evidence(100);

select ok(
  (select removed_tasks = 1
      and removed_receipts = 1
      and removed_events = 1
   from a2a_retention_result),
  'retention removes one old terminal test task and its exact child evidence'
);

select ok(
  not exists (
    select 1 from public.a2a_tasks
    where id = (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'retention-eligible')
  )
  and exists (
    select 1 from public.a2a_tasks
    where id = (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'retention-customer')
  )
  and exists (
    select 1 from public.a2a_tasks
    where id = (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'retention-recent')
  )
  and exists (
    select 1 from public.a2a_tasks
    where id = (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'revoked-task')
  ),
  'retention preserves customer, recent, and unregistered-owner tasks'
);

select throws_ok(
  $$ select * from private.nz_cleanup_a2a_test_evidence(0) $$,
  'P0001',
  'p_batch_size must be between 1 and 1000',
  'retention refuses an unbounded or empty batch'
);

select ok(
  exists (
    select 1
    from cron.job
    where jobname = 'nexez_cleanup_a2a_test_evidence'
      and schedule = '17 5 * * *'
      and command like '%private.nz_cleanup_a2a_test_evidence(100)%'
  ),
  'daily database cron invokes the bounded private retention function'
);

delete from auth.users
where id = '10000000-0000-4000-8000-000000000204';

select ok(
  not exists (
    select 1 from public.a2a_tasks
    where owner_id = '10000000-0000-4000-8000-000000000204'
  )
  and not exists (
    select 1 from public.a2a_message_receipts
    where owner_id = '10000000-0000-4000-8000-000000000204'
  )
  and not exists (
    select 1 from public.a2a_task_events
    where owner_id = '10000000-0000-4000-8000-000000000204'
  ),
  'account deletion cascades through task, receipt, and event ledgers'
);

select * from finish();
rollback;
