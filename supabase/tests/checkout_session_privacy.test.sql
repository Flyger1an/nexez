-- Run the payment and credential adversarial gauntlet on the fully migrated CI schema.
\ir high_priority_security.sql

begin;

select plan(11);

insert into auth.users (id)
values ('10000000-0000-4000-8000-000000000201');

insert into public.pages (id, owner_id, name, slug, is_published)
values (
  '20000000-0000-4000-8000-000000000201',
  '10000000-0000-4000-8000-000000000201',
  'Checkout privacy test',
  'checkout-privacy-test',
  false
);

insert into public.checkout_sessions (
  id, channel, page_id, slug, owner_id, status, currency,
  line_items, buyer, totals, stripe_payment_intent_id, expires_at
)
values
  (
    '30000000-0000-4000-8000-000000000201', 'acp',
    '20000000-0000-4000-8000-000000000201', 'checkout-privacy-test',
    '10000000-0000-4000-8000-000000000201', 'pending', 'usd',
    '[]', '{"email":"delete@example.test","reference":"buyer-delete"}', '{}', null,
    now() - interval '2 hours'
  ),
  (
    '30000000-0000-4000-8000-000000000202', 'acp',
    '20000000-0000-4000-8000-000000000201', 'checkout-privacy-test',
    '10000000-0000-4000-8000-000000000201', 'completed', 'usd',
    '[]', '{"email":"complete@example.test","name":"Complete Buyer"}', '{}', 'pi_privacy_complete',
    now() - interval '2 hours'
  ),
  (
    '30000000-0000-4000-8000-000000000203', 'ucp',
    '20000000-0000-4000-8000-000000000201', 'checkout-privacy-test',
    '10000000-0000-4000-8000-000000000201', 'ready', 'usd',
    '[]', '{"email":"payment@example.test","agent":"test-agent","locale":"en-US"}', '{}', 'pi_privacy_pending',
    now() - interval '2 hours'
  ),
  (
    '30000000-0000-4000-8000-000000000204', 'ucp',
    '20000000-0000-4000-8000-000000000201', 'checkout-privacy-test',
    '10000000-0000-4000-8000-000000000201', 'pending', 'usd',
    '[]', '{"email":"future@example.test"}', '{}', null,
    now() + interval '2 hours'
  );

select ok(
  to_regprocedure('private.nz_cleanup_expired_checkout_sessions(integer)') is not null,
  'bounded checkout-session privacy cleanup is installed'
);

select ok(
  not has_function_privilege('anon', 'private.nz_cleanup_expired_checkout_sessions(integer)', 'execute')
    and not has_function_privilege('authenticated', 'private.nz_cleanup_expired_checkout_sessions(integer)', 'execute')
    and not has_function_privilege('service_role', 'private.nz_cleanup_expired_checkout_sessions(integer)', 'execute'),
  'checkout-session cleanup is not an application API'
);

create temporary table checkout_privacy_result as
select * from private.nz_cleanup_expired_checkout_sessions(1000);

select is(
  (select scrubbed_count from checkout_privacy_result),
  3,
  'cleanup scrubs identity from every expired snapshot in the batch'
);

select is(
  (select deleted_count from checkout_privacy_result),
  1,
  'cleanup deletes only the incomplete unlinked snapshot'
);

select is(
  (select count(*) from public.checkout_sessions where id = '30000000-0000-4000-8000-000000000201'),
  0::bigint,
  'expired incomplete session without payment lineage is deleted'
);

select is(
  (select count(*) from public.checkout_sessions where id = '30000000-0000-4000-8000-000000000202'),
  1::bigint,
  'completed session is preserved'
);

select is(
  (select buyer from public.checkout_sessions where id = '30000000-0000-4000-8000-000000000202'),
  null::jsonb,
  'completed expired session no longer duplicates buyer identity'
);

select is(
  (select count(*) from public.checkout_sessions where id = '30000000-0000-4000-8000-000000000203'),
  1::bigint,
  'incomplete session with payment lineage is preserved'
);

select is(
  (select buyer from public.checkout_sessions where id = '30000000-0000-4000-8000-000000000203'),
  '{"locale":"en-US"}'::jsonb,
  'payment-linked session keeps non-identity JSON while identity keys are removed'
);

select is(
  (select buyer from public.checkout_sessions where id = '30000000-0000-4000-8000-000000000204'),
  '{"email":"future@example.test"}'::jsonb,
  'unexpired session remains usable and unchanged'
);

select is(
  (
    select count(*)
    from cron.job
    where jobname = 'nexez_cleanup_expired_checkout_sessions'
      and command like '%private.nz_cleanup_expired_checkout_sessions(1000)%'
  ),
  1::bigint,
  'hourly cleanup job invokes the bounded private function'
);

select * from finish();
rollback;
