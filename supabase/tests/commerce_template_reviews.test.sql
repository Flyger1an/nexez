begin;

select plan(17);

select ok(
  to_regclass('public.commerce_template_review_events') is not null,
  'commerce template review event table exists'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.commerce_template_review_events'::regclass),
  'commerce template review events use RLS'
);

select ok(
  not has_table_privilege('anon', 'public.commerce_template_review_events', 'select')
    and not has_table_privilege('anon', 'public.commerce_template_review_events', 'insert')
    and not has_table_privilege('anon', 'public.commerce_template_review_events', 'update')
    and not has_table_privilege('anon', 'public.commerce_template_review_events', 'delete'),
  'anonymous clients hold no review ledger privileges'
);

select ok(
  not has_table_privilege('authenticated', 'public.commerce_template_review_events', 'select')
    and not has_table_privilege('authenticated', 'public.commerce_template_review_events', 'insert')
    and not has_table_privilege('authenticated', 'public.commerce_template_review_events', 'update')
    and not has_table_privilege('authenticated', 'public.commerce_template_review_events', 'delete'),
  'authenticated browser clients hold no review ledger privileges'
);

select ok(
  has_table_privilege('service_role', 'public.commerce_template_review_events', 'select')
    and has_table_privilege('service_role', 'public.commerce_template_review_events', 'insert')
    and not has_table_privilege('service_role', 'public.commerce_template_review_events', 'update')
    and not has_table_privilege('service_role', 'public.commerce_template_review_events', 'delete'),
  'service role can append and read but cannot mutate review events'
);

select ok(
  not has_function_privilege(
    'service_role',
    'private.nz_validate_commerce_template_review_event()',
    'execute'
  ),
  'review integrity trigger function is not a callable service API'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select lives_ok(
  $$
    insert into public.commerce_template_review_events (
      review_id,
      idempotency_key,
      template_id,
      template_version,
      review_reason,
      event_type,
      rationale,
      operator_id,
      snapshot_generated_at,
      evidence_snapshot
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'events.party-rentals',
      1,
      'performance',
      'opened',
      'Readiness trails the comparison cohort on sufficient exact-version evidence.',
      '30000000-0000-4000-8000-000000000001',
      now(),
      '{"schemaVersion":1,"sources":{"listings":true}}'::jsonb
    )
  $$,
  'service role can open an evidence-bound review'
);

select throws_ok(
  $$
    insert into public.commerce_template_review_events (
      review_id, idempotency_key, template_id, template_version,
      review_reason, event_type, rationale, operator_id,
      snapshot_generated_at, evidence_snapshot
    ) values (
      '10000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000002',
      'events.party-rentals', 1, 'manual', 'opened',
      'A second operator tried to open a parallel review.',
      '30000000-0000-4000-8000-000000000002', now(), '{}'::jsonb
    )
  $$,
  '23505',
  'an open review already exists for this guide version',
  'one exact guide version cannot have parallel open reviews'
);

select throws_ok(
  $$
    insert into public.commerce_template_review_events (
      review_id, idempotency_key, template_id, template_version,
      review_reason, event_type, decision, rationale, operator_id,
      snapshot_generated_at, evidence_snapshot
    ) values (
      '10000000-0000-4000-8000-000000000099',
      '20000000-0000-4000-8000-000000000003',
      'events.party-rentals', 1, 'performance', 'decided', 'keep',
      'This decision has no corresponding open review event.',
      '30000000-0000-4000-8000-000000000001', now(), '{}'::jsonb
    )
  $$,
  '23514',
  'review decision requires an open review',
  'a decision cannot exist without its open review'
);

select throws_ok(
  $$
    insert into public.commerce_template_review_events (
      review_id, idempotency_key, template_id, template_version,
      review_reason, event_type, decision, rationale, operator_id,
      snapshot_generated_at, evidence_snapshot
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000004',
      'events.party-rentals', 2, 'performance', 'decided', 'revise',
      'The supplied guide version does not match the open review.',
      '30000000-0000-4000-8000-000000000001', now(), '{}'::jsonb
    )
  $$,
  '23514',
  'review decision identity must match the open review',
  'a decision cannot switch the exact guide identity'
);

select lives_ok(
  $$
    insert into public.commerce_template_review_events (
      review_id, idempotency_key, template_id, template_version,
      review_reason, event_type, decision, rationale, operator_id,
      snapshot_generated_at, evidence_snapshot
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000005',
      'events.party-rentals', 1, 'performance', 'decided', 'revise',
      'Revise the intake because the preserved evidence meets the review floor.',
      '30000000-0000-4000-8000-000000000001', now(),
      '{"schemaVersion":1,"sources":{"listings":true}}'::jsonb
    )
  $$,
  'service role can append one matching decision'
);

select lives_ok(
  $$
    insert into public.commerce_template_review_events (
      review_id, idempotency_key, template_id, template_version,
      review_reason, event_type, rationale, operator_id,
      snapshot_generated_at, evidence_snapshot
    ) values (
      '10000000-0000-4000-8000-000000000003',
      '20000000-0000-4000-8000-000000000006',
      'events.party-rentals', 1, 'catalog_overlap', 'opened',
      'A resolved review permits a later catalog-overlap review.',
      '30000000-0000-4000-8000-000000000002', now(), '{}'::jsonb
    )
  $$,
  'a later review can open after the prior review is decided'
);

reset role;

select throws_ok(
  $$update public.commerce_template_review_events set rationale = 'Changed review rationale'$$,
  '55000',
  'commerce template reviews are append-only',
  'even a privileged role cannot update review history'
);

select throws_ok(
  $$delete from public.commerce_template_review_events$$,
  '55000',
  'commerce template reviews are append-only',
  'even a privileged role cannot delete review history'
);

select is(
  (select count(*) from public.commerce_template_review_events),
  3::bigint,
  'only the two open events and one decision were recorded'
);

select is(
  (
    select decision
    from public.commerce_template_review_events
    where review_id = '10000000-0000-4000-8000-000000000001'
      and event_type = 'decided'
  ),
  'revise',
  'the resolved review preserves its human decision'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000001"}',
  true
);

select throws_ok(
  $$select * from public.commerce_template_review_events$$,
  '42501',
  null,
  'an authenticated platform user cannot read the private review ledger'
);

select * from finish();
rollback;
