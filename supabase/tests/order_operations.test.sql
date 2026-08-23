begin;
set local search_path = public, extensions;

select plan(17);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.checkout_order_fulfillments'::regclass),
  'fulfillment keeps row level security enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.checkout_order_events'::regclass),
  'activity keeps row level security enabled'
);
select ok(
  not has_table_privilege('anon', 'public.checkout_order_fulfillments', 'select')
    and not has_table_privilege('anon', 'public.checkout_order_events', 'select'),
  'anonymous callers cannot read operational order evidence'
);
select ok(
  has_table_privilege('authenticated', 'public.checkout_order_fulfillments', 'select')
    and not has_table_privilege('authenticated', 'public.checkout_order_fulfillments', 'insert')
    and not has_table_privilege('authenticated', 'public.checkout_order_fulfillments', 'update')
    and not has_table_privilege('authenticated', 'public.checkout_order_fulfillments', 'delete'),
  'authenticated owners receive read-only fulfillment access'
);
select ok(
  has_table_privilege('service_role', 'public.checkout_order_events', 'select')
    and has_table_privilege('service_role', 'public.checkout_order_events', 'insert')
    and not has_table_privilege('service_role', 'public.checkout_order_events', 'update')
    and not has_table_privilege('service_role', 'public.checkout_order_events', 'delete'),
  'service writers can append but cannot rewrite activity'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.transition_checkout_order_fulfillment(uuid,uuid,text,uuid)',
    'execute'
  ),
  'browser roles cannot invoke the fulfillment transition directly'
);

insert into auth.users (id)
values
  ('f0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000002');

insert into public.checkout_orders (
  id, owner_id, stripe_session_id, stripe_payment_intent_id, amount_cents, currency,
  status, channel, stripe_livemode
) values
  (
    'f1000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001',
    'cs_order_operations_owner_1',
    'pi_order_operations_owner_1',
    5000,
    'usd',
    'paid',
    'agent_checkout',
    false
  ),
  (
    'f1000000-0000-4000-8000-000000000002',
    'f0000000-0000-4000-8000-000000000002',
    'cs_order_operations_owner_2',
    'pi_order_operations_owner_2',
    7500,
    'usd',
    'paid',
    'agent_checkout',
    false
  );

select is(
  (select status from public.checkout_order_fulfillments where order_id = 'f1000000-0000-4000-8000-000000000001'),
  'not_started',
  'new paid checkout orders start with explicit unfulfilled state'
);
select is(
  (select count(*) from public.checkout_order_events where order_id = 'f1000000-0000-4000-8000-000000000001'),
  3::bigint,
  'new checkout records order, payment, and initial operational evidence'
);
select is(
  (
    select source
    from public.checkout_order_events
    where order_id = 'f1000000-0000-4000-8000-000000000001'
      and event_type = 'fulfillment_updated'
  ),
  'system',
  'the automatic initial fulfillment event is attributed to the system'
);

select lives_ok(
  $$
    select public.transition_checkout_order_fulfillment(
      'f1000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000001',
      'in_progress',
      'f0000000-0000-4000-8000-000000000001'
    )
  $$,
  'the trusted writer can record a valid owner-bound transition'
);
select is(
  (
    select status || ':' || version::text
    from public.checkout_order_fulfillments
    where order_id = 'f1000000-0000-4000-8000-000000000001'
  ),
  'in_progress:2',
  'fulfillment status and monotonic version advance atomically'
);
select is(
  (
    select metadata ->> 'toStatus'
    from public.checkout_order_events
    where order_id = 'f1000000-0000-4000-8000-000000000001'
      and idempotency_key = 'fulfillment:2'
  ),
  'in_progress',
  'the transition appends its exact durable activity evidence'
);
select throws_ok(
  $$
    select public.transition_checkout_order_fulfillment(
      'f1000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000002',
      'fulfilled',
      'f0000000-0000-4000-8000-000000000002'
    )
  $$,
  'P0002',
  'checkout order not found',
  'the transition cannot cross owner boundaries'
);
select throws_ok(
  $$
    update public.checkout_order_events
    set metadata = '{"rewritten":true}'::jsonb
    where order_id = 'f1000000-0000-4000-8000-000000000001'
  $$,
  '55000',
  'checkout order events are append-only',
  'even the database owner cannot rewrite recorded activity'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select is(
  (select count(*) from public.checkout_order_fulfillments),
  1::bigint,
  'an authenticated merchant sees only their own fulfillment row'
);
select is(
  (select count(*) from public.checkout_order_events),
  4::bigint,
  'an authenticated merchant sees only their own append-only activity'
);

reset role;
update public.checkout_orders
set status = 'refunded', updated_at = now()
where id = 'f1000000-0000-4000-8000-000000000001';
select throws_ok(
  $$
    select public.transition_checkout_order_fulfillment(
      'f1000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000001',
      'fulfilled',
      'f0000000-0000-4000-8000-000000000001'
    )
  $$,
  '23514',
  'payment state does not allow fulfillment updates',
  'terminal refund state blocks new fulfillment claims'
);

select * from finish();
rollback;
