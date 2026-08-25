begin;
set local search_path = public, extensions;

select plan(14);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pages'
      and column_name = 'commerce_template_id'
  ),
  'listings can retain private Commerce Template lineage'
);

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pages_public'
      and column_name like 'commerce_template_%'
  ),
  0::bigint,
  'Commerce Template lineage is excluded from the public listing projection'
);

insert into auth.users (id) values
  ('e0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000002');

insert into public.billing_subscriptions (owner_id, plan_id, status, account_origin)
values
  ('e0000000-0000-4000-8000-000000000001', 'pro', 'active', 'legacy'),
  ('e0000000-0000-4000-8000-000000000002', 'pro', 'active', 'legacy');

select lives_ok(
  $$insert into public.pages (id, owner_id, name, slug, is_published) values (
    'e1000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001',
    'Ordinary listing',
    'ordinary-lineage-test',
    false
  )$$,
  'ordinary listing creation remains unchanged'
);

select throws_ok(
  $$insert into public.pages (
    owner_id, name, slug, commerce_template_id
  ) values (
    'e0000000-0000-4000-8000-000000000001',
    'Partial lineage',
    'partial-lineage-test',
    'events.private-chef'
  )$$,
  '23514',
  null,
  'partial lineage is rejected'
);

select throws_ok(
  $$insert into public.pages (
    owner_id, name, slug, commerce_template_id, commerce_template_version,
    commerce_template_adopted_at, commerce_template_source
  ) values (
    'e0000000-0000-4000-8000-000000000001',
    'Invalid template ID',
    'invalid-template-id-test',
    'Private Chef',
    1,
    '2026-08-25T22:00:00Z',
    'owner_selected_intake'
  )$$,
  '23514',
  null,
  'invalid template identifiers are rejected'
);

select throws_ok(
  $$insert into public.pages (
    owner_id, name, slug, commerce_template_id, commerce_template_version,
    commerce_template_adopted_at, commerce_template_source
  ) values (
    'e0000000-0000-4000-8000-000000000001',
    'Invalid template version',
    'invalid-template-version-test',
    'events.private-chef',
    0,
    '2026-08-25T22:00:00Z',
    'owner_selected_intake'
  )$$,
  '23514',
  null,
  'non-positive template versions are rejected'
);

select throws_ok(
  $$insert into public.pages (
    owner_id, name, slug, commerce_template_id, commerce_template_version,
    commerce_template_adopted_at, commerce_template_source
  ) values (
    'e0000000-0000-4000-8000-000000000001',
    'Invalid lineage source',
    'invalid-lineage-source-test',
    'events.private-chef',
    1,
    '2026-08-25T22:00:00Z',
    'automatic_inference'
  )$$,
  '23514',
  null,
  'unapproved lineage sources are rejected'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$insert into public.pages (
    owner_id, name, slug, commerce_template_id, commerce_template_version,
    commerce_template_adopted_at, commerce_template_source
  ) values (
    'e0000000-0000-4000-8000-000000000001',
    'Spoofed lineage',
    'spoofed-lineage-test',
    'events.private-chef',
    1,
    '2026-08-25T22:00:00Z',
    'owner_selected_intake'
  )$$,
  '42501',
  'commerce_template_lineage_server_only',
  'authenticated clients cannot assert template lineage'
);

reset role;
select set_config('request.jwt.claims', '', true);
set local role service_role;

select lives_ok(
  $$insert into public.pages (
    id, owner_id, name, slug, commerce_template_id, commerce_template_version,
    commerce_template_adopted_at, commerce_template_source
  ) values (
    'e1000000-0000-4000-8000-000000000002',
    'e0000000-0000-4000-8000-000000000001',
    'Guided listing',
    'guided-lineage-test',
    'events.private-chef',
    1,
    '2026-08-25T22:00:00Z',
    'owner_selected_intake'
  )$$,
  'the trusted server can persist complete lineage atomically'
);

select is(
  (
    select commerce_template_id || '@' || commerce_template_version::text
    from public.pages
    where id = 'e1000000-0000-4000-8000-000000000002'
  ),
  'events.private-chef@1',
  'the exact selected template version is retained'
);

select lives_ok(
  $$update public.pages
    set description = 'Merchant-authored facts remain editable.'
    where id = 'e1000000-0000-4000-8000-000000000002'$$,
  'ordinary merchant fields remain independent and editable'
);

select throws_ok(
  $$update public.pages
    set commerce_template_version = 2
    where id = 'e1000000-0000-4000-8000-000000000002'$$,
  '23514',
  'commerce_template_lineage_immutable',
  'lineage cannot be rewritten after adoption'
);

reset role;
select set_config('request.jwt.claims', '', true);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select is(
  (
    select commerce_template_id
    from public.pages
    where id = 'e1000000-0000-4000-8000-000000000002'
  ),
  'events.private-chef',
  'the listing owner can read retained lineage'
);

select is(
  (
    select count(*)
    from public.pages
    where owner_id = 'e0000000-0000-4000-8000-000000000002'
      and commerce_template_id is not null
  ),
  0::bigint,
  'another owner cannot read retained lineage'
);

select * from finish();
rollback;
