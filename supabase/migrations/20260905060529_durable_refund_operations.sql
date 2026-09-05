-- A refund is an immutable user operation. Keep unresolved operations reserved
-- until Stripe proves their outcome; never mint a new key for an uncertain retry.
-- Fresh Supabase projects no longer guarantee historical default table grants.
-- Declare the server writer's existing contract explicitly; client grants stay
-- unchanged and all new refund operations remain service-only.
grant select, insert, update on public.checkout_orders, public.agent_negotiations to service_role;

create table public.refund_operations (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.checkout_orders(id) on delete cascade,
  negotiation_id uuid references public.agent_negotiations(id) on delete cascade,
  requested_cents bigint,
  amount_cents bigint not null check (amount_cents > 0),
  captured_cents bigint not null check (captured_cents > 0),
  base_refunded_cents bigint not null check (base_refunded_cents >= 0),
  currency text not null,
  payment_intent_id text not null,
  stripe_account text,
  state text not null default 'reserved' check (state in ('reserved', 'submitted', 'succeeded', 'failed')),
  provider_refund_id text unique,
  provider_status text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((order_id is null) <> (negotiation_id is null)),
  check (requested_cents is null or requested_cents > 0)
);
alter table public.refund_operations enable row level security;
revoke all on public.refund_operations from public, anon, authenticated;
grant select, insert, update on public.refund_operations to service_role;
create index refund_operations_owner on public.refund_operations(owner_id);
create index refund_operations_order on public.refund_operations(order_id);
create index refund_operations_negotiation on public.refund_operations(negotiation_id);
create unique index refund_operations_one_pending_order on public.refund_operations(order_id)
  where state in ('reserved', 'submitted');
create unique index refund_operations_one_pending_negotiation on public.refund_operations(negotiation_id)
  where state in ('reserved', 'submitted');

create function public.nz_begin_refund(
  p_operation_id uuid, p_owner_id uuid, p_kind text, p_target_id uuid,
  p_requested_cents bigint, p_currency text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_table text;
  v_target jsonb;
  v_op public.refund_operations;
  v_captured bigint;
  v_refunded bigint;
  v_amount bigint;
  v_account text;
  v_currency text;
begin
  v_table := case p_kind when 'order' then 'checkout_orders' when 'negotiation' then 'agent_negotiations' end;
  if v_table is null or p_operation_id is null then raise exception 'Invalid refund operation.'; end if;
  execute format('select to_jsonb(r) from public.%I r where id = $1 and owner_id = $2 for update', v_table)
    into v_target using p_target_id, p_owner_id;
  if v_target is null then raise exception 'Order not found.' using errcode = '42501'; end if;
  v_currency := lower(coalesce(v_target->>'currency', 'usd'));
  if v_currency <> p_currency then raise exception 'The payment currency changed. Reload this order.'; end if;
  select * into v_op from public.refund_operations where id = p_operation_id for update;
  if found then
    if v_op.owner_id <> p_owner_id
      or coalesce(v_op.order_id, v_op.negotiation_id) <> p_target_id
      or (v_op.order_id is not null) <> (p_kind = 'order')
      or v_op.requested_cents is distinct from p_requested_cents
      or v_op.currency <> p_currency then
      raise exception 'Refund operation does not match its original request.' using errcode = '22023';
    end if;
    -- Replay before checking terminal order status: a completed full refund is
    -- still the same successful operation after its HTTP response is lost.
    return to_jsonb(v_op) || jsonb_build_object('order_status', v_target->>'status',
      'refunded_cents', coalesce((v_target->>'refunded_cents')::bigint, 0));
  end if;
  if v_target->>'status' <> (case p_kind when 'order' then 'paid' else 'complete' end)
    or nullif(v_target->>'stripe_payment_intent_id', '') is null then
    raise exception 'Only a captured payment can be refunded.';
  end if;
  if exists (select 1 from public.refund_operations
      where (case p_kind when 'order' then order_id else negotiation_id end) = p_target_id
        and state in ('reserved', 'submitted')) then
    raise exception 'Another refund is awaiting reconciliation. Retry that operation first.';
  end if;
  v_captured := coalesce((v_target->>'amount_cents')::bigint, 0);
  if p_kind = 'negotiation' and v_currency = any(array[
    'bif','clp','djf','gnf','jpy','kmf','krw','mga','pyg','rwf','vnd','vuv','xaf','xof','xpf'
  ]) then v_captured := round(v_captured::numeric / 100)::bigint; end if;
  v_refunded := coalesce((v_target->>'refunded_cents')::bigint, 0);
  v_amount := coalesce(p_requested_cents, v_captured - v_refunded);
  if v_amount <= 0 or v_amount > v_captured - v_refunded then
    raise exception 'Refund amount exceeds the refundable remainder.';
  end if;
  if p_kind = 'order' then v_account := v_target->>'stripe_connect_account_id';
  else
    select stripe_connect_account_id into v_account from public.billing_subscriptions where owner_id = p_owner_id;
  end if;
  insert into public.refund_operations (
    id, owner_id, order_id, negotiation_id, requested_cents, amount_cents,
    captured_cents, base_refunded_cents, currency, payment_intent_id, stripe_account
  ) values (
    p_operation_id, p_owner_id, case when p_kind = 'order' then p_target_id end,
    case when p_kind = 'negotiation' then p_target_id end, p_requested_cents,
    v_amount, v_captured, v_refunded, v_currency, v_target->>'stripe_payment_intent_id', v_account
  ) returning * into v_op;
  return to_jsonb(v_op) || jsonb_build_object('order_status', v_target->>'status', 'refunded_cents', v_refunded);
end;
$$;

-- Save the provider identity before fetching the charge. Later retries retrieve
-- this refund directly, including after Stripe's idempotency retention window.
create function public.nz_record_refund(
  p_operation_id uuid, p_refund_id text, p_provider_status text, p_amount_cents bigint
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_op public.refund_operations;
begin
  select * into v_op from public.refund_operations where id = p_operation_id for update;
  if not found or p_refund_id is null or v_op.amount_cents <> p_amount_cents
    or (v_op.provider_refund_id is not null and v_op.provider_refund_id <> p_refund_id) then
    raise exception 'Provider refund does not match the reserved operation.';
  end if;
  if v_op.state = 'succeeded' then return to_jsonb(v_op); end if;
  update public.refund_operations set provider_refund_id = p_refund_id,
    provider_status = p_provider_status,
    state = case when p_provider_status in ('failed', 'canceled') then 'failed' else 'submitted' end,
    updated_at = clock_timestamp()
    where id = p_operation_id returning * into v_op;
  return to_jsonb(v_op);
end;
$$;

create function public.nz_complete_refund(p_operation_id uuid, p_provider_total bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_op public.refund_operations;
  v_table text;
  v_target jsonb;
  v_total bigint;
  v_status text;
  v_meta jsonb;
begin
  select * into v_op from public.refund_operations where id = p_operation_id;
  if not found then raise exception 'Refund operation not found.'; end if;
  v_table := case when v_op.order_id is not null then 'checkout_orders' else 'agent_negotiations' end;
  -- All operations that lock both objects take the order lock before the operation.
  execute format('select to_jsonb(r) from public.%I r where id = $1 for update', v_table)
    into v_target using coalesce(v_op.order_id, v_op.negotiation_id);
  select * into v_op from public.refund_operations where id = p_operation_id for update;
  if v_op.provider_status <> 'succeeded' or v_op.provider_refund_id is null then
    raise exception 'Refund has not succeeded at the provider.';
  end if;
  if p_provider_total is null or p_provider_total < v_op.base_refunded_cents + v_op.amount_cents
    or p_provider_total > v_op.captured_cents then
    raise exception 'Provider refund total requires reconciliation.';
  end if;
  v_total := greatest(coalesce((v_target->>'refunded_cents')::bigint, 0), p_provider_total);
  v_status := case when v_total >= v_op.captured_cents then 'refunded' else v_target->>'status' end;
  v_meta := coalesce(v_target->'metadata', '{}'::jsonb) || jsonb_build_object(
    case when v_total >= v_op.captured_cents then 'refund' else 'partial_refund' end,
    jsonb_build_object('id', v_op.provider_refund_id, 'last_refund_id', v_op.provider_refund_id,
      'operation_id', v_op.id, 'amount_cents', v_total, 'source', 'owner_action', 'at', clock_timestamp()));
  execute format('update public.%I set refunded_cents = $1, status = $2, metadata = $3, updated_at = clock_timestamp() where id = $4', v_table)
    using v_total, v_status, v_meta, coalesce(v_op.order_id, v_op.negotiation_id);
  update public.refund_operations set state = 'succeeded', updated_at = clock_timestamp() where id = p_operation_id;
  return jsonb_build_object('ok', true, 'status', v_status, 'refundId', v_op.provider_refund_id,
    'refundedCents', v_total, 'fully', v_total >= v_op.captured_cents, 'operationId', v_op.id);
end;
$$;

revoke all on function public.nz_begin_refund(uuid, uuid, text, uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.nz_record_refund(uuid, text, text, bigint) from public, anon, authenticated;
revoke all on function public.nz_complete_refund(uuid, bigint) from public, anon, authenticated;
grant execute on function public.nz_begin_refund(uuid, uuid, text, uuid, bigint, text) to service_role;
grant execute on function public.nz_record_refund(uuid, text, text, bigint) to service_role;
grant execute on function public.nz_complete_refund(uuid, bigint) to service_role;
