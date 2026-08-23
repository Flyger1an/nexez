-- Apply the reviewed least-privilege and staged-commitment protections separately so
-- development databases that already ran the foundation migration reach the same
-- state as a fresh migration replay.

revoke delete on public.checkout_order_fulfillments from service_role;
revoke update, delete on public.checkout_order_events from service_role;

create or replace function public.capture_checkout_order_fulfillment_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.checkout_order_events (
    order_id,
    owner_id,
    event_type,
    source,
    actor_user_id,
    idempotency_key,
    metadata,
    created_at
  ) values (
    new.order_id,
    new.owner_id,
    'fulfillment_updated',
    case when new.updated_by is null then 'system' else 'merchant' end,
    new.updated_by,
    'fulfillment:' || new.version::text,
    jsonb_build_object(
      'fromStatus', case when tg_op = 'UPDATE' then old.status else null end,
      'toStatus', new.status,
      'version', new.version
    ),
    new.updated_at
  ) on conflict (order_id, idempotency_key) where idempotency_key is not null do nothing;
  return new;
end;
$$;

create or replace function public.capture_checkout_order_insert_events()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  obligation_kind text;
begin
  if new.staged_settlement_obligation_id is not null then
    select kind into obligation_kind
    from public.staged_settlement_obligations
    where id = new.staged_settlement_obligation_id;
  end if;

  if obligation_kind is distinct from 'commitment' then
    insert into public.checkout_order_fulfillments (order_id, owner_id, status)
    values (new.id, new.owner_id, 'not_started')
    on conflict (order_id) do nothing;
  end if;

  insert into public.checkout_order_events (
    order_id, owner_id, event_type, source, idempotency_key, metadata, created_at
  ) values
    (
      new.id,
      new.owner_id,
      'order_recorded',
      'system',
      'order:recorded',
      jsonb_build_object('channel', new.channel),
      new.created_at
    ),
    (
      new.id,
      new.owner_id,
      'payment_confirmed',
      'stripe',
      'payment:confirmed',
      jsonb_build_object(
        'amountCents', new.amount_cents,
        'currency', new.currency,
        'livemode', new.stripe_livemode
      ),
      new.created_at
    )
  on conflict (order_id, idempotency_key) where idempotency_key is not null do nothing;
  return new;
end;
$$;
