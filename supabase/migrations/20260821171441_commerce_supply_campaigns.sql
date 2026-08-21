-- Operator workflow for turning privacy-safe, canonical Commerce demand into
-- real marketplace supply. Buyer text and visitor identity never enter these
-- tables: only a code-owned reference, bounded aggregate counts, an explicit
-- operator state, and the operator's reason are persisted.

create table public.commerce_supply_campaigns (
  reference_id text primary key,
  reference_domain text not null,
  status text not null default 'new',
  decision_reason text not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint commerce_supply_campaign_reference_shape check (
    char_length(reference_id) between 3 and 120
    and reference_id ~ '^[a-z0-9]+([.-][a-z0-9]+)*$'
  ),
  constraint commerce_supply_campaign_domain check (
    reference_domain in (
      'home-property',
      'automotive-mobile',
      'events-hospitality',
      'beauty-fitness-personal',
      'professional-creative-technical',
      'education-family-pet',
      'local-commercial-operations'
    )
  ),
  constraint commerce_supply_campaign_status check (
    status in ('new', 'sourcing', 'contacted', 'onboarding', 'dismissed')
  ),
  constraint commerce_supply_campaign_reason check (
    char_length(btrim(decision_reason)) between 3 and 500
  )
);

create index commerce_supply_campaigns_status_updated_idx
  on public.commerce_supply_campaigns (status, updated_at desc);

create table public.commerce_supply_campaign_events (
  id bigint generated always as identity primary key,
  reference_id text not null,
  reference_domain text not null,
  from_status text not null,
  to_status text not null,
  reason text not null,
  actor_id uuid references auth.users(id) on delete set null,
  idempotency_key uuid not null unique,
  observed_count integer not null,
  live_count integer not null,
  related_count integer not null,
  reference_count integer not null,
  unresolved_count integer not null,
  created_at timestamptz not null default now(),

  constraint commerce_supply_event_reference_shape check (
    char_length(reference_id) between 3 and 120
    and reference_id ~ '^[a-z0-9]+([.-][a-z0-9]+)*$'
  ),
  constraint commerce_supply_event_domain check (
    reference_domain in (
      'home-property',
      'automotive-mobile',
      'events-hospitality',
      'beauty-fitness-personal',
      'professional-creative-technical',
      'education-family-pet',
      'local-commercial-operations'
    )
  ),
  constraint commerce_supply_event_from_status check (
    from_status in ('new', 'sourcing', 'contacted', 'onboarding', 'dismissed')
  ),
  constraint commerce_supply_event_to_status check (
    to_status in ('new', 'sourcing', 'contacted', 'onboarding', 'dismissed')
  ),
  constraint commerce_supply_event_reason check (
    char_length(btrim(reason)) between 3 and 500
  ),
  constraint commerce_supply_event_counts_nonnegative check (
    observed_count >= 0
    and live_count >= 0
    and related_count >= 0
    and reference_count >= 0
    and unresolved_count >= 0
  ),
  constraint commerce_supply_event_counts_consistent check (
    observed_count = live_count + related_count + reference_count
    and unresolved_count = related_count + reference_count
  )
);

create index commerce_supply_campaign_events_reference_created_idx
  on public.commerce_supply_campaign_events (reference_id, created_at desc);

alter table public.commerce_supply_campaigns enable row level security;
alter table public.commerce_supply_campaign_events enable row level security;

revoke all privileges on table public.commerce_supply_campaigns from public, anon, authenticated, service_role;
revoke all privileges on table public.commerce_supply_campaign_events from public, anon, authenticated, service_role;
revoke all privileges on sequence public.commerce_supply_campaign_events_id_seq from public, anon, authenticated, service_role;

-- The service role can read the current workflow and immutable audit history.
-- All writes go through the bounded function below.
grant select on table public.commerce_supply_campaigns to service_role;
grant select on table public.commerce_supply_campaign_events to service_role;

comment on table public.commerce_supply_campaigns is
  'Service-role-only operator state for canonical Commerce supply acquisition. Contains no buyer request text or visitor identity.';
comment on table public.commerce_supply_campaign_events is
  'Append-only, aggregate-evidence audit for Commerce supply campaign transitions.';

create or replace function private.nz_reject_commerce_supply_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'commerce supply campaign events are append-only';
end;
$$;
revoke all on function private.nz_reject_commerce_supply_event_mutation() from public, anon, authenticated, service_role;

create trigger trg_commerce_supply_events_append_only
  before update or delete on public.commerce_supply_campaign_events
  for each row execute function private.nz_reject_commerce_supply_event_mutation();

create or replace function public.nz_apply_commerce_supply_campaign(
  p_reference_id text,
  p_reference_domain text,
  p_status text,
  p_reason text,
  p_actor_id uuid,
  p_idempotency_key uuid,
  p_observed_count integer,
  p_live_count integer,
  p_related_count integer,
  p_reference_count integer,
  p_unresolved_count integer
)
returns public.commerce_supply_campaigns
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_current public.commerce_supply_campaigns%rowtype;
  v_existing public.commerce_supply_campaign_events%rowtype;
  v_from_status text;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not exists (
    select 1 from public.platform_admins where user_id = p_actor_id
  ) then
    raise exception 'platform administrator required' using errcode = '42501';
  end if;

  if p_reference_id is null
     or char_length(p_reference_id) not between 3 and 120
     or p_reference_id !~ '^[a-z0-9]+([.-][a-z0-9]+)*$' then
    raise exception 'invalid canonical reference' using errcode = '22023';
  end if;
  if p_reference_domain not in (
    'home-property',
    'automotive-mobile',
    'events-hospitality',
    'beauty-fitness-personal',
    'professional-creative-technical',
    'education-family-pet',
    'local-commercial-operations'
  ) then
    raise exception 'invalid canonical domain' using errcode = '22023';
  end if;
  if p_status not in ('new', 'sourcing', 'contacted', 'onboarding', 'dismissed') then
    raise exception 'invalid campaign status' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 3 and 500 then
    raise exception 'campaign reason must contain 3 to 500 characters' using errcode = '22023';
  end if;
  if p_observed_count < 0
     or p_live_count < 0
     or p_related_count < 0
     or p_reference_count < 0
     or p_unresolved_count < 0
     or p_observed_count <> p_live_count + p_related_count + p_reference_count
     or p_unresolved_count <> p_related_count + p_reference_count then
    raise exception 'invalid campaign evidence counts' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_reference_id, 0));

  select * into v_existing
  from public.commerce_supply_campaign_events
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.reference_id <> p_reference_id
       or v_existing.reference_domain <> p_reference_domain
       or v_existing.to_status <> p_status
       or v_existing.reason <> v_reason
       or v_existing.actor_id is distinct from p_actor_id
       or v_existing.observed_count <> p_observed_count
       or v_existing.live_count <> p_live_count
       or v_existing.related_count <> p_related_count
       or v_existing.reference_count <> p_reference_count
       or v_existing.unresolved_count <> p_unresolved_count then
      raise exception 'idempotency key is already bound to another campaign request' using errcode = '23505';
    end if;

    select * into v_current
    from public.commerce_supply_campaigns
    where reference_id = p_reference_id;
    return v_current;
  end if;

  select * into v_current
  from public.commerce_supply_campaigns
  where reference_id = p_reference_id
  for update;
  v_from_status := coalesce(v_current.status, 'new');

  if not (
    (v_from_status = 'new' and p_status in ('sourcing', 'dismissed'))
    or (v_from_status = 'sourcing' and p_status in ('new', 'contacted', 'dismissed'))
    or (v_from_status = 'contacted' and p_status in ('sourcing', 'onboarding', 'dismissed'))
    or (v_from_status = 'onboarding' and p_status in ('contacted', 'dismissed'))
    or (v_from_status = 'dismissed' and p_status in ('new', 'sourcing'))
  ) then
    raise exception 'invalid campaign transition from % to %', v_from_status, p_status using errcode = '22023';
  end if;

  insert into public.commerce_supply_campaigns (
    reference_id,
    reference_domain,
    status,
    decision_reason,
    created_by,
    updated_by
  ) values (
    p_reference_id,
    p_reference_domain,
    p_status,
    v_reason,
    p_actor_id,
    p_actor_id
  )
  on conflict (reference_id) do update
  set reference_domain = excluded.reference_domain,
      status = excluded.status,
      decision_reason = excluded.decision_reason,
      updated_by = excluded.updated_by,
      updated_at = now()
  returning * into v_current;

  insert into public.commerce_supply_campaign_events (
    reference_id,
    reference_domain,
    from_status,
    to_status,
    reason,
    actor_id,
    idempotency_key,
    observed_count,
    live_count,
    related_count,
    reference_count,
    unresolved_count
  ) values (
    p_reference_id,
    p_reference_domain,
    v_from_status,
    p_status,
    v_reason,
    p_actor_id,
    p_idempotency_key,
    p_observed_count,
    p_live_count,
    p_related_count,
    p_reference_count,
    p_unresolved_count
  );

  return v_current;
end;
$$;

revoke all on function public.nz_apply_commerce_supply_campaign(
  text, text, text, text, uuid, uuid, integer, integer, integer, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.nz_apply_commerce_supply_campaign(
  text, text, text, text, uuid, uuid, integer, integer, integer, integer, integer
) to service_role;
