begin;
set local search_path = public, extensions;

select plan(27);

select ok(
  has_table_privilege('service_role', 'public.shopify_installs', 'select')
    and has_table_privilege('service_role', 'public.shopify_installs', 'insert')
    and has_table_privilege('service_role', 'public.shopify_installs', 'update')
    and has_table_privilege('service_role', 'public.shopify_installs', 'delete'),
  'service role has the table privileges required by Shopify lifecycle code'
);
select ok(
  not has_table_privilege('authenticated', 'public.shopify_installs', 'select')
    and not has_table_privilege('authenticated', 'public.shopify_installs', 'insert')
    and not has_table_privilege('authenticated', 'public.shopify_installs', 'update')
    and not has_table_privilege('authenticated', 'public.shopify_installs', 'delete'),
  'authenticated callers cannot access the Shopify lifecycle table'
);
select ok(
  not has_table_privilege('anon', 'public.shopify_installs', 'select')
    and not has_table_privilege('anon', 'public.shopify_installs', 'insert')
    and not has_table_privilege('anon', 'public.shopify_installs', 'update')
    and not has_table_privilege('anon', 'public.shopify_installs', 'delete'),
  'anonymous callers cannot access the Shopify lifecycle table'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.nz_begin_shopify_mapping_change(text,uuid,text,uuid,uuid,timestamptz)',
    'execute'
  ),
  'service role can begin a Shopify mapping change'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.nz_begin_shopify_mapping_change(text,uuid,text,uuid,uuid,timestamptz)',
    'execute'
  ),
  'authenticated callers cannot begin a Shopify mapping change'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.nz_commit_shopify_catalog_sync(text,uuid,uuid,bigint,timestamptz,jsonb,jsonb,timestamptz,boolean)',
    'execute'
  ),
  'authenticated callers cannot commit an installed Shopify catalog'
);

insert into auth.users (id)
values ('d0000000-0000-0000-0000-000000000001');

insert into public.pages (id, owner_id, name, slug, services, products)
values (
  'd1000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  'Shopify mapping pgTAP',
  'shopify-mapping-pgtap',
  '[]'::jsonb,
  '[]'::jsonb
);

insert into public.shopify_installs (
  shop_domain,
  owner_id,
  page_id,
  offline_token_encrypted,
  refresh_token_encrypted,
  linked_at,
  catalog_generation
)
values (
  'serialization-test.myshopify.com',
  'd0000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001',
  'encrypted-access',
  'encrypted-refresh',
  statement_timestamp(),
  null
);

select is(
  public.nz_commit_shopify_catalog_sync(
    'serialization-test.myshopify.com',
    'd0000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    1,
    (select updated_at from public.pages where id = 'd1000000-0000-0000-0000-000000000001'),
    '[]'::jsonb,
    '[{"name":"Generation one","source":"shopify","metadata":{"shopify_shop":"serialization-test.myshopify.com","shopify_mapping_generation":1}}]'::jsonb,
    statement_timestamp(),
    false
  ),
  'written',
  'the exact active mapping generation commits atomically'
);
select is(
  (select catalog_generation from public.shopify_installs where shop_domain = 'serialization-test.myshopify.com'),
  1::bigint,
  'successful catalog commit records the offer generation'
);

create temporary table shopify_mapping_test_results (name text primary key, value jsonb);
insert into shopify_mapping_test_results values (
  'relink_begin',
  public.nz_begin_shopify_mapping_change(
    'serialization-test.myshopify.com',
    'd2000000-0000-4000-8000-000000000001',
    'relink',
    'd0000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    '2026-08-22T18:00:00Z'
  )
);

select is((select value ->> 'status' from shopify_mapping_test_results where name = 'relink_begin'), 'begun', 'relink lease begins');
select is((select (value ->> 'generation')::bigint from shopify_mapping_test_results where name = 'relink_begin'), 2::bigint, 'begin invalidates the active mapping generation');
select is((select (value ->> 'catalogGeneration')::bigint from shopify_mapping_test_results where name = 'relink_begin'), 1::bigint, 'lease retains the exact old catalog generation');
select is(
  public.nz_commit_shopify_catalog_sync(
    'serialization-test.myshopify.com',
    'd0000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    1,
    (select updated_at from public.pages where id = 'd1000000-0000-0000-0000-000000000001'),
    '[]'::jsonb,
    '[]'::jsonb,
    statement_timestamp(),
    false
  ),
  'mapping_stale',
  'an in-flight pre-lease sync cannot write after begin wins'
);
select is(
  public.nz_begin_shopify_mapping_change(
    'serialization-test.myshopify.com',
    'd2000000-0000-4000-8000-000000000002',
    'relink',
    'd0000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    '2026-08-22T18:01:00Z'
  ) ->> 'status',
  'busy',
  'an ordinary mapping change cannot steal a fresh relink lease'
);

insert into shopify_mapping_test_results values (
  'preempting_uninstall',
  public.nz_begin_shopify_mapping_change(
    'serialization-test.myshopify.com',
    'd2000000-0000-4000-8000-000000000003',
    'uninstall',
    null,
    null,
    '2026-08-22T18:01:30Z'
  )
);
select is((select value ->> 'status' from shopify_mapping_test_results where name = 'preempting_uninstall'), 'begun', 'uninstall immediately preempts an active relink');
select is((select (value ->> 'generation')::bigint from shopify_mapping_test_results where name = 'preempting_uninstall'), 3::bigint, 'uninstall preemption advances the generation');
select is(
  public.nz_abort_shopify_mapping_change(
    'serialization-test.myshopify.com',
    'd2000000-0000-4000-8000-000000000001',
    statement_timestamp()
  ),
  false,
  'the preempted relink token cannot finish or abort the uninstall lease'
);

-- Application uninstall order: revoke under the exact lease first, retaining
-- its cleanup pointer and catalog generation. Resolver queries now fail both
-- the uninstalled_at and transition-token predicates.
update public.shopify_installs
set
  uninstalled_at = '2026-08-22T18:02:00Z',
  offline_token_encrypted = null,
  refresh_token_encrypted = null
where shop_domain = 'serialization-test.myshopify.com'
  and mapping_transition_token = 'd2000000-0000-4000-8000-000000000003';

select is(
  (select count(*) from public.shopify_installs where shop_domain = 'serialization-test.myshopify.com' and uninstalled_at is null and mapping_transition_token is null),
  0::bigint,
  'revoked uninstall state cannot satisfy an active credential resolver'
);

insert into shopify_mapping_test_results values (
  'resumed_uninstall',
  public.nz_begin_shopify_mapping_change(
    'serialization-test.myshopify.com',
    'd2000000-0000-4000-8000-000000000004',
    'uninstall',
    null,
    null,
    '2026-08-22T18:02:30Z'
  )
);
select is((select value ->> 'status' from shopify_mapping_test_results where name = 'resumed_uninstall'), 'begun', 'revoked uninstall retry adopts the retained cleanup pointer immediately');
select is((select value ->> 'pageId' from shopify_mapping_test_results where name = 'resumed_uninstall'), 'd1000000-0000-0000-0000-000000000001', 'resumed uninstall retains the exact old page pointer');
select is((select (value ->> 'catalogGeneration')::bigint from shopify_mapping_test_results where name = 'resumed_uninstall'), 1::bigint, 'resumed uninstall retains the exact old catalog generation');

insert into shopify_mapping_test_results values (
  'adopted_redact',
  public.nz_begin_shopify_mapping_change(
    'serialization-test.myshopify.com',
    'd2000000-0000-4000-8000-000000000005',
    'redact',
    null,
    null,
    '2026-08-22T18:03:00Z'
  )
);
select is((select value ->> 'status' from shopify_mapping_test_results where name = 'adopted_redact'), 'begun', 'redact immediately adopts a revoked uninstall transition');
select is(
  public.nz_abort_shopify_mapping_change(
    'serialization-test.myshopify.com',
    'd2000000-0000-4000-8000-000000000004',
    statement_timestamp()
  ),
  false,
  'an adopted older lease cannot abort the newer revoked transition'
);
select is(
  public.nz_begin_shopify_mapping_change(
    'serialization-test.myshopify.com',
    'd2000000-0000-4000-8000-000000000006',
    'uninstall',
    null,
    null,
    '2026-08-22T18:03:30Z'
  ) ->> 'status',
  'busy',
  'uninstall cannot preempt terminal redaction'
);
select is(
  public.nz_begin_shopify_mapping_change(
    'serialization-test.myshopify.com',
    'd2000000-0000-4000-8000-000000000007',
    'owner_transfer',
    'd0000000-0000-0000-0000-000000000001',
    null,
    '2026-08-22T18:20:00Z'
  ) ->> 'status',
  'busy',
  'owner transfer cannot resurrect a shop while redaction is pending'
);
select is(
  (select mapping_generation from public.shopify_installs where shop_domain = 'serialization-test.myshopify.com'),
  5::bigint,
  'each takeover advances the generation monotonically'
);

insert into public.pages (id, owner_id, name, slug, services, products)
values (
  'd1000000-0000-0000-0000-000000000002',
  'd0000000-0000-0000-0000-000000000001',
  'Shopify stale reservation pgTAP',
  'shopify-stale-reservation-pgtap',
  '[]'::jsonb,
  '[]'::jsonb
);

insert into public.shopify_installs (
  shop_domain,
  owner_id,
  offline_token_encrypted,
  refresh_token_encrypted,
  linked_at
)
values
  (
    'stale-reservation.myshopify.com',
    'd0000000-0000-0000-0000-000000000001',
    'encrypted-stale-access',
    'encrypted-stale-refresh',
    statement_timestamp()
  ),
  (
    'fresh-claim.myshopify.com',
    'd0000000-0000-0000-0000-000000000001',
    'encrypted-fresh-access',
    'encrypted-fresh-refresh',
    statement_timestamp()
  );

select is(
  public.nz_begin_shopify_mapping_change(
    'stale-reservation.myshopify.com',
    'd2000000-0000-4000-8000-000000000008',
    'relink',
    'd0000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000002',
    '2026-08-22T18:00:00Z'
  ) ->> 'status',
  'begun',
  'a relink may reserve an unclaimed target page'
);
select is(
  public.nz_begin_shopify_mapping_change(
    'fresh-claim.myshopify.com',
    'd2000000-0000-4000-8000-000000000009',
    'relink',
    'd0000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000002',
    '2026-08-22T18:11:00Z'
  ) ->> 'status',
  'begun',
  'an expired reservation cannot permanently block a later target claim'
);

select * from finish();
rollback;
