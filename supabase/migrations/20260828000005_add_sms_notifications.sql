-- Transactional SMS is intentionally account-owned rather than listing-owned:
-- a public page's contact details must never become an SMS destination. V1 is
-- seller-only and sends only the fixed “new negotiation needs review” template
-- to a verified, explicitly opted-in account number.

-- The public carrier-review page is platform-owned. Reserve it in both public
-- identifier namespaces so a listing or storefront can never shadow the route.
do $$
begin
  if exists (
    select 1 from public.pages where lower(btrim(slug)) = 'sms-notifications'
  ) then
    raise exception 'An existing listing slug conflicts with the SMS notification route.';
  end if;
  if exists (
    select 1 from public.storefronts where lower(btrim(handle)) = 'sms-notifications'
  ) then
    raise exception 'An existing storefront handle conflicts with the SMS notification route.';
  end if;
end;
$$;

insert into private.public_identifier_claims (namespace, identifier, kind)
values
  ('page_slug', 'sms-notifications', 'system'),
  ('storefront_handle', 'sms-notifications', 'system')
on conflict (namespace, identifier) do update
set kind = 'system',
    owner_id = null,
    subject_id = null,
    updated_at = statement_timestamp();

create table if not exists public.user_sms_destinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_e164 text not null
    check (phone_e164 ~ E'^\\+[1-9][0-9]{7,14}$'),
  verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A person can only have one active number at a time, and a number cannot be
-- active on two accounts. Revocation keeps the history without leaving a live
-- destination behind.
create unique index if not exists user_sms_destinations_active_user_uidx
  on public.user_sms_destinations (user_id)
  where revoked_at is null;

create unique index if not exists user_sms_destinations_active_phone_uidx
  on public.user_sms_destinations (phone_e164)
  where revoked_at is null;

create index if not exists user_sms_destinations_user_idx
  on public.user_sms_destinations (user_id, created_at desc);

create table if not exists public.sms_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null check (topic in ('seller_negotiation')),
  consent_version text not null check (char_length(consent_version) between 1 and 80),
  consent_source text not null check (consent_source in ('account_settings')),
  consented_at timestamptz not null,
  opted_in_at timestamptz,
  opted_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, topic),
  check (opted_in_at is null or opted_in_at >= consented_at)
);

create index if not exists sms_subscriptions_user_idx
  on public.sms_subscriptions (user_id, topic);

create table if not exists public.sms_notification_events (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique
    check (char_length(dedupe_key) between 16 and 180),
  user_id uuid not null references auth.users(id) on delete cascade,
  destination_id uuid not null references public.user_sms_destinations(id) on delete restrict,
  negotiation_id uuid references public.agent_negotiations(id) on delete set null,
  topic text not null check (topic in ('seller_negotiation')),
  template_key text not null check (template_key in ('seller_new_negotiation')),
  -- This is only a SHA-256 fingerprint of the fixed template + event identity.
  -- Do not put a phone number, message body, token, or buyer data in this table.
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'queued' check (
    status in ('queued', 'sending', 'accepted', 'sent', 'delivered', 'undelivered', 'failed', 'suppressed')
  ),
  attempt_count integer not null default 0 check (attempt_count between 0 and 2),
  available_at timestamptz not null default now(),
  -- Negotiation review is time-sensitive. A sender configured later must never
  -- backfill an old alert as a fresh text.
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  claimed_at timestamptz,
  last_attempt_at timestamptz,
  accepted_at timestamptz,
  delivered_at timestamptz,
  message_sid text,
  -- A short, sanitised provider/status code only; never store a provider's raw error.
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_:-]{1,64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sms_notification_events_message_sid_uidx
  on public.sms_notification_events (message_sid)
  where message_sid is not null;

-- The cron worker only scans work that is still eligible to be claimed.
create index if not exists sms_notification_events_queue_idx
  on public.sms_notification_events (available_at, created_at)
  where status = 'queued';

create index if not exists sms_notification_events_user_created_idx
  on public.sms_notification_events (user_id, created_at desc);

create index if not exists sms_notification_events_user_delivery_idx
  on public.sms_notification_events (user_id, status)
  where status in ('queued', 'sending');

create index if not exists sms_notification_events_destination_idx
  on public.sms_notification_events (destination_id);

create index if not exists sms_notification_events_negotiation_idx
  on public.sms_notification_events (negotiation_id)
  where negotiation_id is not null;

-- These tables contain phone-number and delivery metadata. They are deliberately
-- service-role-only; account APIs return a masked representation after authenticating
-- the current user rather than exposing the Data API surface directly.
alter table public.user_sms_destinations enable row level security;
alter table public.sms_subscriptions enable row level security;
alter table public.sms_notification_events enable row level security;

revoke all on public.user_sms_destinations from public, anon, authenticated;
revoke all on public.sms_subscriptions from public, anon, authenticated;
revoke all on public.sms_notification_events from public, anon, authenticated;

grant select, insert, update, delete on public.user_sms_destinations to service_role;
grant select, insert, update, delete on public.sms_subscriptions to service_role;
grant select, insert, update, delete on public.sms_notification_events to service_role;

create or replace function public.nz_touch_sms_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke execute on function public.nz_touch_sms_updated_at() from public, anon, authenticated;

drop trigger if exists trg_touch_user_sms_destinations_updated_at on public.user_sms_destinations;
create trigger trg_touch_user_sms_destinations_updated_at
  before update on public.user_sms_destinations
  for each row
  execute function public.nz_touch_sms_updated_at();

drop trigger if exists trg_touch_sms_subscriptions_updated_at on public.sms_subscriptions;
create trigger trg_touch_sms_subscriptions_updated_at
  before update on public.sms_subscriptions
  for each row
  execute function public.nz_touch_sms_updated_at();

drop trigger if exists trg_touch_sms_notification_events_updated_at on public.sms_notification_events;
create trigger trg_touch_sms_notification_events_updated_at
  before update on public.sms_notification_events
  for each row
  execute function public.nz_touch_sms_updated_at();

-- Vercel can overlap cron invocations. Claim work with FOR UPDATE SKIP LOCKED so
-- two workers never send the same queued event. A stale in-flight claim is marked
-- failed, not resent: an ambiguous network timeout must not duplicate an SMS, and
-- existing email/push/in-app notifications remain the fallback.
create or replace function public.claim_sms_notification_events(p_limit integer default 20)
returns table (
  event_id uuid,
  destination_id uuid,
  phone_e164 text,
  topic text,
  template_key text,
  delivery_eligible boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'p_limit must be between 1 and 50'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Never retry an unknown outcome after the sender may have accepted it.
  update public.sms_notification_events
  set
    status = 'failed',
    error_code = 'stale_claim',
    updated_at = pg_catalog.now()
  where status = 'sending'
    and claimed_at < pg_catalog.now() - interval '15 minutes';

  update public.sms_notification_events
  set
    status = 'suppressed',
    error_code = 'expired',
    updated_at = pg_catalog.now()
  where status = 'queued'
    and expires_at <= pg_catalog.now();

  return query
  with candidates as (
    select e.id
    from public.sms_notification_events e
    where e.status = 'queued'
      and e.available_at <= pg_catalog.now()
      and e.expires_at > pg_catalog.now()
    order by e.created_at asc
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.sms_notification_events e
    set
      status = 'sending',
      claimed_at = pg_catalog.now(),
      last_attempt_at = pg_catalog.now(),
      attempt_count = e.attempt_count + 1,
      error_code = null,
      updated_at = pg_catalog.now()
    from candidates c
    where e.id = c.id
    returning e.id, e.destination_id, e.user_id, e.topic, e.template_key
  )
  select
    c.id,
    c.destination_id,
    d.phone_e164,
    c.topic,
    c.template_key,
    coalesce((
      d.verified_at is not null
      and d.revoked_at is null
      and s.opted_in_at is not null
      and s.opted_out_at is null
    ), false)
  from claimed c
  join public.user_sms_destinations d on d.id = c.destination_id
  left join public.sms_subscriptions s
    on s.user_id = c.user_id
    and s.topic = c.topic;
end;
$$;

revoke all on function public.claim_sms_notification_events(integer) from public, anon, authenticated;
grant execute on function public.claim_sms_notification_events(integer) to service_role;

-- This is intentionally checked by the worker immediately before the Twilio
-- request. It closes the ordinary queue-to-send gap after an account disable or
-- signed STOP callback. The Messaging Service's Advanced Opt-Out remains the
-- provider-side backstop for the unavoidable final network race.
create or replace function public.sms_notification_event_is_deliverable(p_event_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sms_notification_events e
    join public.user_sms_destinations d on d.id = e.destination_id
    join public.sms_subscriptions s
      on s.user_id = e.user_id
      and s.topic = e.topic
    where e.id = p_event_id
      and e.status = 'sending'
      and d.verified_at is not null
      and d.revoked_at is null
      and s.opted_in_at is not null
      and s.opted_out_at is null
  );
$$;

revoke all on function public.sms_notification_event_is_deliverable(uuid) from public, anon, authenticated;
grant execute on function public.sms_notification_event_is_deliverable(uuid) to service_role;

-- One transaction turns a proven number into the active destination and records
-- its consent. The account route calls this only after Twilio Verify reports
-- `approved`; doing the replacement in SQL avoids a half-enabled account when a
-- phone change races with another request or a process dies between REST calls.
create or replace function public.activate_user_sms_destination(
  p_user_id uuid,
  p_phone_e164 text,
  p_consent_version text,
  p_consented_at timestamptz default null
)
returns table (
  destination_id uuid,
  verified_at timestamptz,
  opted_in_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.user_sms_destinations%rowtype;
  v_existing_phone text;
  v_destination_id uuid;
  v_now timestamptz := pg_catalog.now();
  v_first_phone_lock bigint;
  v_second_phone_lock bigint;
begin
  if p_user_id is null
     or p_phone_e164 !~ E'^\\+[1-9][0-9]{7,14}$'
     or char_length(coalesce(p_consent_version, '')) not between 1 and 80 then
    raise exception 'Invalid SMS activation request.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Serialize the account first, then acquire the current/requested phone
  -- advisory locks in a stable order. This avoids the P1<->P2 swap deadlock
  -- where two accounts would otherwise lock their current rows oppositely.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nexez:sms:user:' || p_user_id::text, 0::bigint)
  );
  select phone_e164
  into v_existing_phone
  from public.user_sms_destinations
  where user_id = p_user_id
    and revoked_at is null;

  if v_existing_phone is null or v_existing_phone = p_phone_e164 then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('nexez:sms:phone:' || p_phone_e164, 0::bigint)
    );
  else
    v_first_phone_lock := pg_catalog.hashtextextended('nexez:sms:phone:' || v_existing_phone, 0::bigint);
    v_second_phone_lock := pg_catalog.hashtextextended('nexez:sms:phone:' || p_phone_e164, 0::bigint);
    if v_first_phone_lock <= v_second_phone_lock then
      perform pg_catalog.pg_advisory_xact_lock(v_first_phone_lock);
      perform pg_catalog.pg_advisory_xact_lock(v_second_phone_lock);
    else
      perform pg_catalog.pg_advisory_xact_lock(v_second_phone_lock);
      perform pg_catalog.pg_advisory_xact_lock(v_first_phone_lock);
    end if;
  end if;

  -- Unique indexes remain the final concurrency guard if an unrelated request
  -- races this activation or a rare advisory-hash collision serializes work.
  select *
  into v_existing
  from public.user_sms_destinations
  where user_id = p_user_id
    and revoked_at is null
  for update;

  perform 1
  from public.user_sms_destinations
  where phone_e164 = p_phone_e164
    and revoked_at is null
    and user_id <> p_user_id
  for update;

  if found then
    raise exception 'This number cannot be activated.'
      using errcode = 'unique_violation';
  end if;

  if v_existing.id is not null and v_existing.phone_e164 = p_phone_e164 then
    update public.user_sms_destinations
    set verified_at = v_now, revoked_at = null
    where id = v_existing.id
    returning id into v_destination_id;
  else
    if v_existing.id is not null then
      update public.user_sms_destinations
      set revoked_at = v_now
      where id = v_existing.id;
    end if;

    insert into public.user_sms_destinations (user_id, phone_e164, verified_at)
    values (p_user_id, p_phone_e164, v_now)
    returning id into v_destination_id;
  end if;

  insert into public.sms_subscriptions (
    user_id,
    topic,
    consent_version,
    consent_source,
    consented_at,
    opted_in_at,
    opted_out_at
  )
  values (
    p_user_id,
    'seller_negotiation',
    p_consent_version,
    'account_settings',
    coalesce(p_consented_at, v_now),
    v_now,
    null
  )
  on conflict (user_id, topic) do update
  set
    consent_version = excluded.consent_version,
    consent_source = excluded.consent_source,
    consented_at = excluded.consented_at,
    opted_in_at = excluded.opted_in_at,
    opted_out_at = null;

  return query
  select v_destination_id, v_now, v_now;
end;
$$;

revoke all on function public.activate_user_sms_destination(uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.activate_user_sms_destination(uuid, text, text, timestamptz)
  to service_role;

comment on table public.user_sms_destinations is
  'Account-owned SMS destinations. E.164 numbers are service-role-only and must be verified before use.';
comment on table public.sms_subscriptions is
  'Explicit account-level consent and opt-out state for Nexez transactional SMS topics.';
comment on table public.sms_notification_events is
  'Durable, de-duplicated transactional SMS outbox. Stores no message body, token, buyer data, or raw provider error.';
comment on function public.claim_sms_notification_events(integer) is
  'Service-role-only atomic SMS outbox claim for Vercel workers; uses SKIP LOCKED and never retries ambiguous sends.';
comment on function public.sms_notification_event_is_deliverable(uuid) is
  'Service-role-only just-in-time eligibility check before a transactional SMS send.';
comment on function public.activate_user_sms_destination(uuid, text, text, timestamptz) is
  'Service-role-only atomic activation of an approved Twilio Verify destination and seller-negotiation SMS consent.';
