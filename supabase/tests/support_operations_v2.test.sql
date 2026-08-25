begin;
set local search_path = public, extensions;

select plan(28);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.support_ticket_messages'::regclass),
  'support conversations keep row level security enabled'
);

select ok(
  has_column_privilege('authenticated', 'public.support_ticket_messages', 'body', 'select')
    and not has_column_privilege('authenticated', 'public.support_ticket_messages', 'provider_message_id', 'select')
    and not has_column_privilege('authenticated', 'public.support_ticket_messages', 'delivery_error', 'select'),
  'requesters can read conversation content without provider diagnostics'
);

select ok(
  has_column_privilege('authenticated', 'public.support_ticket_messages', 'ticket_id', 'insert')
    and has_column_privilege('authenticated', 'public.support_ticket_messages', 'body', 'insert')
    and has_column_privilege('authenticated', 'public.support_ticket_messages', 'client_message_id', 'insert')
    and not has_column_privilege('authenticated', 'public.support_ticket_messages', 'author_type', 'insert')
    and not has_column_privilege('authenticated', 'public.support_ticket_messages', 'delivery_status', 'insert'),
  'requesters can append content without forging authorship or delivery state'
);

select ok(
  not has_table_privilege('authenticated', 'public.support_ticket_messages', 'update')
    and not has_table_privilege('authenticated', 'public.support_ticket_messages', 'delete'),
  'requesters cannot rewrite or delete support conversation evidence'
);

select ok(
  has_table_privilege('service_role', 'public.support_ticket_messages', 'select')
    and has_table_privilege('service_role', 'public.support_ticket_messages', 'insert')
    and not has_table_privilege('service_role', 'public.support_ticket_messages', 'update')
    and not has_table_privilege('service_role', 'public.support_ticket_messages', 'delete'),
  'the trusted server can append and read replies without directly changing delivery evidence'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.complete_support_reply(uuid,uuid,boolean,text,text)',
    'execute'
  )
    and not has_function_privilege(
      'authenticated',
      'public.complete_support_reply(uuid,uuid,boolean,text,text)',
      'execute'
    ),
  'only the trusted server can complete operator reply delivery'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.assign_support_ticket(uuid,uuid,uuid)',
    'execute'
  )
    and not has_function_privilege(
      'authenticated',
      'public.assign_support_ticket(uuid,uuid,uuid)',
      'execute'
    ),
  'only the trusted server can assign support requests'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.nz_sync_support_requester_message()',
    'execute'
  )
    and not has_function_privilege(
      'service_role',
      'private.nz_sync_support_requester_message()',
      'execute'
    ),
  'the requester synchronization trigger is not a callable API'
);

insert into auth.users (id, email)
values
  ('e0000000-0000-4000-8000-000000000001', 'requester@nexez.ai'),
  ('e0000000-0000-4000-8000-000000000002', 'stranger@nexez.ai'),
  ('e0000000-0000-4000-8000-000000000003', 'operator@nexez.ai'),
  ('e0000000-0000-4000-8000-000000000004', 'assignee@nexez.ai'),
  ('e0000000-0000-4000-8000-000000000005', 'non-admin@nexez.ai');

insert into public.platform_admins (user_id)
values
  ('e0000000-0000-4000-8000-000000000003'),
  ('e0000000-0000-4000-8000-000000000004');

insert into public.support_tickets (
  id,
  owner_id,
  page_name,
  subject,
  category,
  priority,
  status,
  query,
  metadata
) values (
  'e1000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000001',
  'Workspace',
  'Checkout incident',
  'transaction',
  'urgent',
  'waiting_on_user',
  'Checkout is returning an unexpected error.',
  '{"user_email":"requester@nexez.ai"}'::jsonb
), (
  'e1000000-0000-4000-8000-000000000002',
  'e0000000-0000-4000-8000-000000000001',
  'Workspace',
  'Closed request',
  'general',
  'normal',
  'closed',
  'This request is closed.',
  '{"user_email":"requester@nexez.ai"}'::jsonb
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    insert into public.support_ticket_messages (
      ticket_id,
      body,
      client_message_id
    ) values (
      'e1000000-0000-4000-8000-000000000001',
      'The issue still happens after signing in again.',
      'e2000000-0000-4000-8000-000000000001'
    )
  $$,
  'a requester can append a message to their own active request'
);

reset role;

select is(
  (
    select status
    from public.support_tickets
    where id = 'e1000000-0000-4000-8000-000000000001'
  ),
  'open',
  'a requester reply returns a waiting request to the open queue'
);

select ok(
  (
    select last_requester_message_at is not null
    from public.support_tickets
    where id = 'e1000000-0000-4000-8000-000000000001'
  ),
  'a requester reply records its operational timestamp'
);

select is(
  (
    select event_type || ':' || from_status || ':' || to_status
    from public.support_ticket_events
    where ticket_id = 'e1000000-0000-4000-8000-000000000001'
      and event_type = 'requester_replied'
  ),
  'requester_replied:waiting_on_user:open',
  'a requester reply appends exact workflow evidence'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select is(
  (
    select count(*)::integer
    from public.support_ticket_messages
    where ticket_id = 'e1000000-0000-4000-8000-000000000001'
  ),
  0,
  'another requester cannot read the conversation'
);

select throws_ok(
  $$
    insert into public.support_ticket_messages (
      ticket_id,
      body,
      client_message_id
    ) values (
      'e1000000-0000-4000-8000-000000000001',
      'Attempted cross-account reply.',
      'e2000000-0000-4000-8000-000000000002'
    )
  $$,
  '42501',
  null,
  'another requester cannot append to the conversation'
);

reset role;

set local role service_role;

select throws_ok(
  $$
    select public.transition_support_ticket(
      'e1000000-0000-4000-8000-000000000001',
      'e0000000-0000-4000-8000-000000000003',
      'waiting_on_user',
      null
    )
  $$,
  '22023',
  'waiting status requires an accepted support reply',
  'an operator cannot manually claim that a request is waiting on the requester'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    insert into public.support_ticket_messages (
      ticket_id,
      body,
      client_message_id
    ) values (
      'e1000000-0000-4000-8000-000000000002',
      'Attempted reply to a closed request.',
      'e2000000-0000-4000-8000-000000000003'
    )
  $$,
  '42501',
  null,
  'closed requests reject requester replies'
);

reset role;
set local role service_role;

insert into public.support_ticket_messages (
  id,
  ticket_id,
  author_type,
  author_id,
  body,
  channel,
  delivery_status,
  idempotency_key
) values (
  'e3000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'operator',
  'e0000000-0000-4000-8000-000000000003',
  'We are reviewing the checkout path now.',
  'email',
  'pending',
  'support-reply/e3000000-0000-4000-8000-000000000001'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select is(
  (
    select count(*)::integer
    from public.support_ticket_messages
    where id = 'e3000000-0000-4000-8000-000000000001'
  ),
  0,
  'requesters cannot see pending operator drafts'
);

reset role;
set local role service_role;

select lives_ok(
  $$
    select public.complete_support_reply(
      'e3000000-0000-4000-8000-000000000001',
      'e0000000-0000-4000-8000-000000000003',
      false,
      null,
      'provider unavailable'
    )
  $$,
  'a provider rejection records a failed operator reply'
);

reset role;

select is(
  (
    select delivery_status || ':' || delivery_error
    from public.support_ticket_messages
    where id = 'e3000000-0000-4000-8000-000000000001'
  ),
  'failed:provider unavailable',
  'a rejected reply keeps exact failure evidence'
);

select is(
  (
    select status || ':' || coalesce(first_responded_at::text, 'none')
    from public.support_tickets
    where id = 'e1000000-0000-4000-8000-000000000001'
  ),
  'open:none',
  'a rejected reply does not claim a response or move the workflow'
);

set local role service_role;

select lives_ok(
  $$
    select public.complete_support_reply(
      'e3000000-0000-4000-8000-000000000001',
      'e0000000-0000-4000-8000-000000000003',
      true,
      'resend-message-1',
      null
    )
  $$,
  'a retried reply can complete after provider acceptance'
);

reset role;

select is(
  (
    select delivery_status || ':' || provider_message_id
    from public.support_ticket_messages
    where id = 'e3000000-0000-4000-8000-000000000001'
  ),
  'sent:resend-message-1',
  'an accepted reply stores provider evidence'
);

select ok(
  (
    select status = 'waiting_on_user'
      and first_responded_at is not null
      and last_operator_message_at is not null
    from public.support_tickets
    where id = 'e1000000-0000-4000-8000-000000000001'
  ),
  'provider acceptance records first response and waits on the requester'
);

select throws_ok(
  $$
    update public.support_ticket_messages
    set body = 'Rewritten operator reply.'
    where id = 'e3000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'support message content is immutable',
  'even privileged callers cannot rewrite conversation content'
);

set local role service_role;

select lives_ok(
  $$
    select public.assign_support_ticket(
      'e1000000-0000-4000-8000-000000000001',
      'e0000000-0000-4000-8000-000000000003',
      'e0000000-0000-4000-8000-000000000004'
    )
  $$,
  'an operator can assign a request to another platform admin'
);

reset role;

select is(
  (
    select assigned_to::text
    from public.support_tickets
    where id = 'e1000000-0000-4000-8000-000000000001'
  ),
  'e0000000-0000-4000-8000-000000000004',
  'assignment writes the exact operator identity'
);

set local role service_role;

select throws_ok(
  $$
    select public.assign_support_ticket(
      'e1000000-0000-4000-8000-000000000001',
      'e0000000-0000-4000-8000-000000000003',
      'e0000000-0000-4000-8000-000000000005'
    )
  $$,
  '22023',
  'assignee must be a platform admin',
  'assignment rejects a non-admin assignee'
);

select throws_ok(
  $$
    select public.complete_support_reply(
      'e3000000-0000-4000-8000-000000000001',
      'e0000000-0000-4000-8000-000000000005',
      true,
      'forged-provider-message',
      null
    )
  $$,
  '42501',
  'platform-admin access required',
  'a non-admin cannot complete reply delivery'
);

select * from finish();
rollback;
