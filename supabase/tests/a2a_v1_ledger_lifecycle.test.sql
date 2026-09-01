begin;
set local search_path = public, extensions;

select plan(33);

insert into auth.users (id)
values
  ('10000000-0000-4000-8000-000000000201'),
  ('10000000-0000-4000-8000-000000000202');

insert into public.billing_subscriptions (
  owner_id,
  plan_id,
  status,
  trial_ends_at,
  account_origin
)
values
  ('10000000-0000-4000-8000-000000000201', 'pro', 'active', null, 'legacy'),
  ('10000000-0000-4000-8000-000000000202', 'pro', 'active', null, 'legacy');

insert into public.api_keys (id, owner_id, name, key_hash, prefix)
values
  ('20000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000201', 'A2A owner one', repeat('a', 64), 'nxz_a2a_1'),
  ('20000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000202', 'A2A owner two', repeat('b', 64), 'nxz_a2a_2');

insert into public.user_agents (id, user_id, name)
values
  ('30000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000201', 'Nexxi'),
  ('30000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000202', 'Other owner agent');

insert into public.agent_threads (id, agent_id, user_id, title)
values
  ('40000000-0000-4000-8000-000000000201', '30000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000201', 'A2A Nexxi continuity'),
  ('40000000-0000-4000-8000-000000000202', '30000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000202', 'Other owner thread');

create temporary table a2a_v1_test_state (
  key text primary key,
  value jsonb not null
) on commit drop;

insert into a2a_v1_test_state (key, value)
select 'accept-one', public.nz_a2a_v1_accept_message(
  '10000000-0000-4000-8000-000000000201',
  '20000000-0000-4000-8000-000000000201',
  'message-one',
  repeat('1', 64),
  '{"messageId":"message-one","role":"ROLE_USER","parts":[{"text":"Find a move-out cleaner in Dallas.","mediaType":"text/plain"}]}'::jsonb,
  null,
  'buyer-context-1',
  '{"request":"initial"}'::jsonb
);

select is(
  (select value ->> 'outcome' from a2a_v1_test_state where key = 'accept-one'),
  'created',
  'a new v1 message creates a durable task'
);

select ok(
  (select state = 'TASK_STATE_SUBMITTED'
      and status ->> 'state' = 'TASK_STATE_SUBMITTED'
      and status ? 'timestamp'
      and protocol_version = '1.0'
   from public.a2a_tasks
   where id = (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one')),
  'new tasks use the v1 submitted state and protocol version'
);

select ok(
  (select history -> 0 ->> 'role' = 'ROLE_USER'
      and history -> 0 ->> 'messageId' = 'message-one'
      and history -> 0 ->> 'taskId' = id::text
      and history -> 0 ->> 'contextId' = context_id
      and not (history -> 0 ? 'kind')
   from public.a2a_tasks
   where id = (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one')),
  'stored messages use v1 ProtoJSON fields and authoritative task identity'
);

select ok(
  (select value ? 'id'
      and value ? 'contextId'
      and value ? 'status'
      and not (value ? 'history')
      and not (value ? 'owner_id')
      and not (value ? 'api_key_id')
   from (
     select public.nz_a2a_v1_get_task(
       '10000000-0000-4000-8000-000000000201',
       (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one'),
       null
     ) as value
   ) task),
  'GetTask omits history by default and hides ownership internals'
);

select is(
  jsonb_array_length(
    public.nz_a2a_v1_get_task(
      '10000000-0000-4000-8000-000000000201',
      (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one'),
      0
    ) -> 'history'
  ),
  0,
  'GetTask honors a zero-length history request'
);

insert into a2a_v1_test_state (key, value)
select 'duplicate-one', public.nz_a2a_v1_accept_message(
  '10000000-0000-4000-8000-000000000201',
  '20000000-0000-4000-8000-000000000201',
  'message-one',
  repeat('1', 64),
  '{"messageId":"message-one","role":"ROLE_USER","parts":[{"text":"Find a move-out cleaner in Dallas.","mediaType":"text/plain"}]}'::jsonb,
  null,
  'buyer-context-1',
  '{}'::jsonb
);

select is(
  (select value ->> 'outcome' from a2a_v1_test_state where key = 'duplicate-one'),
  'duplicate',
  'same message identity and request hash are idempotent'
);

select ok(
  (select count(*) from public.a2a_tasks
   where owner_id = '10000000-0000-4000-8000-000000000201') = 1
  and
  (select count(*) from public.a2a_message_receipts
   where owner_id = '10000000-0000-4000-8000-000000000201') = 1,
  'an idempotent retry creates no duplicate ledger rows'
);

select is(
  public.nz_a2a_v1_accept_message(
    '10000000-0000-4000-8000-000000000201',
    '20000000-0000-4000-8000-000000000201',
    'message-one',
    repeat('2', 64),
    '{"messageId":"message-one","role":"ROLE_USER","parts":[{"text":"Find a plumber."}]}'::jsonb
  ) ->> 'outcome',
  'conflict',
  'conflicting message reuse is rejected'
);

select is(
  public.nz_a2a_v1_accept_message(
    '10000000-0000-4000-8000-000000000201',
    '20000000-0000-4000-8000-000000000202',
    'message-wrong-key',
    repeat('3', 64),
    '{"messageId":"message-wrong-key","role":"ROLE_USER","parts":[{"text":"Do work."}]}'::jsonb
  ) ->> 'outcome',
  'api_key_invalid',
  'API keys cannot cross owner boundaries'
);

insert into a2a_v1_test_state (key, value)
select 'claim-one', public.nz_a2a_v1_claim_task(
  '10000000-0000-4000-8000-000000000201',
  (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one'),
  90
);

select is(
  (select value ->> 'outcome' from a2a_v1_test_state where key = 'claim-one'),
  'claimed',
  'a submitted task can be atomically claimed'
);

select ok(
  (select state = 'TASK_STATE_WORKING'
      and execution_token is not null
      and claimed_at is not null
      and lease_expires_at > claimed_at
      and settled_at is null
      and last_event_sequence = 1
   from public.a2a_tasks
   where id = (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one')),
  'claim establishes one bounded worker lease and first event sequence'
);

select ok(
  (select payload ? 'statusUpdate'
      and payload -> 'statusUpdate' -> 'status' ->> 'state' = 'TASK_STATE_WORKING'
      and not (payload ? 'kind')
      and not (payload -> 'statusUpdate' ? 'final')
   from public.a2a_task_events
   where task_id = (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one')
     and sequence = 1),
  'claim emits a v1 statusUpdate without retired fields'
);

select is(
  public.nz_a2a_v1_claim_task(
    '10000000-0000-4000-8000-000000000201',
    (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one')
  ) ->> 'outcome',
  'task_not_submitted',
  'a working task cannot be double claimed'
);

select ok(
  public.nz_a2a_v1_get_execution_context(
    '10000000-0000-4000-8000-000000000201',
    (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one'),
    (select (value ->> 'executionToken')::uuid from a2a_v1_test_state where key = 'claim-one')
  ) ->> 'contextId' = 'buyer-context-1',
  'the active worker can read its owner-bound execution context'
);

select is(
  public.nz_a2a_v1_get_execution_context(
    '10000000-0000-4000-8000-000000000202',
    (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one'),
    (select (value ->> 'executionToken')::uuid from a2a_v1_test_state where key = 'claim-one')
  ),
  null::jsonb,
  'another owner cannot read the execution context'
);

insert into a2a_v1_test_state (key, value)
select 'preview-one', public.nz_a2a_v1_append_event(
  '10000000-0000-4000-8000-000000000201',
  (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one'),
  (select (value ->> 'executionToken')::uuid from a2a_v1_test_state where key = 'claim-one'),
  '50000000-0000-4000-8000-000000000201',
  jsonb_build_object('artifactUpdate', jsonb_build_object(
    'taskId', (select value ->> 'taskId' from a2a_v1_test_state where key = 'accept-one'),
    'contextId', 'buyer-context-1',
    'artifact', jsonb_build_object(
      'artifactId', 'nexxi-response',
      'name', 'Nexxi response',
      'parts', jsonb_build_array(jsonb_build_object(
        'text', 'I found ',
        'mediaType', 'text/plain'
      )),
      'metadata', jsonb_build_object(
        'nexez:threadId', '40000000-0000-4000-8000-000000000202'
      )
    ),
    'append', false,
    'lastChunk', false
  ))
);

select is(
  (select (value ->> 'sequence')::bigint from a2a_v1_test_state where key = 'preview-one'),
  2::bigint,
  'preview artifact receives the next monotonic sequence'
);

select ok(
  (select artifacts -> 0 ->> 'artifactId' = 'nexxi-response'
      and artifacts -> 0 -> 'parts' -> 0 ->> 'text' = 'I found '
      and nexie_thread_id is null
   from public.a2a_tasks
   where id = (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one')),
  'preview output is stored while a foreign-owner Nexxi thread is ignored'
);

select ok(
  jsonb_array_length(
    public.nz_a2a_v1_list_events(
      '10000000-0000-4000-8000-000000000201',
      (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one'),
      0,
      20
    )
  ) = 2
  and
  jsonb_array_length(
    public.nz_a2a_v1_list_events(
      '10000000-0000-4000-8000-000000000202',
      (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one'),
      0,
      20
    )
  ) = 0,
  'event reads are ordered and owner bounded'
);

select ok(
  (public.nz_a2a_v1_append_event(
    '10000000-0000-4000-8000-000000000201',
    (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one'),
    (select (value ->> 'executionToken')::uuid from a2a_v1_test_state where key = 'claim-one'),
    '50000000-0000-4000-8000-000000000201',
    jsonb_build_object('artifactUpdate', jsonb_build_object(
      'taskId', (select value ->> 'taskId' from a2a_v1_test_state where key = 'accept-one'),
      'contextId', 'buyer-context-1',
      'artifact', jsonb_build_object(
        'artifactId', 'nexxi-response',
        'parts', jsonb_build_array(jsonb_build_object('text', 'ignored'))
      )
    ))
  ) ->> 'duplicate')::boolean
  and
  (select count(*) from public.a2a_task_events
   where task_id = (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one')) = 2,
  'duplicate event IDs are idempotent'
);

select throws_ok(
  format(
    $$select public.nz_a2a_v1_append_event(%L::uuid, %L::uuid, %L::uuid, %L::uuid, %L::jsonb)$$,
    '10000000-0000-4000-8000-000000000201',
    (select value ->> 'taskId' from a2a_v1_test_state where key = 'accept-one'),
    '99999999-0000-4000-8000-000000000999',
    '50000000-0000-4000-8000-000000000202',
    jsonb_build_object('artifactUpdate', jsonb_build_object(
      'taskId', (select value ->> 'taskId' from a2a_v1_test_state where key = 'accept-one'),
      'contextId', 'buyer-context-1',
      'artifact', jsonb_build_object(
        'artifactId', 'nexxi-response',
        'parts', jsonb_build_array(jsonb_build_object('text', 'bad token'))
      )
    ))::text
  ),
  '55000',
  null,
  'an inactive execution token cannot append events'
);

select throws_ok(
  format(
    $$select public.nz_a2a_v1_append_event(%L::uuid, %L::uuid, %L::uuid, %L::uuid, %L::jsonb)$$,
    '10000000-0000-4000-8000-000000000201',
    (select value ->> 'taskId' from a2a_v1_test_state where key = 'accept-one'),
    (select value ->> 'executionToken' from a2a_v1_test_state where key = 'claim-one'),
    '50000000-0000-4000-8000-000000000203',
    '{"artifactUpdate":{"taskId":"wrong-task","contextId":"buyer-context-1","artifact":{"artifactId":"nexxi-response","parts":[{"text":"wrong"}]}}}'
  ),
  '22023',
  null,
  'event identity must match the leased task'
);

select throws_ok(
  format(
    $$select public.nz_a2a_v1_append_event(%L::uuid, %L::uuid, %L::uuid, %L::uuid, %L::jsonb)$$,
    '10000000-0000-4000-8000-000000000201',
    (select value ->> 'taskId' from a2a_v1_test_state where key = 'accept-one'),
    (select value ->> 'executionToken' from a2a_v1_test_state where key = 'claim-one'),
    '50000000-0000-4000-8000-000000000204',
    jsonb_build_object('artifactUpdate', jsonb_build_object(
      'taskId', (select value ->> 'taskId' from a2a_v1_test_state where key = 'accept-one'),
      'contextId', 'buyer-context-1',
      'artifact', jsonb_build_object(
        'artifactId', 'missing-artifact',
        'parts', jsonb_build_array(jsonb_build_object('text', 'append'))
      ),
      'append', true
    ))::text
  ),
  '22023',
  null,
  'append cannot create a missing artifact'
);

insert into a2a_v1_test_state (key, value)
select 'final-artifact-one', public.nz_a2a_v1_append_event(
  '10000000-0000-4000-8000-000000000201',
  (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one'),
  (select (value ->> 'executionToken')::uuid from a2a_v1_test_state where key = 'claim-one'),
  '50000000-0000-4000-8000-000000000205',
  jsonb_build_object('artifactUpdate', jsonb_build_object(
    'taskId', (select value ->> 'taskId' from a2a_v1_test_state where key = 'accept-one'),
    'contextId', 'buyer-context-1',
    'artifact', jsonb_build_object(
      'artifactId', 'nexxi-response',
      'name', 'Nexxi response',
      'parts', jsonb_build_array(
        jsonb_build_object(
          'text', 'I found two cleaners.',
          'mediaType', 'text/plain'
        ),
        jsonb_build_object(
          'data', jsonb_build_object('cards', jsonb_build_array()),
          'mediaType', 'application/json'
        )
      ),
      'metadata', jsonb_build_object(
        'nexez:authoritative', true,
        'nexez:threadId', '40000000-0000-4000-8000-000000000201'
      )
    ),
    'append', false,
    'lastChunk', true,
    'metadata', jsonb_build_object('nexez:messageId', 'agent-message-one')
  ))
);

select is(
  (select (value ->> 'sequence')::bigint from a2a_v1_test_state where key = 'final-artifact-one'),
  3::bigint,
  'authoritative artifact advances the ordered event stream'
);

select ok(
  (select artifacts -> 0 -> 'parts' -> 0 ->> 'text' = 'I found two cleaners.'
      and history -> -1 ->> 'role' = 'ROLE_AGENT'
      and history -> -1 ->> 'messageId' = 'agent-message-one'
      and not (history -> -1 ? 'kind')
      and nexie_thread_id = '40000000-0000-4000-8000-000000000201'
   from public.a2a_tasks
   where id = (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one')),
  'authoritative replacement becomes output and preserves owner-bound Nexxi continuity'
);

insert into a2a_v1_test_state (key, value)
select 'input-required-one', public.nz_a2a_v1_append_event(
  '10000000-0000-4000-8000-000000000201',
  (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one'),
  (select (value ->> 'executionToken')::uuid from a2a_v1_test_state where key = 'claim-one'),
  '50000000-0000-4000-8000-000000000206',
  jsonb_build_object('statusUpdate', jsonb_build_object(
    'taskId', (select value ->> 'taskId' from a2a_v1_test_state where key = 'accept-one'),
    'contextId', 'buyer-context-1',
    'status', jsonb_build_object(
      'state', 'TASK_STATE_INPUT_REQUIRED',
      'timestamp', 'forged-time'
    )
  ))
);

select is(
  (select (value ->> 'sequence')::bigint from a2a_v1_test_state where key = 'input-required-one'),
  4::bigint,
  'interrupted status receives the next sequence'
);

select ok(
  (select state = 'TASK_STATE_INPUT_REQUIRED'
      and status ->> 'timestamp' <> 'forged-time'
      and execution_token is null
      and claimed_at is null
      and lease_expires_at is null
      and settled_at is not null
   from public.a2a_tasks
   where id = (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one')),
  'the database owns chronology and clears the worker lease at an interrupted state'
);

insert into a2a_v1_test_state (key, value)
select 'continue-one', public.nz_a2a_v1_accept_message(
  '10000000-0000-4000-8000-000000000201',
  '20000000-0000-4000-8000-000000000201',
  'message-two',
  repeat('4', 64),
  '{"messageId":"message-two","role":"ROLE_USER","parts":[{"text":"Use the second cleaner."}]}'::jsonb,
  (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one'),
  'buyer-context-1',
  '{}'::jsonb
);

select ok(
  (select value ->> 'outcome' from a2a_v1_test_state where key = 'continue-one') = 'created'
  and
  (select value ->> 'taskId' from a2a_v1_test_state where key = 'continue-one')
    = (select value ->> 'taskId' from a2a_v1_test_state where key = 'accept-one'),
  'input-required tasks accept a new turn without changing task identity'
);

select ok(
  (select state = 'TASK_STATE_SUBMITTED'
      and settled_at is null
      and history -> -1 ->> 'role' = 'ROLE_USER'
      and history -> -1 ->> 'messageId' = 'message-two'
   from public.a2a_tasks
   where id = (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one')),
  'continuation returns the task to submitted and appends the v1 user message'
);

insert into a2a_v1_test_state (key, value)
select 'claim-two', public.nz_a2a_v1_claim_task(
  '10000000-0000-4000-8000-000000000201',
  (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one')
);

select is(
  (select (value ->> 'sequence')::bigint from a2a_v1_test_state where key = 'claim-two'),
  5::bigint,
  'continued task resumes the same monotonic event sequence'
);

insert into a2a_v1_test_state (key, value)
select 'cancel-one', public.nz_a2a_v1_cancel_task(
  '10000000-0000-4000-8000-000000000201',
  (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one'),
  '{"reason":"buyer-request"}'::jsonb
);

select ok(
  (select value ->> 'outcome' from a2a_v1_test_state where key = 'cancel-one') = 'canceled'
  and
  (select (value ->> 'sequence')::bigint from a2a_v1_test_state where key = 'cancel-one') = 6,
  'CancelTask atomically settles the task and advances its stream'
);

select ok(
  (select state = 'TASK_STATE_CANCELED'
      and execution_token is null
      and settled_at is not null
      and last_event_sequence = 6
   from public.a2a_tasks
   where id = (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one')),
  'cancellation invalidates the worker lease'
);

select is(
  public.nz_a2a_v1_cancel_task(
    '10000000-0000-4000-8000-000000000201',
    (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one')
  ) ->> 'outcome',
  'already_canceled',
  'cancellation retries are idempotent'
);

select is(
  public.nz_a2a_v1_accept_message(
    '10000000-0000-4000-8000-000000000201',
    '20000000-0000-4000-8000-000000000201',
    'message-three',
    repeat('5', 64),
    '{"messageId":"message-three","role":"ROLE_USER","parts":[{"text":"Continue anyway."}]}'::jsonb,
    (select (value ->> 'taskId')::uuid from a2a_v1_test_state where key = 'accept-one')
  ) ->> 'outcome',
  'task_terminal',
  'canceled tasks cannot be resumed'
);

select * from finish();
rollback;
