begin;

select plan(37);

select ok(
  not has_function_privilege('anon', 'public.nz_owner_negotiation_rollup(timestamptz,timestamptz,uuid,text)', 'execute'),
  'anonymous callers cannot execute negotiation reporting'
);
select ok(
  has_function_privilege('authenticated', 'public.nz_owner_negotiation_rollup(timestamptz,timestamptz,uuid,text)', 'execute'),
  'authenticated owners can execute negotiation reporting'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.nz_owner_negotiation_rollup(timestamptz,timestamptz,uuid,text)'::regprocedure),
  'negotiation reporting runs as security invoker'
);

insert into auth.users (id) values
  ('a1000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000002');

insert into public.pages (id, owner_id, name, slug, currency) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Negotiation Alpha', 'negotiation-alpha', 'usd'),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'Negotiation Other', 'negotiation-other', 'usd');

insert into public.agent_negotiations (
  id, page_id, owner_id, slug, offer_key, offer_name, offer_kind, status,
  settlement_state, amount_cents, refunded_cents, currency, decision_pending,
  decision_requested_at, metadata, stripe_livemode, created_at, updated_at
) values
  ('a3000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'negotiation-alpha', 'services-0', 'Strategy', 'services', 'negotiation', null, null, 0, 'usd', false, null, '{}', true, clock_timestamp() - interval '10 minutes', clock_timestamp() - interval '10 minutes'),
  ('a3000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'negotiation-alpha', 'services-0', 'Strategy', 'services', 'negotiation', null, null, 0, 'usd', false, null, '{"last_decision":{"action":"counter"}}', true, clock_timestamp() - interval '9 minutes', clock_timestamp() - interval '9 minutes'),
  ('a3000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'negotiation-alpha', 'services-0', 'Strategy', 'services', 'agreement_proposed', 'awaiting_approval', 10000, 0, 'usd', false, null, '{}', true, clock_timestamp() - interval '8 minutes', clock_timestamp() - interval '8 minutes'),
  ('a3000000-0000-0000-0000-000000000004', 'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'negotiation-alpha', 'services-0', 'Strategy', 'services', 'agreement_proposed', 'approved', 12000, 0, 'eur', false, null, '{}', true, clock_timestamp() - interval '7 minutes', clock_timestamp() - interval '7 minutes'),
  ('a3000000-0000-0000-0000-000000000005', 'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'negotiation-alpha', 'services-0', 'Strategy', 'services', 'held', 'approved', 20000, 0, 'usd', false, null, '{}', true, clock_timestamp() - interval '10 days', clock_timestamp() - interval '10 days'),
  ('a3000000-0000-0000-0000-000000000006', 'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'negotiation-alpha', 'services-0', 'Strategy', 'services', 'complete', 'approved', 30000, 0, 'usd', false, null, '{}', true, clock_timestamp() - interval '6 minutes', clock_timestamp() - interval '6 minutes'),
  ('a3000000-0000-0000-0000-000000000007', 'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'negotiation-alpha', 'services-0', 'Strategy', 'services', 'refunded', 'approved', 40000, 40000, 'usd', false, null, '{}', true, clock_timestamp() - interval '5 minutes', clock_timestamp() - interval '5 minutes'),
  ('a3000000-0000-0000-0000-000000000008', 'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'negotiation-alpha', 'services-0', 'Strategy', 'services', 'disputed', 'approved', 50000, 0, 'usd', false, null, '{}', true, clock_timestamp() - interval '4 minutes', clock_timestamp() - interval '4 minutes'),
  ('a3000000-0000-0000-0000-000000000009', 'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'negotiation-alpha', 'services-0', 'Strategy', 'services', 'paused', null, null, 0, 'usd', false, null, '{}', true, clock_timestamp() - interval '4 days', clock_timestamp() - interval '4 days'),
  ('a3000000-0000-0000-0000-000000000010', 'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'negotiation-alpha', 'services-0', 'Strategy', 'services', 'negotiation', null, null, 0, 'usd', true, clock_timestamp() - interval '3 minutes', '{}', true, clock_timestamp() - interval '3 minutes', clock_timestamp() - interval '3 minutes'),
  ('a3000000-0000-0000-0000-000000000011', 'a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'negotiation-other', 'services-0', 'Other', 'services', 'complete', 'approved', 99999, 0, 'usd', false, null, '{}', true, clock_timestamp(), clock_timestamp());

insert into public.negotiation_messages (id, negotiation_id, role, content, created_at) values
  ('a4000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'buyer', '{"message":"buyer one"}', clock_timestamp() - interval '10 minutes'),
  ('a4000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001', 'seller_owner', '{"decision":{"action":"accept"}}', clock_timestamp() - interval '9 minutes 58 seconds'),
  ('a4000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000002', 'buyer', '{"message":"buyer two"}', clock_timestamp() - interval '9 minutes'),
  ('a4000000-0000-0000-0000-000000000004', 'a3000000-0000-0000-0000-000000000002', 'seller_llm', '{"decision":{"action":"counter"}}', clock_timestamp() - interval '8 minutes 54 seconds');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is((public.nz_owner_negotiation_rollup() #>> '{schemaVersion}')::integer, 1, 'rollup returns the supported schema');
select is((public.nz_owner_negotiation_rollup() #>> '{counts,total}')::bigint, 10::bigint, 'total is exact and owner scoped');
select is((public.nz_owner_negotiation_rollup() #>> '{counts,negotiation}')::bigint, 3::bigint, 'active negotiation status remains available for charts');
select is((public.nz_owner_negotiation_rollup() #>> '{counts,paused}')::bigint, 1::bigint, 'paused status remains available for charts');
select is((public.nz_owner_negotiation_rollup() #>> '{counts,open}')::bigint, 4::bigint, 'open count includes negotiation and paused states');
select is((public.nz_owner_negotiation_rollup() #>> '{counts,proposed}')::bigint, 2::bigint, 'agreements awaiting funding remain explicit');
select is((public.nz_owner_negotiation_rollup() #>> '{counts,held}')::bigint, 1::bigint, 'held funds are counted');
select is((public.nz_owner_negotiation_rollup() #>> '{counts,complete}')::bigint, 1::bigint, 'completed deals are counted');
select is((public.nz_owner_negotiation_rollup() #>> '{counts,refunded}')::bigint, 1::bigint, 'refund outcomes are distinct');
select is((public.nz_owner_negotiation_rollup() #>> '{counts,disputed}')::bigint, 1::bigint, 'disputes are distinct');
select is((public.nz_owner_negotiation_rollup() #>> '{counts,decisionPending}')::bigint, 1::bigint, 'decision worker backlog is exact');
select is((public.nz_owner_negotiation_rollup() #>> '{counts,needsAction}')::bigint, 5::bigint, 'seller action queue follows lifecycle semantics');
select is((public.nz_owner_negotiation_rollup() #>> '{counts,waiting}')::bigint, 3::bigint, 'buyer and worker waiting states are separate');
select is((public.nz_owner_negotiation_rollup() #>> '{counts,staleOpen}')::bigint, 2::bigint, 'stale open negotiations are surfaced');
select is((public.nz_owner_negotiation_rollup() #>> '{currencies,0,currency}'), 'usd', 'highest captured currency is first');
select is((public.nz_owner_negotiation_rollup() #>> '{currencies,0,agreedCents}')::bigint, 150000::bigint, 'agreement value is exact within currency');
select is((public.nz_owner_negotiation_rollup() #>> '{currencies,0,capturedCents}')::bigint, 120000::bigint, 'captured value includes terminal money outcomes');
select is((public.nz_owner_negotiation_rollup() #>> '{currencies,0,refundedCents}')::bigint, 90000::bigint, 'refund and dispute exposure is explicit');
select is((public.nz_owner_negotiation_rollup() #>> '{currencies,1,currency}'), 'eur', 'a second currency is never merged into USD');
select is((public.nz_owner_negotiation_rollup() #>> '{decisions,0,action}'), 'accept', 'owner decision outcome is captured from durable messages');
select is((public.nz_owner_negotiation_rollup() #>> '{decisions,1,action}'), 'counter', 'automated decision outcome is captured from durable messages');
select is((public.nz_owner_negotiation_rollup() #>> '{latency,samples}')::bigint, 2::bigint, 'latency uses paired buyer-to-seller turns');
select is((public.nz_owner_negotiation_rollup() #>> '{latency,p50Ms}')::bigint, 4000::bigint, 'latency p50 is exact');
select is((public.nz_owner_negotiation_rollup() #>> '{latency,p95Ms}')::bigint, 5800::bigint, 'latency p95 is exact');
select is((public.nz_owner_negotiation_rollup() #>> '{latency,maxMs}')::bigint, 6000::bigint, 'latency max is exact');
select is(jsonb_array_length(public.nz_owner_negotiation_rollup() -> 'daily'), 30, 'daily series is bounded to thirty days');
select is((public.nz_owner_negotiation_rollup() #>> '{topOffers,0,proposals}')::bigint, 10::bigint, 'offer dimension uses the complete owner set');
select is((public.nz_owner_negotiation_rollup(null, null, 'a2000000-0000-0000-0000-000000000001') #>> '{counts,total}')::bigint, 10::bigint, 'owned listing filter is exact');
select is((public.nz_owner_negotiation_rollup(null, null, null, 'strategy') #>> '{counts,total}')::bigint, 10::bigint, 'search is applied inside the rollup');
select is((public.nz_owner_negotiation_rollup(clock_timestamp() + interval '1 day') #>> '{counts,total}')::bigint, 0::bigint, 'date filtering is applied inside the rollup');
select ok((public.nz_owner_negotiation_rollup() #>> '{backlog,oldestPendingAt}') is not null, 'oldest pending timestamp is exposed');
select throws_ok(
  $$select public.nz_owner_negotiation_rollup(null, null, 'a2000000-0000-0000-0000-000000000002')$$,
  'P0002', null, 'an owner cannot request another owner listing'
);
select throws_ok(
  $$select public.nz_owner_negotiation_rollup('2026-08-22', '2026-08-21')$$,
  '22023', null, 'invalid date ranges are rejected'
);
select is((select count(*) from public.agent_negotiations where owner_id = 'a1000000-0000-0000-0000-000000000002'), 0::bigint, 'RLS hides the other owner row from authenticated reads');

select * from finish();
rollback;
