begin;
set local search_path = public, extensions;

select plan(18);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.support_ticket_events'::regclass),
  'support activity keeps row level security enabled'
);

select ok(
  not has_table_privilege('authenticated', 'public.support_tickets', 'update'),
  'requesters cannot change operator-controlled support workflow state'
);

select ok(
  has_column_privilege('authenticated', 'public.support_tickets', 'owner_id', 'insert')
    and not has_column_privilege('authenticated', 'public.support_tickets', 'notification_status', 'insert')
    and not has_column_privilege('authenticated', 'public.support_tickets', 'resolved_at', 'insert'),
  'requesters can submit ticket fields without fabricating delivery or resolution state'
);

select ok(
  not has_table_privilege('authenticated', 'public.support_ticket_events', 'select')
    and not has_table_privilege('authenticated', 'public.support_ticket_events', 'insert')
    and not has_table_privilege('authenticated', 'public.support_ticket_events', 'update')
    and not has_table_privilege('authenticated', 'public.support_ticket_events', 'delete'),
  'operator activity is not exposed to merchant browser roles'
);

select ok(
  has_table_privilege('service_role', 'public.support_ticket_events', 'select')
    and has_table_privilege('service_role', 'public.support_ticket_events', 'insert')
    and not has_table_privilege('service_role', 'public.support_ticket_events', 'update')
    and not has_table_privilege('service_role', 'public.support_ticket_events', 'delete'),
  'trusted operators can append and read support activity without rewriting it'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.transition_support_ticket(uuid,uuid,text,text)',
    'execute'
  )
    and not has_function_privilege(
      'authenticated',
      'public.transition_support_ticket(uuid,uuid,text,text)',
      'execute'
    ),
  'only the trusted server role can invoke the atomic support transition'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.platform_admin_grant_events'::regclass),
  'admin access history keeps row level security enabled'
);

select ok(
  not has_table_privilege('authenticated', 'public.platform_admin_grant_events', 'select')
    and not has_table_privilege('authenticated', 'public.platform_admin_grant_events', 'insert')
    and not has_table_privilege('authenticated', 'public.platform_admin_grant_events', 'update')
    and not has_table_privilege('authenticated', 'public.platform_admin_grant_events', 'delete')
    and has_table_privilege('service_role', 'public.platform_admin_grant_events', 'select')
    and has_table_privilege('service_role', 'public.platform_admin_grant_events', 'insert')
    and not has_table_privilege('service_role', 'public.platform_admin_grant_events', 'update')
    and not has_table_privilege('service_role', 'public.platform_admin_grant_events', 'delete'),
  'only the trusted server can append and read admin grant evidence'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.grant_platform_admin_by_email(uuid,text,text)',
    'execute'
  )
    and not has_function_privilege(
      'authenticated',
      'public.grant_platform_admin_by_email(uuid,text,text)',
      'execute'
    ),
  'only the trusted server role can invoke an admin access grant'
);

insert into auth.users (id, email)
values
  ('d0000000-0000-4000-8000-000000000001', 'current-admin@nexez.ai'),
  ('d0000000-0000-4000-8000-000000000002', 'new-admin@nexez.ai');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    insert into public.support_tickets (
      owner_id, page_name, subject, category, priority, query, metadata
    ) values (
      'd0000000-0000-4000-8000-000000000001',
      'Workspace',
      'Checkout incident',
      'transaction',
      'urgent',
      'Checkout is returning an unexpected error.',
      '{"user_email":"owner@example.com"}'::jsonb
    )
  $$,
  'an authenticated requester can submit an owned support ticket'
);

select throws_ok(
  $$
    update public.support_tickets
    set status = 'resolved'
    where owner_id = 'd0000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'a requester cannot mark their own ticket resolved'
);

select throws_ok(
  $$
    insert into public.support_tickets (
      owner_id, page_name, subject, category, priority, query, notification_status
    ) values (
      'd0000000-0000-4000-8000-000000000001',
      'Workspace',
      'Fabricated delivery',
      'general',
      'normal',
      'This insert must not claim inbox delivery.',
      'sent'
    )
  $$,
  '42501',
  null,
  'a requester cannot fabricate inbox-delivery evidence'
);

reset role;

insert into public.platform_admins (user_id)
values ('d0000000-0000-4000-8000-000000000001');

set local role service_role;

select lives_ok(
  $$
    select public.transition_support_ticket(
      (select id from public.support_tickets where owner_id = 'd0000000-0000-4000-8000-000000000001'),
      'd0000000-0000-4000-8000-000000000001',
      'in_review',
      'Reproducing the checkout issue.'
    )
  $$,
  'the trusted server can atomically advance a request and its history'
);

select is(
  (
    select event_type || ':' || from_status || ':' || to_status || ':' || note
    from public.support_ticket_events
    where ticket_id = (
      select id from public.support_tickets where owner_id = 'd0000000-0000-4000-8000-000000000001'
    )
  ),
  'status_changed:open:in_review:Reproducing the checkout issue.',
  'the atomic transition writes exact operator evidence'
);

reset role;

select is(
  (
    select notification_status || ':' || status
    from public.support_tickets
    where owner_id = 'd0000000-0000-4000-8000-000000000001'
  ),
  'pending:in_review',
  'database defaults preserve honest initial delivery and workflow state'
);

set local role service_role;

select lives_ok(
  $$
    select public.grant_platform_admin_by_email(
      'd0000000-0000-4000-8000-000000000001',
      'NEW-ADMIN@NEXEZ.AI',
      'Support lead'
    )
  $$,
  'a current admin can grant access to an existing Nexez account'
);

reset role;

select ok(
  exists (
    select 1
    from public.platform_admins
    where user_id = 'd0000000-0000-4000-8000-000000000002'
      and note = 'Support lead'
  ),
  'the grant creates exact platform-admin membership'
);

select is(
  (
    select actor_id::text || ':' || target_user_id::text || ':' || target_email || ':' || note
    from public.platform_admin_grant_events
    where target_user_id = 'd0000000-0000-4000-8000-000000000002'
  ),
  'd0000000-0000-4000-8000-000000000001:d0000000-0000-4000-8000-000000000002:new-admin@nexez.ai:Support lead',
  'the access grant writes exact, normalized audit evidence'
);

select * from finish();
rollback;
