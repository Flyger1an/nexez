begin;

select plan(27);

select ok(
  not has_function_privilege('anon', 'public.nz_owner_analytics_rollup(timestamptz,timestamptz,uuid,text,text,text)', 'execute'),
  'anonymous callers cannot execute owner analytics rollups'
);
select ok(
  has_function_privilege('authenticated', 'public.nz_owner_analytics_rollup(timestamptz,timestamptz,uuid,text,text,text)', 'execute'),
  'authenticated owners can execute analytics rollups'
);

insert into auth.users (id) values
  ('91000000-0000-0000-0000-000000000001'),
  ('91000000-0000-0000-0000-000000000002');

insert into public.pages (id, owner_id, name, slug, currency) values
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Analytics Alpha', 'analytics-alpha', 'usd'),
  ('92000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000002', 'Analytics Other', 'analytics-other', 'usd');

insert into public.checkout_events (
  id, page_id, owner_id, slug, offer_key, offer_name, offer_kind, event_type,
  stripe_session_id, metadata, trust_level, ingestion_source, created_at
) values
  ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'analytics-alpha', 'services-0', 'Strategy', 'services', 'checkout_attempt', null, '{}', 'verified_server', 'qa', '2026-08-20T10:00:00Z'),
  ('93000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'analytics-alpha', 'services-0', 'Strategy', 'services', 'checkout_attempt', null, '{"dry_run":"malformed"}', 'legacy_unverified', 'legacy', '2026-08-20T10:01:00Z'),
  ('93000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'analytics-alpha', 'services-0', 'Strategy', 'services', 'stripe_session_created', 'cs_qa_1', '{"amount_cents":10000,"currency":"usd"}', 'verified_server', 'qa', '2026-08-20T10:02:00Z'),
  ('93000000-0000-0000-0000-000000000004', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'analytics-alpha', 'services-0', 'Strategy', 'services', 'stripe_session_created', 'cs_qa_1', '{"amount_cents":10000,"currency":"usd"}', 'legacy_unverified', 'legacy', '2026-08-20T10:03:00Z'),
  ('93000000-0000-0000-0000-000000000005', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'analytics-alpha', 'page', 'Analytics Alpha', 'services', 'directory_click', null, '{}', 'unverified_client', 'legacy', '2026-08-20T10:04:00Z'),
  ('93000000-0000-0000-0000-000000000006', '92000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000002', 'analytics-other', 'services-0', 'Other', 'services', 'checkout_attempt', null, '{}', 'verified_server', 'qa', '2026-08-20T10:00:00Z');

insert into public.agent_visits (
  id, page_id, owner_id, slug, path, is_ai_agent, agent_type, confidence_score,
  detection_signals, trust_level, ingestion_source, created_at
) values
  ('94000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'analytics-alpha', '/analytics-alpha', true, 'ChatGPT-Agent', 95, '{}', 'verified_server', 'qa', '2026-08-20T09:00:00Z'),
  ('94000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'analytics-alpha', '/analytics-alpha', false, 'Human/Unknown', 0, '{}', 'legacy_unverified', 'legacy', '2026-08-20T09:05:00Z'),
  ('94000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000002', 'analytics-other', '/analytics-other', true, 'Claude-Agent', 90, '{}', 'verified_server', 'qa', '2026-08-20T09:00:00Z');

insert into public.checkout_orders (
  id, owner_id, page_id, slug, offer_name, offer_key, stripe_session_id,
  amount_cents, refunded_cents, currency, application_fee_cents, status, channel,
  stripe_livemode, created_at
) values
  ('95000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'analytics-alpha', 'Strategy', 'services-0', 'cs_qa_1', 10000, 0, 'usd', 600, 'paid', 'agent_checkout', true, '2026-08-20T10:10:00Z'),
  ('95000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'analytics-alpha', 'Strategy', 'services-0', null, 5000, 5000, 'usd', 300, 'refunded', 'acp', true, '2026-08-20T10:11:00Z'),
  ('95000000-0000-0000-0000-000000000003', '91000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'analytics-alpha', 'Strategy', 'services-0', 'cs_test', 99999, 0, 'usd', 0, 'paid', 'agent_checkout', false, '2026-08-20T10:12:00Z'),
  ('95000000-0000-0000-0000-000000000004', '91000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000002', 'analytics-other', 'Other', 'services-0', 'cs_other', 7777, 0, 'usd', 0, 'paid', 'agent_checkout', true, '2026-08-20T10:10:00Z');

insert into public.agent_negotiations (
  id, page_id, owner_id, slug, offer_key, offer_name, offer_kind, status, currency, created_at
) values
  ('96000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'analytics-alpha', 'services-0', 'Strategy', 'services', 'negotiation', 'usd', '2026-08-20T08:00:00Z'),
  ('96000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'analytics-alpha', 'services-0', 'Strategy', 'services', 'complete', 'usd', '2026-08-20T08:01:00Z'),
  ('96000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000002', 'analytics-other', 'services-0', 'Other', 'services', 'complete', 'usd', '2026-08-20T08:02:00Z');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{schemaVersion}')::integer, 1, 'rollup returns the supported schema');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{counts,events}')::bigint, 5::bigint, 'owner event count is exact and RLS scoped');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{counts,visits}')::bigint, 2::bigint, 'owner visit count excludes other owners');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{counts,aiVisits}')::bigint, 1::bigint, 'AI visits are classified separately');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{counts,checkoutAttempts}')::bigint, 2::bigint, 'malformed dry-run metadata cannot break or suppress a real intent');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{counts,checkoutStarts}')::bigint, 1::bigint, 'duplicate Stripe session events collapse to one checkout start');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{counts,checkoutHandoffs}')::bigint, 2::bigint, 'checkout handoffs remain an explicit event metric, not paid conversion');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{counts,paidOrders}')::bigint, 2::bigint, 'live paid order ledger includes direct and protocol orders');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{counts,paidDirectOrders}')::bigint, 1::bigint, 'direct checkout numerator excludes protocol orders');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{counts,retainedDirectOrders}')::bigint, 1::bigint, 'retained direct payment count is explicit');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{trust,events,verified}')::bigint, 2::bigint, 'event trust coverage counts verified rows');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{trust,events,unverified}')::bigint, 1::bigint, 'event trust coverage exposes unverified rows');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{counts,negotiations}')::bigint, 2::bigint, 'negotiations respect owner and date scope');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21', null, 'strategy') #>> '{counts,events}')::bigint, 4::bigint, 'search is applied inside the exact rollup');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21', null, null, null, 'ai') #>> '{counts,visits}')::bigint, 1::bigint, 'traffic filter is applied inside the exact rollup');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21', null, null, 'directory_click') #>> '{counts,paidOrders}')::bigint, 0::bigint, 'event-only filters do not leak unrelated paid orders');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{currencies,0,gmvCents}')::bigint, 15000::bigint, 'currency rollup uses live durable GMV only');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{currencies,0,refundedCents}')::bigint, 5000::bigint, 'currency rollup exposes refunds separately');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{agentTypes,0,agentType}'), 'ChatGPT-Agent', 'agent-type dimension is exact');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{topPages,0,pageId}'), '92000000-0000-0000-0000-000000000001', 'top listing dimension is owner scoped');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{topOffers,0,attempts}')::bigint, 2::bigint, 'offer dimension carries exact checkout attempts');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{topOffers,0,paidOrders}')::bigint, 1::bigint, 'offer dimension carries matched direct paid orders');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{daily,0,paidOrders}')::bigint, 2::bigint, 'daily series is derived from the full paid-order ledger');
select is((public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21') #>> '{activePageIds,0}'), '92000000-0000-0000-0000-000000000001', 'engaged listing ids are complete and owner scoped');
select throws_ok(
  $$select public.nz_owner_analytics_rollup('2026-08-20', '2026-08-21', '92000000-0000-0000-0000-000000000002')$$,
  'P0002', null, 'an owner cannot request another owner listing'
);

select * from finish();
rollback;
