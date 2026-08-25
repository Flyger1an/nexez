begin;
set local search_path = public, extensions;

select plan(19);

select ok(
  to_regclass('public.launch_decisions') is not null,
  'launch decision ledger exists'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.launch_decisions'::regclass),
  'row level security is enabled'
);
select ok(
  not has_table_privilege('anon', 'public.launch_decisions', 'select')
    and not has_table_privilege('anon', 'public.launch_decisions', 'insert'),
  'anonymous clients cannot read or append launch decisions'
);
select ok(
  not has_table_privilege('authenticated', 'public.launch_decisions', 'select')
    and not has_table_privilege('authenticated', 'public.launch_decisions', 'insert'),
  'authenticated clients cannot read or append launch decisions'
);
select ok(
  has_table_privilege('service_role', 'public.launch_decisions', 'select'),
  'service role can read launch decisions server-side'
);
select ok(
  has_table_privilege('service_role', 'public.launch_decisions', 'insert'),
  'service role can append launch decisions server-side'
);
select ok(
  not has_table_privilege('service_role', 'public.launch_decisions', 'update'),
  'service role cannot rewrite launch decisions'
);
select ok(
  not has_table_privilege('service_role', 'public.launch_decisions', 'delete'),
  'service role cannot delete launch decisions'
);

insert into auth.users (id, email)
values ('d0000000-0000-4000-8000-000000000001', 'operator@nexez.ai');

insert into public.release_certifications (
  id,
  idempotency_key,
  source,
  environment,
  commit_sha,
  deployed_revision,
  deployment_url,
  status,
  started_at,
  completed_at,
  snapshot_generated_at,
  launch_status,
  launch_score,
  check_count,
  required_check_count,
  required_failed_count
) values (
  'd1000000-0000-4000-8000-000000000001',
  'launch-decision-certificate',
  'github',
  'production',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'https://nexez.ai',
  'passed',
  now() - interval '1 minute',
  now(),
  now(),
  'ready',
  100,
  12,
  12,
  0
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select lives_ok(
  $$
    insert into public.launch_decisions (
      idempotency_key,
      decision,
      reason,
      operator_id,
      operator_email,
      snapshot_generated_at,
      launch_status,
      launch_score,
      required_blocker_count,
      required_blockers,
      incident_count
    ) values (
      'd2000000-0000-4000-8000-000000000001',
      'hold',
      'Waiting for an exact production certificate.',
      'd0000000-0000-4000-8000-000000000001',
      'operator@nexez.ai',
      now(),
      'attention',
      92,
      1,
      '[{"id":"deployed-revision"}]'::jsonb,
      0
    )
  $$,
  'a hold can preserve incomplete or blocked evidence'
);

select lives_ok(
  $$
    insert into public.launch_decisions (
      idempotency_key,
      decision,
      reason,
      operator_id,
      operator_email,
      release_certification_id,
      certificate_commit_sha,
      production_revision,
      snapshot_generated_at,
      launch_status,
      launch_score,
      required_blocker_count,
      required_blockers,
      incident_count
    ) values (
      'd2000000-0000-4000-8000-000000000002',
      'go',
      'Approved for the monitored launch window.',
      'd0000000-0000-4000-8000-000000000001',
      'operator@nexez.ai',
      'd1000000-0000-4000-8000-000000000001',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      now(),
      'ready',
      100,
      0,
      '[]'::jsonb,
      0
    )
  $$,
  'a go can be recorded against exact green production evidence'
);

select throws_ok(
  $$
    insert into public.launch_decisions (
      idempotency_key,
      decision,
      reason,
      operator_id,
      operator_email,
      release_certification_id,
      certificate_commit_sha,
      production_revision,
      snapshot_generated_at,
      launch_status,
      launch_score,
      required_blocker_count,
      required_blockers,
      incident_count
    ) values (
      'd2000000-0000-4000-8000-000000000003',
      'go',
      'The revision does not match.',
      'd0000000-0000-4000-8000-000000000001',
      'operator@nexez.ai',
      'd1000000-0000-4000-8000-000000000001',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      now(),
      'ready',
      100,
      0,
      '[]'::jsonb,
      0
    )
  $$,
  '23514',
  'go decision evidence is not launch eligible',
  'a go cannot target a different production revision'
);

select throws_ok(
  $$
    insert into public.launch_decisions (
      idempotency_key,
      decision,
      reason,
      operator_id,
      operator_email,
      release_certification_id,
      certificate_commit_sha,
      production_revision,
      snapshot_generated_at,
      launch_status,
      launch_score,
      required_blocker_count,
      required_blockers,
      incident_count
    ) values (
      'd2000000-0000-4000-8000-000000000004',
      'go',
      'A required blocker is still active.',
      'd0000000-0000-4000-8000-000000000001',
      'operator@nexez.ai',
      'd1000000-0000-4000-8000-000000000001',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      now(),
      'ready',
      96,
      1,
      '[{"id":"commerce-certification"}]'::jsonb,
      0
    )
  $$,
  '23514',
  'go decision evidence is not launch eligible',
  'a go cannot be recorded while a required blocker remains'
);

select throws_ok(
  $$
    insert into public.launch_decisions (
      idempotency_key,
      decision,
      reason,
      operator_id,
      operator_email,
      snapshot_generated_at,
      launch_status,
      launch_score,
      required_blocker_count,
      incident_count
    ) values (
      'd2000000-0000-4000-8000-000000000005',
      'go',
      'No exact certificate was attached.',
      'd0000000-0000-4000-8000-000000000001',
      'operator@nexez.ai',
      now(),
      'ready',
      100,
      0,
      0
    )
  $$,
  '23514',
  'go decisions require an exact release certificate',
  'a go cannot be recorded without a certificate'
);

select throws_ok(
  $$
    insert into public.launch_decisions (
      idempotency_key,
      decision,
      reason,
      operator_id,
      operator_email,
      release_certification_id,
      certificate_commit_sha,
      production_revision,
      snapshot_generated_at,
      launch_status,
      launch_score,
      required_blocker_count,
      required_blockers,
      incident_count
    ) values (
      'd2000000-0000-4000-8000-000000000008',
      'go',
      'The readiness score is incomplete.',
      'd0000000-0000-4000-8000-000000000001',
      'operator@nexez.ai',
      'd1000000-0000-4000-8000-000000000001',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      now(),
      'ready',
      99,
      0,
      '[]'::jsonb,
      0
    )
  $$,
  '23514',
  'go decision evidence is not launch eligible',
  'a go cannot be recorded below a perfect readiness score'
);

select throws_ok(
  $$
    insert into public.launch_decisions (
      idempotency_key,
      decision,
      reason,
      operator_id,
      operator_email,
      snapshot_generated_at,
      launch_status,
      launch_score,
      required_blocker_count,
      incident_count
    ) values (
      'd2000000-0000-4000-8000-000000000006',
      'hold',
      'This snapshot is too old for a current decision.',
      'd0000000-0000-4000-8000-000000000001',
      'operator@nexez.ai',
      now() - interval '11 minutes',
      'attention',
      92,
      0,
      0
    )
  $$,
  '23514',
  null,
  'a stale Launch Control snapshot cannot be recorded'
);

select throws_ok(
  $$
    insert into public.launch_decisions (
      idempotency_key,
      decision,
      reason,
      operator_id,
      operator_email,
      snapshot_generated_at,
      launch_status,
      launch_score,
      required_blocker_count,
      required_blockers,
      incident_count
    ) values (
      'd2000000-0000-4000-8000-000000000007',
      'hold',
      'The blocker count must match its evidence.',
      'd0000000-0000-4000-8000-000000000001',
      'operator@nexez.ai',
      now(),
      'attention',
      92,
      1,
      '[]'::jsonb,
      0
    )
  $$,
  '23514',
  null,
  'the blocker count cannot disagree with the captured evidence'
);

select throws_ok(
  $$
    insert into public.launch_decisions (
      idempotency_key,
      decision,
      reason,
      operator_id,
      operator_email,
      snapshot_generated_at,
      launch_status,
      launch_score,
      required_blocker_count,
      required_blockers,
      incident_count
    ) values (
      'd2000000-0000-4000-8000-000000000001',
      'hold',
      'This is an accidental replay.',
      'd0000000-0000-4000-8000-000000000001',
      'operator@nexez.ai',
      now(),
      'blocked',
      10,
      2,
      '[{"id":"one"},{"id":"two"}]'::jsonb,
      0
    )
  $$,
  '23505',
  null,
  'the idempotency key prevents duplicate decisions'
);

reset role;

select throws_ok(
  $$
    update public.launch_decisions
    set reason = 'Rewritten decision'
    where idempotency_key = 'd2000000-0000-4000-8000-000000000002'
  $$,
  '55000',
  'launch decisions are append-only',
  'even the database owner cannot rewrite a launch decision'
);

select is(
  (select count(*) from public.launch_decisions),
  2::bigint,
  'only the valid hold and go decisions remain in the ledger'
);

select * from finish();
rollback;
