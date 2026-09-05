-- This transaction is also included by checkout_session_privacy.test.sql in CI.
\set ON_ERROR_STOP on
begin;
set local plpgsql.check_asserts = on;
insert into auth.users(id, email, email_confirmed_at) values
 ('71000000-0000-4000-8000-000000000001','security-owner@example.invalid',now()),
 ('71000000-0000-4000-8000-000000000002','security-other@example.invalid',now());
insert into public.pages(id,owner_id,name,slug,is_published) values
 ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','Security fixture','high-priority-security-fixture',false);
insert into public.checkout_orders(id,owner_id,page_id,stripe_session_id,stripe_payment_intent_id,stripe_connect_account_id,amount_cents,currency,status,refunded_cents) values
 ('73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','cs_test_security_one','pi_security_one','acct_security',10000,'usd','paid',0),
 ('73000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','cs_test_security_two','pi_security_two','acct_security',10000,'usd','paid',0);
insert into public.agent_negotiations(id,owner_id,page_id,slug,offer_key,offer_name,offer_kind,stripe_payment_intent_id,amount_cents,currency,status,settlement_state,refunded_cents) values
 ('74000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','high-priority-security-fixture','test','Test service','services','pi_security_jpy',100000,'jpy','complete','auto',0);

-- A page owner can edit ordinary content, but cannot forge verification authority.
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","email":"security-owner@example.invalid"}',true);
set local role authenticated;
do $$
begin
  update public.pages set name='Owner edit' where id='72000000-0000-4000-8000-000000000001';
  assert found, 'owner fixture must be editable';
  begin
    update public.pages set verification_details='{"docs_provided":[{"id":"forged","status":"verified","public":true,"file_path":"other/private.pdf"}]}'
      where id='72000000-0000-4000-8000-000000000001';
    raise exception 'owner forged credential verification';
  exception when insufficient_privilege then null;
  end;
  assert not has_table_privilege('authenticated','public.refund_operations','insert'), 'refund reservations are server-only';
  assert not has_function_privilege('authenticated','public.nz_begin_refund(uuid,uuid,text,uuid,bigint,text)','execute'), 'refund RPC is server-only';
  assert not has_function_privilege('anon','public.nz_claim_stripe_event(text,text,text,jsonb,uuid)','execute'), 'event claims are server-only';
  assert not has_function_privilege('authenticated','public.nz_apply_payment_reversal(text,uuid,text,jsonb)','execute'), 'reconciliation is server-only';
end;
$$;
reset role;
set local role service_role;
do $$
declare a jsonb; b jsonb;
begin
  a := public.nz_begin_refund('75000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','order','73000000-0000-4000-8000-000000000001',2000,'usd');
  assert (a->>'amount_cents')::int=2000 and a->>'stripe_account'='acct_security', 'reservation binds amount and account';
  b := public.nz_begin_refund('75000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','order','73000000-0000-4000-8000-000000000001',2000,'usd');
  assert a->>'id'=b->>'id', 'retry reuses reservation';
  begin
    perform public.nz_begin_refund('75000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','order','73000000-0000-4000-8000-000000000001',3000,'usd');
    raise exception 'changed request accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.nz_begin_refund('75000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','order','73000000-0000-4000-8000-000000000001',2000,'usd');
    raise exception 'foreign owner accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.nz_begin_refund('75000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','order','73000000-0000-4000-8000-000000000001',3000,'usd');
    raise exception 'overlapping operation accepted' using errcode='XX000';
  exception when raise_exception then null; end;
  perform public.nz_record_refund('75000000-0000-4000-8000-000000000001','re_security_one','pending',2000);
  begin
    perform public.nz_complete_refund('75000000-0000-4000-8000-000000000001',2000);
    raise exception 'pending provider refund counted as settled' using errcode='XX000';
  exception when raise_exception then null; end;
  perform public.nz_record_refund('75000000-0000-4000-8000-000000000001','re_security_one','succeeded',2000);
  a := public.nz_complete_refund('75000000-0000-4000-8000-000000000001',2000);
  b := public.nz_complete_refund('75000000-0000-4000-8000-000000000001',2000);
  assert (a->>'refundedCents')::int=2000 and a=b, 'completion is replayable without adding twice';
  a := public.nz_begin_refund('75000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000001','order','73000000-0000-4000-8000-000000000001',null,'usd');
  assert (a->>'amount_cents')::int=8000, 'full refund reserves the remainder once';
  perform public.nz_record_refund('75000000-0000-4000-8000-000000000003','re_security_full','succeeded',8000);
  perform public.nz_complete_refund('75000000-0000-4000-8000-000000000003',10000);
  a := public.nz_begin_refund('75000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000001','order','73000000-0000-4000-8000-000000000001',null,'usd');
  assert a->>'state'='succeeded' and a->>'order_status'='refunded', 'lost full-refund response still replays after terminal status';
  a := public.nz_begin_refund('75000000-0000-4000-8000-000000000004','71000000-0000-4000-8000-000000000001','negotiation','74000000-0000-4000-8000-000000000001',200,'jpy');
  assert (a->>'captured_cents')::int=1000 and (a->>'amount_cents')::int=200, 'JPY uses Stripe smallest units';
end;
$$;

-- Stripe delivers cumulative snapshots out of order. Neither path can move back.
do $$
declare a jsonb;
begin
  perform public.nz_apply_payment_reversal('order','73000000-0000-4000-8000-000000000002','charge.refunded','{"amount":10000,"amount_refunded":6000}');
  a := public.nz_apply_payment_reversal('order','73000000-0000-4000-8000-000000000002','charge.refunded','{"amount":10000,"amount_refunded":2000}');
  assert a->>'changed'='false', 'older direct refund is ignored';
  assert (select refunded_cents=6000 from public.checkout_orders where id='73000000-0000-4000-8000-000000000002'), 'direct total never decreases';
  perform public.nz_apply_payment_reversal('negotiation','74000000-0000-4000-8000-000000000001','charge.refunded','{"amount":1000,"amount_refunded":600}');
  perform public.nz_apply_payment_reversal('negotiation','74000000-0000-4000-8000-000000000001','charge.refunded','{"amount":1000,"amount_refunded":200}');
  assert (select refunded_cents=600 from public.agent_negotiations where id='74000000-0000-4000-8000-000000000001'), 'negotiation total never decreases';
  perform public.nz_apply_payment_reversal('negotiation','74000000-0000-4000-8000-000000000001','charge.dispute.created','{"id":"dp_neg_security","status":"needs_response"}');
  update public.agent_negotiations set status='complete' where id='74000000-0000-4000-8000-000000000001';
  assert (select status='disputed' from public.agent_negotiations where id='74000000-0000-4000-8000-000000000001'), 'stale escrow completion cannot clear a dispute';
  perform public.nz_apply_payment_reversal('negotiation','74000000-0000-4000-8000-000000000001','charge.dispute.closed','{"id":"dp_neg_security","status":"won"}');
  assert (select status='complete' from public.agent_negotiations where id='74000000-0000-4000-8000-000000000001'), 'authoritative dispute win can restore a completed negotiation';
  perform public.nz_apply_payment_reversal('order','73000000-0000-4000-8000-000000000002','charge.dispute.closed','{"id":"dp_security","status":"won"}');
  a := public.nz_apply_payment_reversal('order','73000000-0000-4000-8000-000000000002','charge.dispute.created','{"id":"dp_security","status":"needs_response"}');
  assert a->>'changed'='false', 'closed dispute cannot reopen from an older event';
  assert (select status='dispute_won' from public.checkout_orders where id='73000000-0000-4000-8000-000000000002'), 'dispute outcome preserved';
  update public.checkout_orders set status='paid',metadata='{}' where id='73000000-0000-4000-8000-000000000002';
  assert (select status='dispute_won' and metadata #>> '{dispute_outcome,id}'='dp_security'
    from public.checkout_orders where id='73000000-0000-4000-8000-000000000002'), 'stale checkout preserves dispute state and evidence';
  update public.checkout_orders set status='paid',refunded_cents=0 where id='73000000-0000-4000-8000-000000000001';
  assert (select status='refunded' and refunded_cents=10000 from public.checkout_orders where id='73000000-0000-4000-8000-000000000001'), 'stale checkout write cannot undo full refund';
  assert not exists(select 1 from information_schema.columns where table_schema='public' and table_name='checkout_orders' and column_name='access_token'), 'checkout schema has no plaintext token';
end;
$$;

-- Crash, lease expiry, duplicate delivery, and stale-worker fencing.
do $$
begin
  assert public.nz_claim_stripe_event('evt_security','charge.refunded','acct_security','{}','76000000-0000-4000-8000-000000000001')='claimed', 'first worker claims event';
  assert public.nz_claim_stripe_event('evt_security','charge.refunded','acct_security','{}','76000000-0000-4000-8000-000000000002')='busy', 'concurrent worker must retry';
  update public.stripe_webhook_events set lease_expires_at=now()-interval '1 second' where event_id='evt_security';
  assert public.nz_claim_stripe_event('evt_security','charge.refunded','acct_security','{}','76000000-0000-4000-8000-000000000002')='claimed', 'crashed worker can be reclaimed';
  assert not public.nz_finish_stripe_event('evt_security','76000000-0000-4000-8000-000000000001'), 'old worker cannot complete new lease';
  assert public.nz_finish_stripe_event('evt_security','76000000-0000-4000-8000-000000000002','database failed'), 'known failure releases claim';
  assert public.nz_claim_stripe_event('evt_security','charge.refunded','acct_security','{}','76000000-0000-4000-8000-000000000003')='claimed', 'failed event remains retryable';
  assert public.nz_finish_stripe_event('evt_security','76000000-0000-4000-8000-000000000003'), 'only completed work is deduplicated';
  assert public.nz_claim_stripe_event('evt_security','charge.refunded','acct_security','{}','76000000-0000-4000-8000-000000000004')='completed', 'completed event replay is skipped';
  assert (select payload is null from public.stripe_webhook_events where event_id='evt_security'), 'completed event payload is cleared';
end;
$$;
reset role;
rollback;
