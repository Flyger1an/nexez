-- Merchant order operations stay separate from the immutable checkout money ledger.
-- Fulfillment is a one-to-one operational projection, while activity is append-only
-- evidence for the merchant timeline. Negotiated escrow remains outside this model.

create table public.checkout_order_fulfillments (
  order_id uuid primary key references public.checkout_orders(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('not_started', 'in_progress', 'fulfilled')),
  version bigint not null default 1 check (version > 0),
  started_at timestamptz,
  fulfilled_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'not_started' or (started_at is null and fulfilled_at is null)),
  check (status <> 'in_progress' or (started_at is not null and fulfilled_at is null)),
  check (status <> 'fulfilled' or fulfilled_at is not null)
);

comment on table public.checkout_order_fulfillments is
  'Merchant-controlled operational state for direct checkout orders. Payment state remains authoritative on checkout_orders.';

create index checkout_order_fulfillments_owner_updated_idx
  on public.checkout_order_fulfillments (owner_id, updated_at desc);

alter table public.checkout_order_fulfillments enable row level security;
revoke all on public.checkout_order_fulfillments from anon, authenticated;
grant select on public.checkout_order_fulfillments to authenticated;
grant select, insert, update on public.checkout_order_fulfillments to service_role;

create policy checkout_order_fulfillments_owner_select
  on public.checkout_order_fulfillments
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create table public.checkout_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.checkout_orders(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'order_recorded',
    'payment_confirmed',
    'fulfillment_updated',
    'refund_recorded',
    'dispute_opened',
    'dispute_resolved',
    'buyer_request_received',
    'buyer_request_updated',
    'review_received',
    'resource_reserved',
    'resource_fulfilled'
  )),
  source text not null check (source in ('system', 'merchant', 'buyer', 'stripe')),
  actor_user_id uuid references auth.users(id) on delete set null,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

comment on table public.checkout_order_events is
  'Append-only merchant audit trail for direct checkout order operations and externally proven money changes.';

create index checkout_order_events_order_created_idx
  on public.checkout_order_events (order_id, created_at desc);
create index checkout_order_events_owner_created_idx
  on public.checkout_order_events (owner_id, created_at desc);
create unique index checkout_order_events_idempotency_uidx
  on public.checkout_order_events (order_id, idempotency_key)
  where idempotency_key is not null;

alter table public.checkout_order_events enable row level security;
revoke all on public.checkout_order_events from anon, authenticated;
grant select on public.checkout_order_events to authenticated;
grant select, insert on public.checkout_order_events to service_role;

create policy checkout_order_events_owner_select
  on public.checkout_order_events
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create function public.enforce_checkout_order_event_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'checkout order events are append-only' using errcode = '55000';
end;
$$;

create trigger checkout_order_events_append_only
before update or delete on public.checkout_order_events
for each row execute function public.enforce_checkout_order_event_append_only();

create function public.enforce_checkout_order_fulfillment_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  prior_started_at timestamptz;
begin
  if tg_op = 'UPDATE' then
    if row(new.order_id, new.owner_id) is distinct from row(old.order_id, old.owner_id) then
      raise exception 'checkout order fulfillment identity is immutable' using errcode = '23514';
    end if;
    if new.status is distinct from old.status and not (
      (old.status = 'not_started' and new.status in ('in_progress', 'fulfilled'))
      or (old.status = 'in_progress' and new.status in ('not_started', 'fulfilled'))
      or (old.status = 'fulfilled' and new.status = 'in_progress')
    ) then
      raise exception 'invalid checkout order fulfillment transition: % -> %', old.status, new.status
        using errcode = '23514';
    end if;
    new.version := old.version + 1;
    prior_started_at := old.started_at;
  end if;

  if new.status = 'not_started' then
    new.started_at := null;
    new.fulfilled_at := null;
  elsif new.status = 'in_progress' then
    new.started_at := coalesce(new.started_at, prior_started_at, now());
    new.fulfilled_at := null;
  elsif new.status = 'fulfilled' then
    new.started_at := coalesce(new.started_at, prior_started_at, now());
    new.fulfilled_at := coalesce(new.fulfilled_at, now());
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger checkout_order_fulfillment_transition
before insert or update on public.checkout_order_fulfillments
for each row execute function public.enforce_checkout_order_fulfillment_transition();

create function public.capture_checkout_order_fulfillment_event()
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

create trigger checkout_order_fulfillment_event
after insert or update of status on public.checkout_order_fulfillments
for each row execute function public.capture_checkout_order_fulfillment_event();

create function public.capture_checkout_order_insert_events()
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

create trigger checkout_order_insert_events
after insert on public.checkout_orders
for each row execute function public.capture_checkout_order_insert_events();

create function public.capture_checkout_order_money_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  event_source text;
begin
  if coalesce(new.refunded_cents, 0) > coalesce(old.refunded_cents, 0) then
    event_source := case
      when coalesce(new.metadata -> 'refund' ->> 'source', new.metadata -> 'partial_refund' ->> 'source') = 'owner_action'
        then 'merchant'
      else 'stripe'
    end;
    insert into public.checkout_order_events (
      order_id, owner_id, event_type, source, idempotency_key, metadata, created_at
    ) values (
      new.id,
      new.owner_id,
      'refund_recorded',
      event_source,
      'refund:total:' || new.refunded_cents::text,
      jsonb_build_object(
        'refundedCents', new.refunded_cents,
        'previousRefundedCents', coalesce(old.refunded_cents, 0),
        'fullyRefunded', new.status = 'refunded'
      ),
      new.updated_at
    ) on conflict (order_id, idempotency_key) where idempotency_key is not null do nothing;
  end if;

  if new.status = 'disputed' and old.status is distinct from new.status then
    insert into public.checkout_order_events (
      order_id, owner_id, event_type, source, idempotency_key, metadata, created_at
    ) values (
      new.id,
      new.owner_id,
      'dispute_opened',
      'stripe',
      'dispute:opened',
      jsonb_build_object('reason', new.metadata -> 'dispute' ->> 'reason'),
      new.updated_at
    ) on conflict (order_id, idempotency_key) where idempotency_key is not null do nothing;
  end if;

  if new.status in ('dispute_won', 'refunded')
    and old.status = 'disputed'
    and old.status is distinct from new.status then
    insert into public.checkout_order_events (
      order_id, owner_id, event_type, source, idempotency_key, metadata, created_at
    ) values (
      new.id,
      new.owner_id,
      'dispute_resolved',
      'stripe',
      'dispute:resolved',
      jsonb_build_object('outcome', case when new.status = 'dispute_won' then 'won' else 'lost' end),
      new.updated_at
    ) on conflict (order_id, idempotency_key) where idempotency_key is not null do nothing;
  end if;
  return new;
end;
$$;

create trigger checkout_order_money_events
after update of status, refunded_cents on public.checkout_orders
for each row execute function public.capture_checkout_order_money_event();

create function public.capture_checkout_order_request_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.order_kind <> 'checkout' then return new; end if;

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
    case when tg_op = 'INSERT' then 'buyer_request_received' else 'buyer_request_updated' end,
    case when tg_op = 'INSERT' then 'buyer' else 'merchant' end,
    null,
    case
      when tg_op = 'INSERT' then 'request:' || new.id::text || ':received'
      else 'request:' || new.id::text || ':status:' || new.status
    end,
    jsonb_build_object('requestId', new.id, 'kind', new.kind, 'status', new.status),
    case when tg_op = 'INSERT' then new.created_at else new.updated_at end
  ) on conflict (order_id, idempotency_key) where idempotency_key is not null do nothing;
  return new;
end;
$$;

create trigger checkout_order_request_event
after insert or update of status on public.order_requests
for each row execute function public.capture_checkout_order_request_event();

create function public.capture_checkout_order_review_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.order_kind <> 'checkout' then return new; end if;
  insert into public.checkout_order_events (
    order_id, owner_id, event_type, source, idempotency_key, metadata, created_at
  ) values (
    new.order_id,
    new.owner_id,
    'review_received',
    'buyer',
    'review:' || new.id::text,
    jsonb_build_object('reviewId', new.id, 'rating', new.rating, 'status', new.status),
    new.created_at
  ) on conflict (order_id, idempotency_key) where idempotency_key is not null do nothing;
  return new;
end;
$$;

create trigger checkout_order_review_event
after insert on public.order_reviews
for each row execute function public.capture_checkout_order_review_event();

create function public.capture_checkout_order_resource_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_order public.checkout_orders;
  target_event text;
begin
  if new.checkout_order_id is null then return new; end if;
  if tg_op = 'UPDATE' then
    if new.checkout_order_id is not distinct from old.checkout_order_id
      and new.status is not distinct from old.status then
      return new;
    end if;
  end if;

  select * into target_order
  from public.checkout_orders
  where id = new.checkout_order_id;
  if not found then return new; end if;

  target_event := case when new.status = 'fulfilled' then 'resource_fulfilled' else 'resource_reserved' end;
  insert into public.checkout_order_events (
    order_id, owner_id, event_type, source, idempotency_key, metadata, created_at
  ) values (
    target_order.id,
    target_order.owner_id,
    target_event,
    'system',
    'resource:' || new.id::text || ':' || new.status,
    jsonb_build_object('reservationId', new.id, 'status', new.status),
    new.updated_at
  ) on conflict (order_id, idempotency_key) where idempotency_key is not null do nothing;
  return new;
end;
$$;

create trigger checkout_order_resource_event
after insert or update of checkout_order_id, status on public.resource_reservations
for each row execute function public.capture_checkout_order_resource_event();

create function public.transition_checkout_order_fulfillment(
  p_order_id uuid,
  p_owner_id uuid,
  p_status text,
  p_actor_user_id uuid
)
returns public.checkout_order_fulfillments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_order public.checkout_orders;
  obligation_kind text;
  result_row public.checkout_order_fulfillments;
begin
  if p_status not in ('not_started', 'in_progress', 'fulfilled') then
    raise exception 'invalid fulfillment status' using errcode = '22023';
  end if;

  select * into target_order
  from public.checkout_orders
  where id = p_order_id and owner_id = p_owner_id
  for update;
  if not found then
    raise exception 'checkout order not found' using errcode = 'P0002';
  end if;

  if target_order.status not in ('paid', 'dispute_won') then
    raise exception 'payment state does not allow fulfillment updates' using errcode = '23514';
  end if;

  if target_order.staged_settlement_obligation_id is not null then
    select kind into obligation_kind
    from public.staged_settlement_obligations
    where id = target_order.staged_settlement_obligation_id;
    if obligation_kind = 'commitment' then
      raise exception 'commitment payments do not represent fulfilled work' using errcode = '23514';
    end if;
  end if;

  insert into public.checkout_order_fulfillments (
    order_id, owner_id, status, updated_by
  ) values (
    target_order.id, target_order.owner_id, p_status, p_actor_user_id
  )
  on conflict (order_id) do update
    set status = excluded.status,
        updated_by = excluded.updated_by
  returning * into result_row;

  if target_order.resource_hold_id is not null then
    update public.resource_reservations
    set status = case when p_status = 'fulfilled' then 'fulfilled' else 'committed' end,
        fulfilled_at = case when p_status = 'fulfilled' then coalesce(fulfilled_at, now()) else null end,
        updated_at = now()
    where hold_id = target_order.resource_hold_id
      and status in ('committed', 'fulfilled');
  end if;

  return result_row;
end;
$$;

revoke all on function public.transition_checkout_order_fulfillment(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.transition_checkout_order_fulfillment(uuid, uuid, text, uuid)
  to service_role;

-- Existing orders prove payment, but not historical fulfillment. Backfill only the
-- events supported by durable rows and timestamps, leaving fulfillment untracked.
insert into public.checkout_order_events (
  order_id, owner_id, event_type, source, idempotency_key, metadata, created_at
)
select
  id,
  owner_id,
  'order_recorded',
  'system',
  'order:recorded',
  jsonb_build_object('channel', channel),
  created_at
from public.checkout_orders
on conflict (order_id, idempotency_key) where idempotency_key is not null do nothing;

insert into public.checkout_order_events (
  order_id, owner_id, event_type, source, idempotency_key, metadata, created_at
)
select
  id,
  owner_id,
  'payment_confirmed',
  'stripe',
  'payment:confirmed',
  jsonb_build_object('amountCents', amount_cents, 'currency', currency, 'livemode', stripe_livemode),
  created_at
from public.checkout_orders
on conflict (order_id, idempotency_key) where idempotency_key is not null do nothing;

insert into public.checkout_order_events (
  order_id, owner_id, event_type, source, idempotency_key, metadata, created_at
)
select
  id,
  owner_id,
  'refund_recorded',
  case
    when coalesce(metadata -> 'refund' ->> 'source', metadata -> 'partial_refund' ->> 'source') = 'owner_action'
      then 'merchant'
    else 'stripe'
  end,
  'refund:total:' || refunded_cents::text,
  jsonb_build_object('refundedCents', refunded_cents, 'fullyRefunded', status = 'refunded'),
  updated_at
from public.checkout_orders
where refunded_cents > 0
on conflict (order_id, idempotency_key) where idempotency_key is not null do nothing;

insert into public.checkout_order_events (
  order_id, owner_id, event_type, source, idempotency_key, metadata, created_at
)
select
  request.order_id,
  request.owner_id,
  'buyer_request_received',
  'buyer',
  'request:' || request.id::text || ':received',
  jsonb_build_object('requestId', request.id, 'kind', request.kind, 'status', 'open'),
  request.created_at
from public.order_requests request
where request.order_kind = 'checkout'
on conflict (order_id, idempotency_key) where idempotency_key is not null do nothing;

insert into public.checkout_order_events (
  order_id, owner_id, event_type, source, idempotency_key, metadata, created_at
)
select
  request.order_id,
  request.owner_id,
  'buyer_request_updated',
  'merchant',
  'request:' || request.id::text || ':status:' || request.status,
  jsonb_build_object('requestId', request.id, 'kind', request.kind, 'status', request.status),
  request.updated_at
from public.order_requests request
where request.order_kind = 'checkout'
  and request.status <> 'open'
on conflict (order_id, idempotency_key) where idempotency_key is not null do nothing;

insert into public.checkout_order_events (
  order_id, owner_id, event_type, source, idempotency_key, metadata, created_at
)
select
  review.order_id,
  review.owner_id,
  'review_received',
  'buyer',
  'review:' || review.id::text,
  jsonb_build_object('reviewId', review.id, 'rating', review.rating, 'status', review.status),
  review.created_at
from public.order_reviews review
where review.order_kind = 'checkout'
on conflict (order_id, idempotency_key) where idempotency_key is not null do nothing;

insert into public.checkout_order_events (
  order_id, owner_id, event_type, source, idempotency_key, metadata, created_at
)
select
  reservation.checkout_order_id,
  reservation.owner_id,
  case when reservation.status = 'fulfilled' then 'resource_fulfilled' else 'resource_reserved' end,
  'system',
  'resource:' || reservation.id::text || ':' || reservation.status,
  jsonb_build_object('reservationId', reservation.id, 'status', reservation.status),
  reservation.updated_at
from public.resource_reservations reservation
where reservation.checkout_order_id is not null
on conflict (order_id, idempotency_key) where idempotency_key is not null do nothing;
