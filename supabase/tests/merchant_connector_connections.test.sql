begin;
set local search_path = public, extensions;

select plan(10);

select ok(
  to_regclass('public.merchant_connector_connections') is not null,
  'merchant connector connection table exists'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.merchant_connector_connections'::regclass),
  'merchant connector credentials keep row level security enabled'
);

select ok(
  not has_table_privilege('anon', 'public.merchant_connector_connections', 'select')
    and not has_table_privilege('anon', 'public.merchant_connector_connections', 'insert')
    and not has_table_privilege('anon', 'public.merchant_connector_connections', 'update')
    and not has_table_privilege('anon', 'public.merchant_connector_connections', 'delete'),
  'anonymous clients have no connector credential access'
);

select ok(
  not has_table_privilege('authenticated', 'public.merchant_connector_connections', 'select')
    and not has_table_privilege('authenticated', 'public.merchant_connector_connections', 'insert')
    and not has_table_privilege('authenticated', 'public.merchant_connector_connections', 'update')
    and not has_table_privilege('authenticated', 'public.merchant_connector_connections', 'delete'),
  'authenticated browser clients have no connector credential access'
);

select ok(
  has_table_privilege('service_role', 'public.merchant_connector_connections', 'select')
    and has_table_privilege('service_role', 'public.merchant_connector_connections', 'insert')
    and has_table_privilege('service_role', 'public.merchant_connector_connections', 'update')
    and has_table_privilege('service_role', 'public.merchant_connector_connections', 'delete'),
  'trusted server routes can manage encrypted connector credentials'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.merchant_connector_connections'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (page_id, provider)'
  ),
  'one provider connection is stored per listing'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'merchant_connector_connections'
      and indexname = 'merchant_connector_connections_owner_idx'
      and indexdef like '%(owner_id)%'
  ),
  'owner connection lookups are indexed'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.merchant_connector_connections'::regclass
      and conname = 'merchant_connector_provider_check'
      and pg_get_constraintdef(oid) like '%square%'
      and pg_get_constraintdef(oid) like '%google_calendar%'
      and pg_get_constraintdef(oid) like '%woocommerce%'
      and pg_get_constraintdef(oid) like '%servicem8%'
  ),
  'provider values are limited to the managed connector manifest'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.merchant_connector_connections'::regclass
      and conname = 'merchant_connector_status_check'
      and pg_get_constraintdef(oid) like '%connected%'
      and pg_get_constraintdef(oid) like '%attention%'
      and pg_get_constraintdef(oid) like '%revoked%'
  ),
  'connection status values are constrained'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'merchant_connector_connections'
  ),
  0::bigint,
  'no browser-facing policy can expose encrypted credentials'
);

select * from finish();
rollback;
