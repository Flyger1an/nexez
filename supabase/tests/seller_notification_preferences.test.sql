begin;
set local search_path = public, extensions;

select plan(16);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.seller_notification_preferences'::regclass),
  'seller notification preferences keep row level security enabled'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.seller_notification_preferences'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (user_id)'
  ),
  'user_id is the singleton primary key and policy lookup index'
);

select ok(
  has_table_privilege('authenticated', 'public.seller_notification_preferences', 'select')
    and has_table_privilege('authenticated', 'public.seller_notification_preferences', 'insert')
    and has_table_privilege('authenticated', 'public.seller_notification_preferences', 'update')
    and not has_table_privilege('authenticated', 'public.seller_notification_preferences', 'delete'),
  'authenticated sellers receive only the preferences privileges the clients use'
);

select ok(
  not has_table_privilege('anon', 'public.seller_notification_preferences', 'select')
    and not has_table_privilege('anon', 'public.seller_notification_preferences', 'insert')
    and not has_table_privilege('anon', 'public.seller_notification_preferences', 'update')
    and not has_table_privilege('anon', 'public.seller_notification_preferences', 'delete'),
  'anonymous callers have no preference access'
);

select ok(
  has_table_privilege('service_role', 'public.seller_notification_preferences', 'select')
    and not has_table_privilege('service_role', 'public.seller_notification_preferences', 'insert')
    and not has_table_privilege('service_role', 'public.seller_notification_preferences', 'update')
    and not has_table_privilege('service_role', 'public.seller_notification_preferences', 'delete'),
  'push fan-out receives service-role read access without mutation access'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'seller_notification_preferences'
      and 'authenticated' = any (roles)
  ),
  3::bigint,
  'the table has one owner-scoped policy for each granted operation'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.seller_notification_preferences'::regclass
      and tgname = 'trg_touch_seller_notification_preferences_updated_at'
      and not tgisinternal
  ),
  'the update timestamp trigger is installed'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.nz_touch_seller_notification_preferences_updated_at()',
    'execute'
  ),
  'browser roles cannot invoke the timestamp trigger function directly'
);

insert into auth.users (id)
values
  ('e0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    insert into public.seller_notification_preferences (user_id)
    values ('e0000000-0000-4000-8000-000000000001')
  $$,
  'a seller can create the singleton preference row for their own account'
);

select is(
  (
    select jsonb_build_object(
      'negotiations', negotiations_enabled,
      'integrations', integrations_enabled,
      'reviews', reviews_enabled,
      'marketing', marketing_enabled
    )
    from public.seller_notification_preferences
    where user_id = 'e0000000-0000-4000-8000-000000000001'
  ),
  '{"negotiations":true,"integrations":true,"reviews":true,"marketing":true}'::jsonb,
  'every optional category defaults on for an unconfigured seller'
);

select is(
  (select count(*) from public.seller_notification_preferences),
  1::bigint,
  'the seller can read only the owned row'
);

select throws_ok(
  $$
    insert into public.seller_notification_preferences (user_id)
    values ('e0000000-0000-4000-8000-000000000002')
  $$,
  '42501',
  null,
  'a seller cannot create preferences for another account'
);

select throws_ok(
  $$
    update public.seller_notification_preferences
    set user_id = 'e0000000-0000-4000-8000-000000000002'
    where user_id = 'e0000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'a seller cannot transfer a preference row to another account'
);

select lives_ok(
  $$
    update public.seller_notification_preferences
    set reviews_enabled = false
    where user_id = 'e0000000-0000-4000-8000-000000000001'
  $$,
  'a seller can update an optional category on the owned row'
);

select throws_ok(
  $$
    delete from public.seller_notification_preferences
    where user_id = 'e0000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'browser clients cannot delete the authority row'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.seller_notification_preferences),
  0::bigint,
  'a different seller cannot read the first seller preference row'
);

select * from finish();
rollback;
