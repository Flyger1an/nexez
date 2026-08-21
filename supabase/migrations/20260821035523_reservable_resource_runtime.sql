-- Reservable-resource v1: merchant-authored interchangeable pools plus an
-- atomic allocation ledger. The database, not a public availability flag,
-- protects the invariant that active/payment-pending/committed allocations
-- never exceed the authoritative pool or window quantity.

create table public.resource_pools (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  resource_key text not null check (resource_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  label text not null check (char_length(label) between 1 and 120 and label !~ '[<>]'),
  unit_label text not null check (char_length(unit_label) between 1 and 60 and unit_label !~ '[<>]'),
  kind text not null check (kind in ('consumable', 'reusable')),
  total_quantity integer not null check (total_quantity between 1 and 1000000),
  status text not null default 'active' check (status in ('active', 'paused', 'retired')),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (page_id, resource_key),
  unique (id, owner_id, page_id)
);

comment on table public.resource_pools is
  'Merchant-owned pools of interchangeable integer units. A pool is not a serialized asset registry or an external inventory claim.';
comment on column public.resource_pools.version is
  'Monotonic merchant-configuration version bound into allocation approval.';

alter table public.resource_pools enable row level security;
revoke all on public.resource_pools from anon, authenticated;
grant select, insert, update, delete on public.resource_pools to authenticated;
grant select, insert, update, delete on public.resource_pools to service_role;

create policy resource_pools_owner_select on public.resource_pools
  for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy resource_pools_owner_insert on public.resource_pools
  for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.pages page
      where page.id = page_id and page.owner_id = (select auth.uid())
    )
  );
create policy resource_pools_owner_update on public.resource_pools
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.pages page
      where page.id = page_id and page.owner_id = (select auth.uid())
    )
  );
create policy resource_pools_owner_delete on public.resource_pools
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

create table public.resource_pool_windows (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.resource_pools(id) on delete restrict,
  window_key text not null check (window_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  label text not null check (char_length(label) between 1 and 120 and label !~ '[<>]'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  total_quantity integer not null check (total_quantity between 1 and 1000000),
  status text not null default 'active' check (status in ('active', 'paused', 'retired')),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pool_id, window_key),
  check (ends_at > starts_at)
);

comment on table public.resource_pool_windows is
  'Explicit immutable time windows for reusable Nexez-owned pools. Window identity and bounds never represent an external calendar hold.';

alter table public.resource_pool_windows enable row level security;
revoke all on public.resource_pool_windows from anon, authenticated;
grant select, insert, update, delete on public.resource_pool_windows to authenticated;
grant select, insert, update, delete on public.resource_pool_windows to service_role;

create policy resource_pool_windows_owner_select on public.resource_pool_windows
  for select to authenticated
  using (exists (
    select 1 from public.resource_pools pool
    where pool.id = pool_id and pool.owner_id = (select auth.uid())
  ));
create policy resource_pool_windows_owner_insert on public.resource_pool_windows
  for insert to authenticated
  with check (exists (
    select 1 from public.resource_pools pool
    where pool.id = pool_id and pool.owner_id = (select auth.uid())
  ));
create policy resource_pool_windows_owner_update on public.resource_pool_windows
  for update to authenticated
  using (exists (
    select 1 from public.resource_pools pool
    where pool.id = pool_id and pool.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.resource_pools pool
    where pool.id = pool_id and pool.owner_id = (select auth.uid())
  ));
create policy resource_pool_windows_owner_delete on public.resource_pool_windows
  for delete to authenticated
  using (exists (
    select 1 from public.resource_pools pool
    where pool.id = pool_id and pool.owner_id = (select auth.uid())
  ));

create table public.resource_holds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete restrict,
  offer_key text not null check (char_length(offer_key) between 1 and 160),
  buyer_scope_hash text not null check (buyer_scope_hash ~ '^[a-f0-9]{64}$'),
  request_idempotency_key text not null check (request_idempotency_key ~ '^[a-f0-9]{64}$'),
  transaction_fingerprint text not null check (transaction_fingerprint ~ '^[a-f0-9]{64}$'),
  allocation_fingerprint text not null check (allocation_fingerprint ~ '^[a-f0-9]{64}$'),
  status text not null default 'active'
    check (status in ('active', 'payment_pending', 'committed', 'expired', 'cancelled', 'failed')),
  expires_at timestamptz not null,
  stripe_checkout_session_id text unique,
  stripe_connect_account_id text,
  stripe_payment_intent_id text unique,
  payment_event_id text unique,
  committed_at timestamptz,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, page_id, offer_key, buyer_scope_hash, request_idempotency_key),
  check (expires_at > created_at),
  check (status <> 'payment_pending' or (stripe_checkout_session_id is not null and stripe_connect_account_id is not null)),
  check (status <> 'committed' or (stripe_checkout_session_id is not null and stripe_payment_intent_id is not null and payment_event_id is not null and committed_at is not null)),
  check (status not in ('expired', 'cancelled', 'failed') or released_at is not null)
);

create index resource_holds_buyer_active_idx
  on public.resource_holds (page_id, offer_key, buyer_scope_hash, status, expires_at);
create index resource_holds_expiry_idx
  on public.resource_holds (expires_at)
  where status = 'active';

comment on table public.resource_holds is
  'Short-lived all-or-none allocation identity. payment_pending holds never release from wall-clock expiry alone.';

alter table public.resource_holds enable row level security;
revoke all on public.resource_holds from anon, authenticated;
grant select, insert, update, delete on public.resource_holds to service_role;
grant select on public.resource_holds to authenticated;
create policy resource_holds_owner_select on public.resource_holds
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create table public.resource_hold_allocations (
  id uuid primary key default gen_random_uuid(),
  hold_id uuid not null references public.resource_holds(id) on delete restrict,
  pool_id uuid not null references public.resource_pools(id) on delete restrict,
  window_id uuid references public.resource_pool_windows(id) on delete restrict,
  pool_version bigint not null check (pool_version > 0),
  window_version bigint check (window_version is null or window_version > 0),
  quantity integer not null check (quantity between 1 and 10000),
  created_at timestamptz not null default now(),
  unique (hold_id, pool_id),
  check ((window_id is null) = (window_version is null))
);

create index resource_hold_allocations_pool_window_idx
  on public.resource_hold_allocations (pool_id, window_id);

alter table public.resource_hold_allocations enable row level security;
revoke all on public.resource_hold_allocations from anon, authenticated;
grant select, insert, update, delete on public.resource_hold_allocations to service_role;
grant select on public.resource_hold_allocations to authenticated;
create policy resource_hold_allocations_owner_select on public.resource_hold_allocations
  for select to authenticated
  using (exists (
    select 1 from public.resource_holds hold
    where hold.id = hold_id and hold.owner_id = (select auth.uid())
  ));

create table public.resource_reservations (
  id uuid primary key default gen_random_uuid(),
  hold_id uuid not null unique references public.resource_holds(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete restrict,
  offer_key text not null,
  status text not null default 'committed' check (status in ('committed', 'cancelled', 'fulfilled')),
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text not null unique,
  payment_event_id text not null unique,
  checkout_order_id uuid,
  allocation_snapshot jsonb not null check (jsonb_typeof(allocation_snapshot) = 'array'),
  committed_at timestamptz not null,
  cancelled_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'cancelled' or cancelled_at is not null),
  check (status <> 'fulfilled' or fulfilled_at is not null)
);

comment on table public.resource_reservations is
  'Durable allocation lineage created only by an authoritative matching payment event. Refunds do not automatically restore physical availability.';

alter table public.resource_reservations enable row level security;
revoke all on public.resource_reservations from anon, authenticated;
grant select, insert, update, delete on public.resource_reservations to service_role;
grant select on public.resource_reservations to authenticated;
create policy resource_reservations_owner_select on public.resource_reservations
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create table public.resource_allocation_events (
  id bigint generated always as identity primary key,
  hold_id uuid not null references public.resource_holds(id) on delete restrict,
  event_type text not null check (event_type in ('held', 'payment_attached', 'committed', 'expired', 'cancelled', 'failed', 'order_linked')),
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (hold_id, event_type, idempotency_key)
);

alter table public.resource_allocation_events enable row level security;
revoke all on public.resource_allocation_events from anon, authenticated;
grant select, insert, update, delete on public.resource_allocation_events to service_role;
grant select on public.resource_allocation_events to authenticated;
create policy resource_allocation_events_owner_select on public.resource_allocation_events
  for select to authenticated
  using (exists (
    select 1 from public.resource_holds hold
    where hold.id = hold_id and hold.owner_id = (select auth.uid())
  ));

create function public.validate_resource_pool_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allocated bigint;
begin
  if not exists (
    select 1 from public.pages page
    where page.id = new.page_id and page.owner_id = new.owner_id
  ) then
    raise exception 'resource pool owner must own the page' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if row(new.id, new.owner_id, new.page_id, new.kind) is distinct from row(old.id, old.owner_id, old.page_id, old.kind) then
      raise exception 'resource pool identity and kind are immutable' using errcode = '23514';
    end if;
    if new.kind = 'consumable' and new.total_quantity < old.total_quantity then
      select coalesce(sum(allocation.quantity), 0) into allocated
      from public.resource_hold_allocations allocation
      join public.resource_holds hold on hold.id = allocation.hold_id
      where allocation.pool_id = new.id
        and allocation.window_id is null
        and (
          hold.status in ('payment_pending', 'committed')
          or (hold.status = 'active' and hold.expires_at > now())
        );
      if new.total_quantity < allocated then
        raise exception 'resource pool quantity cannot fall below allocated quantity' using errcode = '23514';
      end if;
    end if;
    if row(new.resource_key, new.label, new.unit_label, new.total_quantity, new.status)
      is distinct from row(old.resource_key, old.label, old.unit_label, old.total_quantity, old.status) then
      new.version := old.version + 1;
    else
      new.version := old.version;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger resource_pool_write_guard
before insert or update on public.resource_pools
for each row execute function public.validate_resource_pool_write();

create function public.validate_resource_window_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  pool public.resource_pools%rowtype;
  allocated bigint;
begin
  select * into pool from public.resource_pools where id = new.pool_id;
  if pool.id is null or pool.kind <> 'reusable' then
    raise exception 'resource windows require a reusable pool' using errcode = '23514';
  end if;
  if new.total_quantity > pool.total_quantity then
    raise exception 'resource window quantity cannot exceed pool quantity' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if row(new.id, new.pool_id, new.starts_at, new.ends_at)
      is distinct from row(old.id, old.pool_id, old.starts_at, old.ends_at) then
      raise exception 'resource window identity and bounds are immutable' using errcode = '23514';
    end if;
    if new.total_quantity < old.total_quantity then
      select coalesce(sum(allocation.quantity), 0) into allocated
      from public.resource_hold_allocations allocation
      join public.resource_holds hold on hold.id = allocation.hold_id
      where allocation.window_id = new.id
        and (
          hold.status in ('payment_pending', 'committed')
          or (hold.status = 'active' and hold.expires_at > now())
        );
      if new.total_quantity < allocated then
        raise exception 'resource window quantity cannot fall below allocated quantity' using errcode = '23514';
      end if;
    end if;
    if row(new.window_key, new.label, new.total_quantity, new.status)
      is distinct from row(old.window_key, old.label, old.total_quantity, old.status) then
      new.version := old.version + 1;
    else
      new.version := old.version;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger resource_window_write_guard
before insert or update on public.resource_pool_windows
for each row execute function public.validate_resource_window_write();

create function public.acquire_resource_hold(
  p_owner_id uuid,
  p_page_id uuid,
  p_offer_key text,
  p_buyer_scope_hash text,
  p_request_idempotency_key text,
  p_transaction_fingerprint text,
  p_allocation_fingerprint text,
  p_allocations jsonb,
  p_hold_ttl_seconds integer default 1800
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  existing public.resource_holds%rowtype;
  created_hold_id uuid;
  allocation jsonb;
  pool public.resource_pools%rowtype;
  resource_window public.resource_pool_windows%rowtype;
  requested integer;
  allocated bigint;
  capacity integer;
begin
  if p_offer_key is null or char_length(p_offer_key) not between 1 and 160
    or p_buyer_scope_hash !~ '^[a-f0-9]{64}$'
    or p_request_idempotency_key !~ '^[a-f0-9]{64}$'
    or p_transaction_fingerprint !~ '^[a-f0-9]{64}$'
    or p_allocation_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid resource hold identity' using errcode = '22023';
  end if;
  if p_hold_ttl_seconds not between 1800 and 3600 then
    raise exception 'resource hold ttl must be between 1800 and 3600 seconds' using errcode = '22023';
  end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) not between 1 and 3 then
    raise exception 'resource hold needs between one and three allocations' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.pages page
    where page.id = p_page_id and page.owner_id = p_owner_id and page.is_published = true
  ) then
    raise exception 'published resource offer not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_page_id::text || ':' || p_offer_key || ':' || p_buyer_scope_hash,
    0
  ));

  select * into existing
  from public.resource_holds hold
  where hold.owner_id = p_owner_id
    and hold.page_id = p_page_id
    and hold.offer_key = p_offer_key
    and hold.buyer_scope_hash = p_buyer_scope_hash
    and hold.request_idempotency_key = p_request_idempotency_key
  for update;
  if existing.id is not null then
    if existing.transaction_fingerprint <> p_transaction_fingerprint
      or existing.allocation_fingerprint <> p_allocation_fingerprint then
      raise exception 'resource hold idempotency key is bound to a different allocation' using errcode = '23505';
    end if;
    if existing.status = 'active' and existing.expires_at <= now() then
      update public.resource_holds
      set status = 'expired', released_at = now(), release_reason = 'unattached_expiry', updated_at = now()
      where id = existing.id;
      insert into public.resource_allocation_events (hold_id, event_type, idempotency_key, metadata)
      values (existing.id, 'expired', 'unattached_expiry', '{}'::jsonb)
      on conflict do nothing;
    end if;
    return existing.id;
  end if;

  if (
    select count(*) from public.resource_holds hold
    where hold.page_id = p_page_id
      and hold.offer_key = p_offer_key
      and hold.buyer_scope_hash = p_buyer_scope_hash
      and (hold.status = 'payment_pending' or (hold.status = 'active' and hold.expires_at > now()))
  ) >= 3 then
    raise exception 'buyer already has the maximum active holds for this offer' using errcode = 'P0001';
  end if;

  if (
    select count(distinct item->>'poolId') from jsonb_array_elements(p_allocations) item
  ) <> jsonb_array_length(p_allocations) then
    raise exception 'resource hold contains duplicate pools' using errcode = '22023';
  end if;

  perform 1
  from public.resource_pools locked_pool
  where locked_pool.id in (
    select (item->>'poolId')::uuid from jsonb_array_elements(p_allocations) item
  )
  order by locked_pool.id
  for update;

  for allocation in
    select item from jsonb_array_elements(p_allocations) item order by item->>'poolId'
  loop
    if not (
      allocation ? 'poolId' and allocation ? 'quantity' and allocation ? 'poolVersion'
    ) then
      raise exception 'resource allocation is missing required fields' using errcode = '22023';
    end if;
    requested := (allocation->>'quantity')::integer;
    if requested not between 1 and 10000 then
      raise exception 'resource allocation quantity is out of bounds' using errcode = '22023';
    end if;
    select * into strict pool
    from public.resource_pools
    where id = (allocation->>'poolId')::uuid
      and owner_id = p_owner_id
      and page_id = p_page_id
      and status = 'active';
    if pool.version <> (allocation->>'poolVersion')::bigint then
      raise exception 'resource pool changed before hold acquisition' using errcode = '40001';
    end if;

    if pool.kind = 'consumable' then
      if allocation ? 'windowId' or allocation ? 'windowVersion' then
        raise exception 'consumable resource allocation cannot reference a window' using errcode = '22023';
      end if;
      capacity := pool.total_quantity;
      select coalesce(sum(entry.quantity), 0) into allocated
      from public.resource_hold_allocations entry
      join public.resource_holds hold on hold.id = entry.hold_id
      where entry.pool_id = pool.id and entry.window_id is null
        and (hold.status in ('payment_pending', 'committed') or (hold.status = 'active' and hold.expires_at > now()));
    else
      if not (allocation ? 'windowId' and allocation ? 'windowVersion') then
        raise exception 'reusable resource allocation requires an exact window' using errcode = '22023';
      end if;
      select * into strict resource_window
      from public.resource_pool_windows
      where id = (allocation->>'windowId')::uuid
        and pool_id = pool.id
        and status = 'active';
      if resource_window.version <> (allocation->>'windowVersion')::bigint then
        raise exception 'resource window changed before hold acquisition' using errcode = '40001';
      end if;
      capacity := resource_window.total_quantity;
      select coalesce(sum(entry.quantity), 0) into allocated
      from public.resource_hold_allocations entry
      join public.resource_holds hold on hold.id = entry.hold_id
      where entry.window_id = resource_window.id
        and (hold.status in ('payment_pending', 'committed') or (hold.status = 'active' and hold.expires_at > now()));
    end if;

    if allocated + requested > capacity then
      raise exception 'resource allocation unavailable for pool %', pool.id using errcode = 'P0001';
    end if;
  end loop;

  insert into public.resource_holds (
    owner_id, page_id, offer_key, buyer_scope_hash, request_idempotency_key,
    transaction_fingerprint, allocation_fingerprint, expires_at
  ) values (
    p_owner_id, p_page_id, p_offer_key, p_buyer_scope_hash, p_request_idempotency_key,
    p_transaction_fingerprint, p_allocation_fingerprint, now() + make_interval(secs => p_hold_ttl_seconds)
  ) returning id into created_hold_id;

  insert into public.resource_hold_allocations (
    hold_id, pool_id, window_id, pool_version, window_version, quantity
  )
  select
    created_hold_id,
    (item->>'poolId')::uuid,
    case when item ? 'windowId' then (item->>'windowId')::uuid else null end,
    (item->>'poolVersion')::bigint,
    case when item ? 'windowVersion' then (item->>'windowVersion')::bigint else null end,
    (item->>'quantity')::integer
  from jsonb_array_elements(p_allocations) item;

  insert into public.resource_allocation_events (hold_id, event_type, idempotency_key, metadata)
  values (created_hold_id, 'held', p_request_idempotency_key, jsonb_build_object('allocationFingerprint', p_allocation_fingerprint));
  return created_hold_id;
exception
  when no_data_found then
    raise exception 'resource pool or window is missing, inactive, or outside this page' using errcode = 'P0002';
  when invalid_text_representation then
    raise exception 'resource allocation contains an invalid identifier or quantity' using errcode = '22023';
end;
$$;

create function public.attach_resource_hold_payment(
  p_hold_id uuid,
  p_transaction_fingerprint text,
  p_allocation_fingerprint text,
  p_stripe_checkout_session_id text,
  p_stripe_connect_account_id text
)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  hold public.resource_holds%rowtype;
begin
  select * into hold from public.resource_holds where id = p_hold_id for update;
  if hold.id is null then raise exception 'resource hold not found' using errcode = 'P0002'; end if;
  if hold.status = 'payment_pending'
    and hold.stripe_checkout_session_id = p_stripe_checkout_session_id
    and hold.stripe_connect_account_id = p_stripe_connect_account_id then
    return hold.expires_at;
  end if;
  if hold.status <> 'active' or hold.expires_at <= now()
    or hold.transaction_fingerprint <> p_transaction_fingerprint
    or hold.allocation_fingerprint <> p_allocation_fingerprint then
    raise exception 'resource hold is expired, changed, or unavailable for payment' using errcode = 'P0001';
  end if;
  update public.resource_holds
  set status = 'payment_pending',
      stripe_checkout_session_id = p_stripe_checkout_session_id,
      stripe_connect_account_id = p_stripe_connect_account_id,
      updated_at = now()
  where id = hold.id;
  insert into public.resource_allocation_events (hold_id, event_type, idempotency_key, metadata)
  values (hold.id, 'payment_attached', p_stripe_checkout_session_id, jsonb_build_object('expiresAt', hold.expires_at));
  return hold.expires_at;
end;
$$;

create function public.release_resource_hold(
  p_hold_id uuid,
  p_reason text,
  p_stripe_checkout_session_id text default null
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  hold public.resource_holds%rowtype;
  terminal_status text;
begin
  select * into hold from public.resource_holds where id = p_hold_id for update;
  if hold.id is null then raise exception 'resource hold not found' using errcode = 'P0002'; end if;
  if hold.status in ('expired', 'cancelled', 'failed') then return hold.status; end if;
  if hold.status = 'committed' then raise exception 'committed resource hold cannot be released' using errcode = 'P0001'; end if;
  if hold.status = 'payment_pending' and (
    p_reason not in ('provider_expired', 'provider_failed', 'provider_cancelled')
    or p_stripe_checkout_session_id is null
    or p_stripe_checkout_session_id <> hold.stripe_checkout_session_id
  ) then
    raise exception 'payment-pending hold requires matching authoritative provider terminal state' using errcode = 'P0001';
  end if;
  terminal_status := case
    when p_reason in ('unattached_expiry', 'provider_expired') then 'expired'
    when p_reason in ('provider_failed') then 'failed'
    else 'cancelled'
  end;
  update public.resource_holds
  set status = terminal_status, released_at = now(), release_reason = p_reason, updated_at = now()
  where id = hold.id;
  insert into public.resource_allocation_events (hold_id, event_type, idempotency_key, metadata)
  values (hold.id, terminal_status, p_reason, jsonb_build_object('stripeCheckoutSessionId', p_stripe_checkout_session_id))
  on conflict do nothing;
  return terminal_status;
end;
$$;

create function public.commit_resource_hold(
  p_hold_id uuid,
  p_transaction_fingerprint text,
  p_allocation_fingerprint text,
  p_stripe_checkout_session_id text,
  p_stripe_connect_account_id text,
  p_stripe_payment_intent_id text,
  p_payment_event_id text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  hold public.resource_holds%rowtype;
  reservation_id uuid;
  snapshot jsonb;
begin
  select * into hold from public.resource_holds where id = p_hold_id for update;
  if hold.id is null then raise exception 'resource hold not found' using errcode = 'P0002'; end if;
  if hold.status = 'committed' then
    if hold.stripe_checkout_session_id = p_stripe_checkout_session_id
      and hold.stripe_connect_account_id = p_stripe_connect_account_id
      and hold.stripe_payment_intent_id = p_stripe_payment_intent_id
      and hold.payment_event_id = p_payment_event_id then
      select id into reservation_id from public.resource_reservations where hold_id = hold.id;
      return reservation_id;
    end if;
    raise exception 'resource hold is already committed to another payment' using errcode = '23505';
  end if;
  if hold.status <> 'payment_pending'
    or hold.transaction_fingerprint <> p_transaction_fingerprint
    or hold.allocation_fingerprint <> p_allocation_fingerprint
    or hold.stripe_checkout_session_id <> p_stripe_checkout_session_id
    or hold.stripe_connect_account_id <> p_stripe_connect_account_id then
    raise exception 'payment does not match the resource hold provenance' using errcode = 'P0001';
  end if;
  select jsonb_agg(jsonb_build_object(
    'poolId', allocation.pool_id,
    'windowId', allocation.window_id,
    'poolVersion', allocation.pool_version,
    'windowVersion', allocation.window_version,
    'quantity', allocation.quantity
  ) order by allocation.pool_id) into snapshot
  from public.resource_hold_allocations allocation where allocation.hold_id = hold.id;

  update public.resource_holds
  set status = 'committed',
      stripe_payment_intent_id = p_stripe_payment_intent_id,
      payment_event_id = p_payment_event_id,
      committed_at = now(),
      updated_at = now()
  where id = hold.id;
  insert into public.resource_reservations (
    hold_id, owner_id, page_id, offer_key, stripe_checkout_session_id,
    stripe_payment_intent_id, payment_event_id, allocation_snapshot, committed_at
  ) values (
    hold.id, hold.owner_id, hold.page_id, hold.offer_key, p_stripe_checkout_session_id,
    p_stripe_payment_intent_id, p_payment_event_id, snapshot, now()
  ) returning id into reservation_id;
  insert into public.resource_allocation_events (hold_id, event_type, idempotency_key, metadata)
  values (hold.id, 'committed', p_payment_event_id, jsonb_build_object('reservationId', reservation_id));
  return reservation_id;
end;
$$;

-- A normal checkout order remains the money ledger; this UUID is the durable
-- allocation lineage. It is linked after both idempotent writes succeed.
alter table public.checkout_orders
  add column resource_hold_id uuid references public.resource_holds(id) on delete set null;
create unique index checkout_orders_resource_hold_uidx
  on public.checkout_orders (resource_hold_id) where resource_hold_id is not null;

alter table public.checkout_orders drop constraint if exists checkout_orders_channel_check;
alter table public.checkout_orders add constraint checkout_orders_channel_check
  check (
    channel is null
    or channel in (
      'agent_checkout', 'acp', 'ucp', 'negotiation', 'nexie',
      'recurring_service', 'staged_settlement', 'reservable_resource'
    )
  );

alter table public.resource_reservations
  add constraint resource_reservations_checkout_order_fk
  foreign key (checkout_order_id) references public.checkout_orders(id) on delete set null;
create unique index resource_reservations_checkout_order_uidx
  on public.resource_reservations (checkout_order_id) where checkout_order_id is not null;

create function public.link_resource_reservation_order(
  p_hold_id uuid,
  p_checkout_order_id uuid
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  linked uuid;
begin
  update public.resource_reservations reservation
  set checkout_order_id = p_checkout_order_id, updated_at = now()
  where reservation.hold_id = p_hold_id
    and (reservation.checkout_order_id is null or reservation.checkout_order_id = p_checkout_order_id)
  returning reservation.id into linked;
  if linked is null then return false; end if;
  update public.checkout_orders
  set resource_hold_id = p_hold_id
  where id = p_checkout_order_id
    and (resource_hold_id is null or resource_hold_id = p_hold_id);
  insert into public.resource_allocation_events (hold_id, event_type, idempotency_key, metadata)
  values (p_hold_id, 'order_linked', p_checkout_order_id::text, jsonb_build_object('checkoutOrderId', p_checkout_order_id))
  on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.acquire_resource_hold(uuid, uuid, text, text, text, text, text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.attach_resource_hold_payment(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.release_resource_hold(uuid, text, text) from public, anon, authenticated;
revoke all on function public.commit_resource_hold(uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.link_resource_reservation_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.acquire_resource_hold(uuid, uuid, text, text, text, text, text, jsonb, integer) to service_role;
grant execute on function public.attach_resource_hold_payment(uuid, text, text, text, text) to service_role;
grant execute on function public.release_resource_hold(uuid, text, text) to service_role;
grant execute on function public.commit_resource_hold(uuid, text, text, text, text, text, text) to service_role;
grant execute on function public.link_resource_reservation_order(uuid, uuid) to service_role;
