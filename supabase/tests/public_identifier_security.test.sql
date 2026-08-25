begin;
set local search_path = public, extensions;

select plan(28);

select ok(
  to_regclass('private.public_identifier_claims') is not null,
  'the private public-identifier claim registry exists'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'private.public_identifier_claims'::regclass),
  'identifier claims keep row level security enabled'
);
select ok(
  not has_table_privilege('anon', 'private.public_identifier_claims', 'select')
    and not has_table_privilege('authenticated', 'private.public_identifier_claims', 'select')
    and not has_table_privilege('service_role', 'private.public_identifier_claims', 'select'),
  'Data API roles cannot read identifier claims directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.nz_public_identifier_availability(text,text,uuid,uuid)',
    'execute'
  )
    and has_function_privilege(
      'service_role',
      'public.nz_public_identifier_availability(text,text,uuid,uuid)',
      'execute'
    ),
  'only the trusted server can check authoritative availability'
);
select ok(
  not has_function_privilege('authenticated', 'public.nz_resolve_page_slug_alias(text)', 'execute')
    and has_function_privilege('service_role', 'public.nz_resolve_page_slug_alias(text)', 'execute'),
  'only the trusted server can resolve listing aliases'
);
select is(
  (
    select count(*)
    from private.public_identifier_claims
    where namespace = 'page_slug'
      and identifier = 'checkout'
      and kind = 'system'
  ),
  1::bigint,
  'platform routes are reserved in the database'
);

insert into auth.users (id) values
  ('d0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000003');

insert into public.billing_subscriptions (owner_id, plan_id, status, account_origin)
values
  ('d0000000-0000-4000-8000-000000000001', 'pro', 'active', 'legacy'),
  ('d0000000-0000-4000-8000-000000000002', 'pro', 'active', 'legacy'),
  ('d0000000-0000-4000-8000-000000000003', 'pro', 'active', 'legacy');

select throws_ok(
  $$insert into public.pages (owner_id, name, slug) values
    ('d0000000-0000-4000-8000-000000000001', 'Too short', 'abcd')$$,
  '23514',
  'public_identifier_too_short',
  'new listing slugs require at least five characters'
);
select throws_ok(
  $$insert into public.pages (owner_id, name, slug) values
    ('d0000000-0000-4000-8000-000000000001', 'Reserved route', 'checkout')$$,
  '23505',
  'public_identifier_reserved',
  'a listing cannot claim a platform route'
);
select throws_ok(
  $$insert into public.pages (owner_id, name, slug) values
    ('d0000000-0000-4000-8000-000000000001', 'Brand impersonation', 'nexez-support')$$,
  '23514',
  'public_identifier_reserved',
  'a listing cannot impersonate the Nexez brand'
);
select throws_ok(
  $$insert into public.pages (owner_id, name, slug) values
    ('d0000000-0000-4000-8000-000000000001', 'Mixed case', 'Owner-One')$$,
  '23514',
  'public_identifier_invalid_format',
  'database writes cannot create case-confusable public names'
);

insert into public.pages (id, owner_id, name, slug, is_published)
values (
  'd1000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  'Owner one listing',
  'owner-one-listing',
  true
);

select is(
  (
    select kind
    from private.public_identifier_claims
    where namespace = 'page_slug' and identifier = 'owner-one-listing'
  ),
  'current',
  'a valid listing slug is claimed atomically'
);

update public.pages
set slug = 'owner-one-renamed'
where id = 'd1000000-0000-4000-8000-000000000001';

select is(
  (
    select kind
    from private.public_identifier_claims
    where namespace = 'page_slug' and identifier = 'owner-one-listing'
  ),
  'alias',
  'a renamed listing keeps its former slug as an alias'
);
select is(
  public.nz_resolve_page_slug_alias('owner-one-listing'),
  'owner-one-renamed',
  'a published listing alias resolves to its current slug'
);
select throws_ok(
  $$insert into public.pages (owner_id, name, slug) values
    ('d0000000-0000-4000-8000-000000000002', 'Alias theft', 'owner-one-listing')$$,
  '23505',
  'public_identifier_taken',
  'another account cannot claim a listing alias'
);
select lives_ok(
  $$update public.pages set slug = 'owner-one-listing'
    where id = 'd1000000-0000-4000-8000-000000000001'$$,
  'the same listing can safely return to its own alias'
);

select is(
  (
    select available
    from public.nz_public_identifier_availability(
      'page_slug',
      'fresh-public-name',
      'd0000000-0000-4000-8000-000000000002',
      null
    )
  ),
  true,
  'an unclaimed valid listing name is available'
);
select is(
  (
    select reason
    from public.nz_public_identifier_availability(
      'page_slug',
      'owner-one-listing',
      'd0000000-0000-4000-8000-000000000002',
      null
    )
  ),
  'taken',
  'availability reports a claimed listing name without exposing its owner'
);

delete from public.pages where id = 'd1000000-0000-4000-8000-000000000001';

select is(
  (
    select kind
    from private.public_identifier_claims
    where namespace = 'page_slug' and identifier = 'owner-one-listing'
  ),
  'reserved',
  'deleting a listing permanently reserves its current name'
);
select is(
  public.nz_resolve_page_slug_alias('owner-one-renamed'),
  null,
  'deleted listings no longer resolve through an old alias'
);

insert into public.storefronts (id, owner_id, handle, display_name)
values (
  'd2000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  'owner-shop',
  'Owner shop'
);

select is(
  (
    select kind
    from private.public_identifier_claims
    where namespace = 'storefront_handle' and identifier = 'owner-shop'
  ),
  'current',
  'a valid storefront handle is claimed atomically'
);

update public.storefronts
set handle = 'owner-market'
where id = 'd2000000-0000-4000-8000-000000000001';

select is(
  (
    select kind
    from private.public_identifier_claims
    where namespace = 'storefront_handle' and identifier = 'owner-shop'
  ),
  'reserved',
  'a previous storefront handle is reserved after rename'
);
select throws_ok(
  $$insert into public.storefronts (owner_id, handle) values
    ('d0000000-0000-4000-8000-000000000002', 'owner-shop')$$,
  '23505',
  'public_identifier_reserved',
  'another account cannot claim a previous storefront handle'
);

-- Simulate the production short handle that the migration backfilled before
-- enforcement. The unchanged row must remain editable, but its identity cannot
-- be changed to another short value.
alter table public.storefronts disable trigger trg_01_enforce_storefront_handle_identifier;
insert into public.storefronts (id, owner_id, handle, display_name)
values (
  'd2000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000003',
  'a',
  'Legacy shop'
);
insert into private.public_identifier_claims (namespace, identifier, kind, owner_id, subject_id)
values (
  'storefront_handle',
  'a',
  'current',
  'd0000000-0000-4000-8000-000000000003',
  'd2000000-0000-4000-8000-000000000003'
);
alter table public.storefronts enable trigger trg_01_enforce_storefront_handle_identifier;

select lives_ok(
  $$update public.storefronts set display_name = 'Legacy shop updated'
    where id = 'd2000000-0000-4000-8000-000000000003'$$,
  'an unchanged grandfathered short handle does not block ordinary edits'
);
select throws_ok(
  $$update public.storefronts set handle = 'b'
    where id = 'd2000000-0000-4000-8000-000000000003'$$,
  '23514',
  'public_identifier_too_short',
  'a grandfathered handle cannot change to a different short name'
);
select is(
  (
    select reason
    from public.nz_public_identifier_availability(
      'storefront_handle',
      'a',
      'd0000000-0000-4000-8000-000000000003',
      'd2000000-0000-4000-8000-000000000003'
    )
  ),
  'owned',
  'the trusted availability check recognizes the grandfathered owner'
);
select throws_ok(
  $$insert into public.pages (owner_id, name, slug, domain_path) values
    ('d0000000-0000-4000-8000-000000000002', 'Nested path', 'nested-path-test', '/nested/path')$$,
  '23514',
  null,
  'custom-domain paths cannot claim nested routing space'
);
select throws_ok(
  $$insert into public.pages (owner_id, name, slug, domain_path) values
    ('d0000000-0000-4000-8000-000000000002', 'Short path', 'short-path-test', '/abcd')$$,
  '23514',
  null,
  'custom-domain paths reserve the short public-name namespace'
);
select throws_ok(
  $$insert into public.pages (owner_id, name, slug, domain_path) values
    ('d0000000-0000-4000-8000-000000000002', 'Long path', 'long-path-test', '/' || repeat('a', 64))$$,
  '23514',
  null,
  'custom-domain paths cannot exceed the public identifier limit'
);

select * from finish();
rollback;
