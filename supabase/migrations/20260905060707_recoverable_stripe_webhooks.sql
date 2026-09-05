-- Receipt is not completion. Historical receipts become reclaimable on redelivery;
-- no historical event is automatically replayed by this migration.
alter table public.stripe_webhook_events
  add column state text not null default 'received' check (state in ('received', 'processing', 'completed')),
  add column payload jsonb,
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column attempts integer not null default 0,
  add column completed_at timestamptz,
  add column last_error text;
revoke all on public.stripe_webhook_events from public, anon, authenticated;
grant select, insert, update on public.stripe_webhook_events to service_role;
create index stripe_webhook_events_pending on public.stripe_webhook_events(lease_expires_at, received_at)
  where state <> 'completed';

create function public.nz_claim_stripe_event(
  p_event_id text, p_type text, p_account text, p_payload jsonb, p_lease_token uuid
) returns text language plpgsql security invoker set search_path = '' as $$
declare v_event public.stripe_webhook_events;
begin
  if p_event_id is null or p_lease_token is null then raise exception 'Missing event identity.'; end if;
  insert into public.stripe_webhook_events(event_id, type, account, payload)
    values (p_event_id, p_type, p_account, p_payload) on conflict (event_id) do nothing;
  select * into v_event from public.stripe_webhook_events where event_id = p_event_id for update;
  if v_event.type is distinct from p_type or v_event.account is distinct from p_account then
    raise exception 'Event identity conflict.';
  end if;
  if v_event.state = 'completed' then return 'completed'; end if;
  if v_event.state = 'processing' and v_event.lease_expires_at > clock_timestamp() then return 'busy'; end if;
  update public.stripe_webhook_events set state = 'processing', payload = p_payload,
    lease_token = p_lease_token, lease_expires_at = clock_timestamp() + interval '5 minutes',
    attempts = attempts + 1, last_error = null where event_id = p_event_id;
  return 'claimed';
end;
$$;

create function public.nz_finish_stripe_event(p_event_id text, p_lease_token uuid, p_error text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.stripe_webhook_events set
    state = case when p_error is null then 'completed' else 'received' end,
    completed_at = case when p_error is null then clock_timestamp() else null end,
    payload = case when p_error is null then null else payload end,
    last_error = left(p_error, 500), lease_token = null, lease_expires_at = null
    where event_id = p_event_id and state = 'processing' and lease_token = p_lease_token
      and lease_expires_at > clock_timestamp();
  return found;
end;
$$;
revoke all on function public.nz_claim_stripe_event(text, text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.nz_finish_stripe_event(text, uuid, text) from public, anon, authenticated;
grant execute on function public.nz_claim_stripe_event(text, text, text, jsonb, uuid) to service_role;
grant execute on function public.nz_finish_stripe_event(text, uuid, text) to service_role;

-- Serialize all reversal updates with owner refund completion. Metadata is built
-- from the locked current row, never a stale application SELECT snapshot.
create function public.nz_apply_payment_reversal(p_kind text, p_target_id uuid, p_type text, p_object jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_table text;
  v_old jsonb;
  v_meta jsonb;
  v_status text;
  v_total bigint;
  v_incoming bigint;
  v_amount bigint;
  v_dispute_id text;
  v_dispute_status text;
  v_now timestamptz := clock_timestamp();
begin
  v_table := case p_kind when 'order' then 'checkout_orders' when 'negotiation' then 'agent_negotiations' end;
  if v_table is null then raise exception 'Invalid payment kind.'; end if;
  execute format('select to_jsonb(r) from public.%I r where id = $1 for update', v_table) into v_old using p_target_id;
  if v_old is null then raise exception 'Payment not found.'; end if;
  v_meta := coalesce(v_old->'metadata', '{}'::jsonb);
  v_status := v_old->>'status';
  v_total := coalesce((v_old->>'refunded_cents')::bigint, 0);
  if p_type = 'charge.refunded' then
    v_incoming := (p_object->>'amount_refunded')::bigint;
    v_amount := (p_object->>'amount')::bigint;
    if v_incoming is null or v_amount is null or v_amount <= 0 or v_incoming < 0 or v_incoming > v_amount then
      raise exception 'Invalid provider refund totals.';
    end if;
    if v_incoming <= v_total then return jsonb_build_object('changed', false, 'before', v_old); end if;
    v_total := v_incoming;
    if v_total >= v_amount then v_status := 'refunded'; end if;
    v_meta := v_meta || jsonb_build_object(case when v_total >= v_amount then 'refund' else 'partial_refund' end,
      jsonb_build_object('source', 'stripe_webhook', 'amount_cents', v_total, 'at', v_now));
  elsif p_type in ('charge.dispute.created', 'charge.dispute.closed') then
    v_dispute_id := p_object->>'id';
    v_dispute_status := p_object->>'status';
    if v_dispute_id is null then raise exception 'Missing dispute identity.'; end if;
    if v_dispute_status in ('won', 'lost') then
      if v_meta #>> '{dispute_outcome,id}' = v_dispute_id then
        return jsonb_build_object('changed', false, 'before', v_old);
      end if;
      v_status := case when v_dispute_status = 'lost' then 'refunded'
        when v_status = 'refunded' then 'refunded'
        when p_kind = 'order' then 'dispute_won' else 'complete' end;
      v_meta := v_meta || jsonb_build_object('dispute_outcome',
        jsonb_build_object('id', v_dispute_id, 'result', v_dispute_status, 'at', v_now));
    else
      if p_type = 'charge.dispute.closed' or v_meta #>> '{dispute_outcome,id}' = v_dispute_id
        or v_status = 'refunded' then
        return jsonb_build_object('changed', false, 'before', v_old);
      end if;
      v_status := 'disputed';
      v_meta := v_meta || jsonb_build_object('dispute', jsonb_build_object('id', v_dispute_id,
        'status', v_dispute_status, 'reason', p_object->>'reason', 'amount_cents', p_object->'amount', 'at', v_now));
    end if;
  elsif p_type = 'payment_intent.canceled' and v_status = 'held' then
    v_status := 'declined';
  else return jsonb_build_object('changed', false, 'before', v_old);
  end if;
  execute format('update public.%I set status = $1, refunded_cents = $2, metadata = $3, updated_at = $4 where id = $5', v_table)
    using v_status, v_total, v_meta, v_now, p_target_id;
  -- The linked obligation must commit with its order, so a retry cannot skip half
  -- of a reversal after the order already changed.
  if p_kind = 'order' and nullif(v_old->>'staged_settlement_obligation_id', '') is not null then
    update public.staged_settlement_obligations set
      status = case v_status when 'dispute_won' then 'paid' else v_status end,
      refunded_at = case when v_status = 'refunded' then v_now else refunded_at end,
      disputed_at = case when v_status = 'disputed' then v_now when v_status = 'dispute_won' then null else disputed_at end,
      updated_at = v_now
      where id = (v_old->>'staged_settlement_obligation_id')::uuid
        and stripe_payment_intent_id = v_old->>'stripe_payment_intent_id';
    if not found then raise exception 'Linked obligation did not match the payment.'; end if;
  end if;
  return jsonb_build_object('changed', true, 'before', v_old, 'status', v_status, 'refunded_cents', v_total);
end;
$$;
revoke all on function public.nz_apply_payment_reversal(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.nz_apply_payment_reversal(text, uuid, text, jsonb) to service_role;

-- Also protect against older checkout/capture writes and other ledger writers.
create function private.nz_guard_refund_total()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.refunded_cents := greatest(coalesce(old.refunded_cents, 0), coalesce(new.refunded_cents, 0));
  if old.status = 'refunded' then new.status := 'refunded'; end if;
  if old.status in ('disputed', 'dispute_won') and new.status in ('paid', 'held', 'complete') then
    if not (old.status = 'disputed' and new.status = 'complete'
      and coalesce(new.metadata #>> '{dispute_outcome,result}', '') = 'won'
      and new.metadata #>> '{dispute_outcome,id}' is not null
      and new.metadata #>> '{dispute_outcome,id}' is distinct from old.metadata #>> '{dispute_outcome,id}') then
      new.status := old.status;
    end if;
  end if;
  -- Stale checkout upserts may also carry metadata from before the reversal.
  -- Preserve reversal evidence whenever the proposed write drops those keys.
  new.metadata := coalesce(new.metadata, '{}'::jsonb) || (
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from jsonb_each(coalesce(old.metadata, '{}'::jsonb))
    where key in ('refund', 'partial_refund', 'dispute', 'dispute_outcome')
      and not coalesce(new.metadata, '{}'::jsonb) ? key
  );
  return new;
end;
$$;
revoke all on function private.nz_guard_refund_total() from public, anon, authenticated;
create trigger nz_guard_refund_total before update on public.checkout_orders
  for each row execute function private.nz_guard_refund_total();
create trigger nz_guard_refund_total before update on public.agent_negotiations
  for each row execute function private.nz_guard_refund_total();
