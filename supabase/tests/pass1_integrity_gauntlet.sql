begin;

select plan(30);

insert into auth.users (id)
values ('10000000-0000-0000-0000-000000000001');

insert into public.pages (id, owner_id, name, slug, currency)
values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Pass 1 QA',
  'pass-1-qa',
  'usd'
);

select ok(
  public.nz_create_negotiation_with_buyer_turn(
    jsonb_build_object(
      'id', '30000000-0000-0000-0000-000000000001',
      'page_id', '20000000-0000-0000-0000-000000000001',
      'owner_id', '10000000-0000-0000-0000-000000000001',
      'slug', 'pass-1-qa',
      'offer_key', 'qa-offer',
      'offer_name', 'QA Offer',
      'offer_kind', 'services',
      'currency', 'usd',
      'decision_requested_at', clock_timestamp()
    ),
    jsonb_build_object(
      'role', 'buyer',
      'content', jsonb_build_object('message', 'First buyer turn')
    )
  ) ->> 'status' = 'negotiation',
  'fresh negotiation RPC returns the created negotiation'
);

select is(
  (select count(*) from public.agent_negotiations where id = '30000000-0000-0000-0000-000000000001'),
  1::bigint,
  'fresh negotiation RPC writes one negotiation'
);

select is(
  (select count(*) from public.negotiation_messages where negotiation_id = '30000000-0000-0000-0000-000000000001'),
  1::bigint,
  'fresh negotiation RPC writes the first buyer message in the same transaction'
);

select ok(
  (select decision_pending from public.agent_negotiations where id = '30000000-0000-0000-0000-000000000001'),
  'fresh negotiation is queued for a decision'
);

select throws_ok(
  $$
    select public.nz_create_negotiation_with_buyer_turn(
      jsonb_build_object(
        'id', '30000000-0000-0000-0000-000000000002',
        'page_id', '20000000-0000-0000-0000-000000000001',
        'owner_id', '10000000-0000-0000-0000-000000000001',
        'slug', 'pass-1-qa',
        'offer_key', 'qa-offer',
        'offer_name', 'QA Offer',
        'offer_kind', 'services'
      ),
      jsonb_build_object('role', 'seller_llm', 'content', '{}'::jsonb)
    )
  $$,
  '23514',
  null,
  'fresh negotiation rejects a non-buyer first turn'
);

select is(
  (select count(*) from public.agent_negotiations where id = '30000000-0000-0000-0000-000000000002'),
  0::bigint,
  'failed fresh negotiation leaves no orphan row'
);

select ok(
  public.nz_apply_owner_decision(
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    0,
    jsonb_build_object(
      'action', 'counter',
      'message', 'Counter at 125',
      'counter', jsonb_build_object('amountMinor', 12500, 'currency', 'usd')
    ),
    12500,
    null,
    clock_timestamp()
  ) ->> 'applied' = 'true',
  'owner decision RPC applies a canonical counter'
);

select is(
  (select decision_seq from public.agent_negotiations where id = '30000000-0000-0000-0000-000000000001'),
  1,
  'owner decision increments the sequence'
);

select is(
  (select amount_cents from public.agent_negotiations where id = '30000000-0000-0000-0000-000000000001'),
  12500,
  'owner decision persists integer minor units'
);

select is(
  (select count(*) from public.negotiation_messages where negotiation_id = '30000000-0000-0000-0000-000000000001' and role = 'seller_owner' and decision_seq = 1),
  1::bigint,
  'owner decision appends exactly one sequenced seller message'
);

select throws_ok(
  $$
    select public.nz_apply_owner_decision(
      '30000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      0,
      jsonb_build_object('action', 'reject', 'message', 'stale'),
      null,
      null,
      clock_timestamp()
    )
  $$,
  '40001',
  null,
  'stale owner decision is rejected'
);

select is(
  (select count(*) from public.negotiation_messages where negotiation_id = '30000000-0000-0000-0000-000000000001'),
  2::bigint,
  'stale owner decision appends no message'
);

select ok(
  public.nz_queue_negotiation_buyer_turn(
    '30000000-0000-0000-0000-000000000001',
    jsonb_build_object('message', 'Buyer follows up'),
    null,
    null,
    clock_timestamp()
  ) ->> 'decision_pending' = 'true',
  'buyer continuation queues the decision atomically'
);

select is(
  (select count(*) from public.negotiation_messages where negotiation_id = '30000000-0000-0000-0000-000000000001' and role = 'buyer'),
  2::bigint,
  'buyer continuation appends exactly one buyer message'
);

select ok(
  public.nz_persist_automated_negotiation_decision(
    '30000000-0000-0000-0000-000000000001',
    1,
    'negotiation',
    jsonb_build_object('message', 'Automated counter'),
    jsonb_build_object('action', 'counter', 'amountMinor', 13000),
    jsonb_build_object('passed', true),
    13000,
    null,
    clock_timestamp()
  ) ->> 'applied' = 'true',
  'automated decision persists message and state together'
);

select is(
  (select decision_seq from public.agent_negotiations where id = '30000000-0000-0000-0000-000000000001'),
  2,
  'automated decision advances the same sequence'
);

select ok(
  not (public.nz_persist_automated_negotiation_decision(
    '30000000-0000-0000-0000-000000000001',
    1,
    'negotiation',
    jsonb_build_object('message', 'Stale automated counter'),
    jsonb_build_object('action', 'counter', 'amountMinor', 14000),
    '{}'::jsonb,
    14000,
    null,
    clock_timestamp()
  ) ->> 'applied')::boolean,
  'stale automated worker loses cleanly'
);

select is(
  (select count(*) from public.negotiation_messages where negotiation_id = '30000000-0000-0000-0000-000000000001' and decision_seq = 2),
  1::bigint,
  'stale automated worker appends no duplicate message'
);

select throws_ok(
  $$
    insert into public.negotiation_messages (negotiation_id, role, content, decision_seq)
    values (
      '30000000-0000-0000-0000-000000000001',
      'seller_llm',
      '{}'::jsonb,
      2
    )
  $$,
  '23505',
  null,
  'database rejects duplicate negotiation decision sequences'
);

select ok(
  public.nz_apply_owner_decision(
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    2,
    jsonb_build_object('action', 'pause', 'reasoning', 'Pause for QA'),
    null,
    null,
    clock_timestamp()
  ) ->> 'applied' = 'true',
  'active negotiation can be paused atomically'
);

select is(
  (select status from public.agent_negotiations where id = '30000000-0000-0000-0000-000000000001'),
  'paused',
  'pause persists the explicit paused state'
);

select throws_ok(
  $$
    select public.nz_apply_owner_decision(
      '30000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      3,
      jsonb_build_object(
        'action', 'counter',
        'reasoning', 'Cannot counter while paused',
        'counter', jsonb_build_object('priceCents', 15000)
      ),
      15000,
      null,
      clock_timestamp()
    )
  $$,
  '23514',
  null,
  'paused negotiation rejects non-resume decisions'
);

select is(
  (select count(*) from public.negotiation_messages where negotiation_id = '30000000-0000-0000-0000-000000000001' and decision_seq = 3),
  1::bigint,
  'rejected paused-state decision appends no message'
);

select ok(
  public.nz_apply_owner_decision(
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    3,
    jsonb_build_object('action', 'resume', 'reasoning', 'Resume after QA'),
    null,
    null,
    clock_timestamp()
  ) ->> 'applied' = 'true',
  'paused negotiation can be resumed atomically'
);

select ok(
  not has_table_privilege('anon', 'public.checkout_events', 'insert')
    and not has_table_privilege('authenticated', 'public.checkout_events', 'insert'),
  'checkout analytics ingestion is server-only'
);

select ok(
  not has_table_privilege('anon', 'public.agent_visits', 'insert')
    and not has_table_privilege('authenticated', 'public.agent_visits', 'insert'),
  'visit analytics ingestion is server-only'
);

select ok(
  not has_table_privilege('authenticated', 'public.agent_negotiations', 'update')
    and not has_table_privilege('authenticated', 'public.negotiation_messages', 'insert'),
  'authenticated clients cannot bypass the negotiation RPC contract'
);

select is(
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'nz_create_negotiation_with_buyer_turn',
        'nz_queue_negotiation_buyer_turn',
        'nz_persist_automated_negotiation_decision',
        'nz_apply_owner_decision'
      )
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('authenticated', p.oid, 'execute')
      and has_function_privilege('service_role', p.oid, 'execute')
      and not p.prosecdef
  ),
  4::bigint,
  'all atomic RPCs are service-only security-invoker functions'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'checkout_events'
      and indexdef ilike '%ingestion_key%'
  ) and exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'agent_visits'
      and indexdef ilike '%ingestion_key%'
  ),
  'analytics replay keys are uniquely indexed'
);

select ok(
  (select status = 'negotiation' and amount_cents = 13000 and decision_pending = false and decision_seq = 4
   from public.agent_negotiations
   where id = '30000000-0000-0000-0000-000000000001'),
  'final atomic state matches the authoritative message sequence'
);

select * from finish();

rollback;
