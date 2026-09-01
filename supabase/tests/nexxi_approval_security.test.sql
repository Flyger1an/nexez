begin;

select plan(36);

insert into auth.users (id)
values
  ('10000000-0000-4000-8000-000000000101'),
  ('10000000-0000-4000-8000-000000000102');

insert into public.user_agents (id, user_id, name)
values (
  '20000000-0000-4000-8000-000000000101',
  '10000000-0000-4000-8000-000000000101',
  'Nexxi'
);

insert into public.agent_threads (id, agent_id, user_id, title)
values (
  '30000000-0000-4000-8000-000000000101',
  '20000000-0000-4000-8000-000000000101',
  '10000000-0000-4000-8000-000000000101',
  'Approval security gauntlet'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.agent_action_approvals'::regclass),
  'approval ledger keeps row level security enabled'
);

select ok(
  has_table_privilege('authenticated', 'public.agent_action_approvals', 'select'),
  'authenticated buyers may read their own approval history'
);

select ok(
  not has_table_privilege('authenticated', 'public.agent_action_approvals', 'insert')
    and not has_table_privilege('authenticated', 'public.agent_action_approvals', 'update')
    and not has_table_privilege('authenticated', 'public.agent_action_approvals', 'delete')
    and not has_table_privilege('authenticated', 'public.agent_action_approvals', 'truncate'),
  'authenticated clients have no approval-ledger mutation privilege'
);

select ok(
  not has_table_privilege('anon', 'public.agent_action_approvals', 'select')
    and not has_table_privilege('anon', 'public.agent_action_approvals', 'insert')
    and not has_table_privilege('anon', 'public.agent_action_approvals', 'update')
    and not has_table_privilege('anon', 'public.agent_action_approvals', 'delete')
    and not has_table_privilege('anon', 'public.agent_action_approvals', 'truncate'),
  'anonymous clients have no approval-ledger privilege'
);

select ok(
  has_table_privilege('service_role', 'public.agent_action_approvals', 'select')
    and has_table_privilege('service_role', 'public.agent_action_approvals', 'insert')
    and has_table_privilege('service_role', 'public.agent_action_approvals', 'update')
    and has_table_privilege('service_role', 'public.agent_action_approvals', 'delete'),
  'trusted server and account-deletion paths retain required access'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'agent_action_approvals'
      and 'authenticated' = any (roles)
  ),
  1::bigint,
  'approval ledger exposes exactly one authenticated policy'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'agent_action_approvals'
      and policyname = 'Users read own Nexxi approvals'
      and cmd = 'SELECT'
      and 'authenticated' = any (roles)
  ),
  'the authenticated policy is owner-scoped read-only access'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.agent_action_approvals'::regclass
      and tgname = 'trg_guard_agent_action_approval_write'
      and not tgisinternal
  ),
  'approval state-machine trigger is installed'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.nz_guard_agent_action_approval_write()',
    'execute'
  ),
  'browser roles cannot invoke the guard function directly'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.agent_action_approvals'::regclass
      and conname = 'agent_action_approvals_tool_name_check'
      and convalidated
  ),
  'approval tool names are constrained to executable contracts'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.agent_action_approvals'::regclass
      and conname = 'agent_action_approvals_payload_object_check'
      and convalidated
  ),
  'approval payloads must remain JSON objects'
);

select throws_ok(
  $$
    insert into public.agent_action_approvals (
      id, thread_id, user_id, tool_name, status, summary, payload, decided_at
    ) values (
      '40000000-0000-4000-8000-000000000110',
      '30000000-0000-4000-8000-000000000101',
      '10000000-0000-4000-8000-000000000101',
      'trigger_booking',
      'APPROVED',
      'Forged approval',
      '{"slug":"forged"}'::jsonb,
      clock_timestamp()
    )
  $$,
  '23514',
  null,
  'an approval cannot be inserted directly into APPROVED state'
);

select throws_ok(
  $$
    insert into public.agent_action_approvals (
      id, thread_id, user_id, tool_name, summary, payload
    ) values (
      '40000000-0000-4000-8000-000000000111',
      '30000000-0000-4000-8000-000000000101',
      '10000000-0000-4000-8000-000000000102',
      'trigger_booking',
      'Mismatched buyer',
      '{"slug":"wrong-owner"}'::jsonb
    )
  $$,
  '23514',
  null,
  'approval owner must match the owning thread'
);

select throws_ok(
  $$
    insert into public.agent_action_approvals (
      id, thread_id, user_id, tool_name, summary, payload
    ) values (
      '40000000-0000-4000-8000-000000000112',
      '30000000-0000-4000-8000-000000000101',
      '10000000-0000-4000-8000-000000000101',
      'arbitrary_money_tool',
      'Unsupported action',
      '{}'::jsonb
    )
  $$,
  '23514',
  null,
  'unsupported recovery actions are rejected'
);

select throws_ok(
  $$
    insert into public.agent_action_approvals (
      id, thread_id, user_id, tool_name, summary, payload
    ) values (
      '40000000-0000-4000-8000-000000000113',
      '30000000-0000-4000-8000-000000000101',
      '10000000-0000-4000-8000-000000000101',
      'trigger_booking',
      'Invalid payload',
      '[]'::jsonb
    )
  $$,
  '23514',
  null,
  'approval payload cannot be a non-object JSON value'
);

select lives_ok(
  $$
    insert into public.agent_action_approvals (
      id, thread_id, user_id, tool_name, summary, payload
    ) values (
      '40000000-0000-4000-8000-000000000101',
      '30000000-0000-4000-8000-000000000101',
      '10000000-0000-4000-8000-000000000101',
      'trigger_booking',
      'Book the selected service',
      '{"slug":"cleaner","offer":"services-0"}'::jsonb
    )
  $$,
  'trusted server may create a pristine pending approval'
);

select is(
  (select status from public.agent_action_approvals where id = '40000000-0000-4000-8000-000000000101'),
  'PENDING',
  'new approval begins pending'
);

select throws_ok(
  $$
    update public.agent_action_approvals
       set payload = '{"slug":"different-merchant"}'::jsonb
     where id = '40000000-0000-4000-8000-000000000101'
  $$,
  '23514',
  null,
  'proposed action payload is immutable after presentation'
);

select throws_ok(
  $$
    update public.agent_action_approvals
       set status = 'EXECUTED',
           decided_at = clock_timestamp(),
           completed_at = clock_timestamp(),
           result = '{"ok":true}'::jsonb
     where id = '40000000-0000-4000-8000-000000000101'
  $$,
  '23514',
  null,
  'pending approval cannot skip the explicit decision state'
);

select lives_ok(
  $$
    update public.agent_action_approvals
       set status = 'APPROVED',
           decided_at = clock_timestamp()
     where id = '40000000-0000-4000-8000-000000000101'
       and status = 'PENDING'
  $$,
  'pending approval may be compare-and-swapped to approved'
);

select ok(
  (
    select status = 'APPROVED' and decided_at is not null and completed_at is null
    from public.agent_action_approvals
    where id = '40000000-0000-4000-8000-000000000101'
  ),
  'approved row records only the buyer decision'
);

select throws_ok(
  $$
    update public.agent_action_approvals
       set status = 'APPROVED'
     where id = '40000000-0000-4000-8000-000000000101'
  $$,
  '23514',
  null,
  'approved rows cannot receive arbitrary no-op rewrites'
);

select lives_ok(
  $$
    update public.agent_action_approvals
       set recovery_attempted_at = clock_timestamp(),
           recovery_attempts = recovery_attempts + 1
     where id = '40000000-0000-4000-8000-000000000101'
       and status = 'APPROVED'
  $$,
  'approved action may advance its recovery lease exactly once'
);

select ok(
  (
    select recovery_attempts = 1 and recovery_attempted_at is not null
    from public.agent_action_approvals
    where id = '40000000-0000-4000-8000-000000000101'
  ),
  'recovery lease records one attempt'
);

select lives_ok(
  $$
    update public.agent_action_approvals
       set status = 'EXECUTED',
           result = '{"ok":true,"url":"https://example.test/checkout"}'::jsonb,
           completed_at = clock_timestamp()
     where id = '40000000-0000-4000-8000-000000000101'
  $$,
  'approved action may record one successful terminal outcome'
);

select ok(
  (
    select status = 'EXECUTED'
      and result ->> 'ok' = 'true'
      and error is null
      and completed_at is not null
    from public.agent_action_approvals
    where id = '40000000-0000-4000-8000-000000000101'
  ),
  'executed approval has a complete result and no error'
);

select throws_ok(
  $$
    update public.agent_action_approvals
       set result = '{"ok":false}'::jsonb
     where id = '40000000-0000-4000-8000-000000000101'
  $$,
  '23514',
  null,
  'executed approval cannot be rewritten'
);

select lives_ok(
  $$
    insert into public.agent_action_approvals (
      id, thread_id, user_id, tool_name, summary, payload
    ) values (
      '40000000-0000-4000-8000-000000000102',
      '30000000-0000-4000-8000-000000000101',
      '10000000-0000-4000-8000-000000000101',
      'initiate_negotiation',
      'Negotiate the selected service',
      '{"slug":"cleaner","offer":"services-0"}'::jsonb
    )
  $$,
  'trusted server may create a second pending approval'
);

select lives_ok(
  $$
    update public.agent_action_approvals
       set status = 'REJECTED',
           decided_at = clock_timestamp()
     where id = '40000000-0000-4000-8000-000000000102'
       and status = 'PENDING'
  $$,
  'buyer may reject a pending action through the server route'
);

select ok(
  (
    select status = 'REJECTED'
      and decided_at is not null
      and result is null
      and error is null
    from public.agent_action_approvals
    where id = '40000000-0000-4000-8000-000000000102'
  ),
  'rejected approval records no execution outcome'
);

select throws_ok(
  $$
    update public.agent_action_approvals
       set summary = 'Rewritten rejection'
     where id = '40000000-0000-4000-8000-000000000102'
  $$,
  '23514',
  null,
  'rejected approval is terminal and immutable'
);

select lives_ok(
  $$
    insert into public.agent_action_approvals (
      id, thread_id, user_id, tool_name, summary, payload
    ) values (
      '40000000-0000-4000-8000-000000000103',
      '30000000-0000-4000-8000-000000000101',
      '10000000-0000-4000-8000-000000000101',
      'trigger_booking',
      'Book a service that will fail safely',
      '{"slug":"cleaner","offer":"services-1"}'::jsonb
    )
  $$,
  'trusted server may create a failure-path approval'
);

select lives_ok(
  $$
    update public.agent_action_approvals
       set status = 'APPROVED',
           decided_at = clock_timestamp()
     where id = '40000000-0000-4000-8000-000000000103'
       and status = 'PENDING'
  $$,
  'failure-path approval can still be explicitly approved'
);

select lives_ok(
  $$
    update public.agent_action_approvals
       set status = 'FAILED',
           error = 'Provider rejected the booking handoff.',
           completed_at = clock_timestamp()
     where id = '40000000-0000-4000-8000-000000000103'
  $$,
  'approved action may record one failed terminal outcome'
);

select ok(
  (
    select status = 'FAILED'
      and nullif(btrim(error), '') is not null
      and result is null
      and completed_at is not null
    from public.agent_action_approvals
    where id = '40000000-0000-4000-8000-000000000103'
  ),
  'failed approval has a complete error and no result'
);

select throws_ok(
  $$
    update public.agent_action_approvals
       set error = 'Different failure narrative.'
     where id = '40000000-0000-4000-8000-000000000103'
  $$,
  '23514',
  null,
  'failed approval cannot be rewritten'
);

select * from finish();

rollback;
