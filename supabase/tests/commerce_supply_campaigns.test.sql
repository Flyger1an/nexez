begin;

select plan(18);

select ok(
  to_regclass('public.commerce_supply_campaigns') is not null,
  'commerce supply campaign table exists'
);

select ok(
  to_regclass('public.commerce_supply_campaign_events') is not null,
  'commerce supply campaign event ledger exists'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.commerce_supply_campaigns'::regclass),
  'campaign row level security is enabled'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.commerce_supply_campaign_events'::regclass),
  'event row level security is enabled'
);

select ok(
  not has_table_privilege('anon', 'public.commerce_supply_campaigns', 'select'),
  'anonymous clients cannot read campaigns'
);

select ok(
  not has_table_privilege('authenticated', 'public.commerce_supply_campaigns', 'select'),
  'authenticated clients cannot read campaigns'
);

select ok(
  has_table_privilege('service_role', 'public.commerce_supply_campaigns', 'select'),
  'service role can read campaigns server-side'
);

select ok(
  not has_table_privilege('service_role', 'public.commerce_supply_campaigns', 'insert'),
  'service role cannot bypass the campaign function with inserts'
);

select ok(
  has_table_privilege('service_role', 'public.commerce_supply_campaign_events', 'select'),
  'service role can read campaign audit events'
);

select ok(
  not has_table_privilege('service_role', 'public.commerce_supply_campaign_events', 'update'),
  'service role cannot rewrite campaign audit events'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.nz_apply_commerce_supply_campaign(text,text,text,text,uuid,uuid,integer,integer,integer,integer,integer)',
    'execute'
  ),
  'authenticated clients cannot execute campaign mutations'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.nz_apply_commerce_supply_campaign(text,text,text,text,uuid,uuid,integer,integer,integer,integer,integer)',
    'execute'
  ),
  'service role can execute the bounded campaign mutation'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'a1111111-1111-4111-8111-111111111111',
  'authenticated',
  'authenticated',
  'commerce-supply-workflow@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.platform_admins (user_id, note)
values ('a1111111-1111-4111-8111-111111111111', 'Commerce supply test');

select lives_ok(
  $$
    select public.nz_apply_commerce_supply_campaign(
      'events.private-chef',
      'events-hospitality',
      'sourcing',
      'Recruit two qualified operators',
      'a1111111-1111-4111-8111-111111111111',
      'b2222222-2222-4222-8222-222222222222',
      4, 0, 1, 3, 4
    )
  $$,
  'valid campaign transition succeeds'
);

select is(
  (
    select status
    from public.nz_apply_commerce_supply_campaign(
      'events.private-chef',
      'events-hospitality',
      'sourcing',
      'Recruit two qualified operators',
      'a1111111-1111-4111-8111-111111111111',
      'b2222222-2222-4222-8222-222222222222',
      4, 0, 1, 3, 4
    )
  ),
  'sourcing',
  'identical idempotent replay returns the campaign'
);

select is(
  (
    select count(*)::integer
    from public.commerce_supply_campaign_events
    where idempotency_key = 'b2222222-2222-4222-8222-222222222222'
  ),
  1,
  'idempotent replay appends only one audit event'
);

select throws_ok(
  $$
    select public.nz_apply_commerce_supply_campaign(
      'events.private-chef', 'events-hospitality', 'contacted', 'Different request',
      'a1111111-1111-4111-8111-111111111111', 'b2222222-2222-4222-8222-222222222222',
      4, 0, 1, 3, 4
    )
  $$,
  '23505',
  null,
  'idempotency key cannot be rebound'
);

select throws_ok(
  $$
    select public.nz_apply_commerce_supply_campaign(
      'events.private-chef', 'events-hospitality', 'onboarding', 'Skip required outreach state',
      'a1111111-1111-4111-8111-111111111111', 'c3333333-3333-4333-8333-333333333333',
      4, 0, 1, 3, 4
    )
  $$,
  '22023',
  null,
  'invalid lifecycle transition is rejected'
);

select throws_ok(
  $$
    select public.nz_apply_commerce_supply_campaign(
      'events.private-chef', 'events-hospitality', 'contacted', 'Counts do not reconcile',
      'a1111111-1111-4111-8111-111111111111', 'd4444444-4444-4444-8444-444444444444',
      4, 0, 1, 2, 4
    )
  $$,
  '22023',
  null,
  'inconsistent evidence counts are rejected'
);

select * from finish();

rollback;
