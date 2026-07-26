-- Growth Control: private campaign telemetry and atomic, append-audited
-- operator controls. Customer-facing grant duration and invite limits are
-- intentionally not mutable here.

create table if not exists public.seller_growth_campaign_admin_events (
  id bigint generated always as identity primary key,
  campaign_id uuid not null
    references public.seller_growth_campaigns(id) on delete restrict,
  actor_id uuid
    references auth.users(id) on delete set null,
  action text not null
    check (action in (
      'pause',
      'resume',
      'end',
      'set_capacity',
      'set_signup_close'
    )),
  reason text not null
    check (char_length(btrim(reason)) between 3 and 500),
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 8 and 160),
  before_state jsonb not null
    check (jsonb_typeof(before_state) = 'object'),
  after_state jsonb not null
    check (jsonb_typeof(after_state) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists seller_growth_campaign_admin_events_campaign_idx
  on public.seller_growth_campaign_admin_events (campaign_id, created_at desc);

create index if not exists promotional_plan_grants_campaign_created_idx
  on public.promotional_plan_grants (campaign_id, created_at desc);

create index if not exists seller_growth_invites_campaign_status_idx
  on public.seller_growth_invites (campaign_id, status, created_at desc);

create index if not exists seller_growth_events_campaign_created_idx
  on public.seller_growth_events (campaign_id, created_at desc);

alter table public.seller_growth_campaign_admin_events enable row level security;
revoke all on public.seller_growth_campaign_admin_events from anon, authenticated;
grant select, insert on public.seller_growth_campaign_admin_events to service_role;
grant usage, select on sequence public.seller_growth_campaign_admin_events_id_seq
  to service_role;

comment on table public.seller_growth_campaign_admin_events is
  'Append-only operator audit for campaign lifecycle, capacity, and signup-window changes.';

-- One compact aggregate avoids moving campaign ledgers or recipient details
-- through the application just to render Launch Control.
create or replace function public.seller_growth_control_snapshot(
  p_campaign_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with
  grant_metrics as (
    select
      count(*) as total,
      count(*) filter (
        where status = 'active'
          and starts_at <= now()
          and ends_at > now()
      ) as active,
      count(*) filter (where status = 'expired') as expired,
      count(*) filter (where status = 'revoked') as revoked,
      count(*) filter (where status = 'superseded') as superseded,
      count(*) filter (where source = 'welcome') as welcome,
      count(*) filter (where source = 'referral') as referral,
      count(*) filter (where fallback_page_id is not null) as fallback_selected,
      count(*) filter (where created_at >= now() - interval '30 days') as issued_30d
    from public.promotional_plan_grants
    where campaign_id = p_campaign_id
  ),
  invite_metrics as (
    select
      count(*) as total,
      count(*) filter (
        where status = 'pending'
          and expires_at > now()
      ) as pending,
      count(*) filter (where status = 'claimed') as claimed,
      count(*) filter (where status = 'qualified') as qualified,
      count(*) filter (
        where status = 'expired'
          or (status = 'pending' and expires_at <= now())
      ) as expired,
      count(*) filter (where status = 'revoked') as revoked,
      count(*) filter (where delivery_count > 0) as delivered,
      count(*) filter (where delivery_count = 0) as undelivered,
      count(*) filter (where created_at >= now() - interval '30 days') as created_30d
    from public.seller_growth_invites
    where campaign_id = p_campaign_id
  ),
  paid_metrics as (
    select count(distinct g.owner_id) as converted
    from public.promotional_plan_grants g
    join public.billing_subscriptions b
      on b.owner_id = g.owner_id
    where g.campaign_id = p_campaign_id
      and b.plan_id in ('launch', 'pro', 'scale', 'enterprise')
      and (
        b.status in ('active', 'past_due', 'unpaid')
        or (
          b.status = 'trialing'
          and (b.trial_ends_at is null or b.trial_ends_at >= now())
        )
      )
  ),
  event_metrics as (
    select
      count(*) filter (where event_type = 'fallback_applied') as fallback_applied,
      count(*) filter (where event_type = 'grant_expired') as grant_expired_events,
      max(created_at) as latest_event_at
    from public.seller_growth_events
    where campaign_id = p_campaign_id
  ),
  notice_metrics as (
    select count(*) as sent
    from public.promotional_grant_notices n
    join public.promotional_plan_grants g
      on g.id = n.grant_id
    where g.campaign_id = p_campaign_id
  )
  select jsonb_build_object(
    'grants_total', coalesce(g.total, 0),
    'grants_active', coalesce(g.active, 0),
    'grants_expired', coalesce(g.expired, 0),
    'grants_revoked', coalesce(g.revoked, 0),
    'grants_superseded', coalesce(g.superseded, 0),
    'welcome_grants', coalesce(g.welcome, 0),
    'referral_grants', coalesce(g.referral, 0),
    'grants_with_fallback', coalesce(g.fallback_selected, 0),
    'grants_issued_30d', coalesce(g.issued_30d, 0),
    'paid_conversions', coalesce(p.converted, 0),
    'invites_total', coalesce(i.total, 0),
    'invites_pending', coalesce(i.pending, 0),
    'invites_claimed', coalesce(i.claimed, 0),
    'invites_qualified', coalesce(i.qualified, 0),
    'invites_expired', coalesce(i.expired, 0),
    'invites_revoked', coalesce(i.revoked, 0),
    'invites_delivered', coalesce(i.delivered, 0),
    'invites_undelivered', coalesce(i.undelivered, 0),
    'invites_created_30d', coalesce(i.created_30d, 0),
    'fallback_applied', coalesce(e.fallback_applied, 0),
    'grant_expired_events', coalesce(e.grant_expired_events, 0),
    'notices_sent', coalesce(n.sent, 0),
    'latest_event_at', e.latest_event_at
  )
  from grant_metrics g
  cross join invite_metrics i
  cross join paid_metrics p
  cross join event_metrics e
  cross join notice_metrics n;
$$;

revoke all on function public.seller_growth_control_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.seller_growth_control_snapshot(uuid)
  to service_role;

-- All operator mutations and their audit row commit together. Replaying an
-- idempotency key returns the recorded result without applying the action twice.
create or replace function public.apply_seller_growth_campaign_control(
  p_campaign_id uuid,
  p_actor_id uuid,
  p_action text,
  p_reason text,
  p_idempotency_key text,
  p_max_grants integer default null,
  p_signup_closes_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_campaign public.seller_growth_campaigns%rowtype;
  v_existing public.seller_growth_campaign_admin_events%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_grant_count integer;
begin
  if p_actor_id is null then
    raise exception 'An operator identity is required.'
      using errcode = 'invalid_parameter_value';
  end if;

  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'A reason between 3 and 500 characters is required.'
      using errcode = 'invalid_parameter_value';
  end if;

  if char_length(coalesce(p_idempotency_key, '')) not between 8 and 160 then
    raise exception 'A valid idempotency key is required.'
      using errcode = 'invalid_parameter_value';
  end if;

  select *
  into v_campaign
  from public.seller_growth_campaigns
  where id = p_campaign_id
  for update;

  if v_campaign.id is null then
    raise exception 'Campaign not found.'
      using errcode = 'no_data_found';
  end if;

  select *
  into v_existing
  from public.seller_growth_campaign_admin_events
  where idempotency_key = p_idempotency_key;

  if v_existing.id is not null then
    if v_existing.campaign_id <> p_campaign_id
       or v_existing.actor_id is distinct from p_actor_id
       or v_existing.action <> p_action then
      raise exception 'The idempotency key was already used for another action.'
        using errcode = 'unique_violation';
    end if;
    return v_existing.after_state;
  end if;

  v_before := jsonb_build_object(
    'id', v_campaign.id,
    'status', v_campaign.status,
    'max_grants', v_campaign.max_grants,
    'signup_closes_at', v_campaign.signup_closes_at,
    'updated_at', v_campaign.updated_at
  );

  case p_action
    when 'pause' then
      if v_campaign.status <> 'active' then
        raise exception 'Only an active campaign can be paused.'
          using errcode = 'check_violation';
      end if;
      update public.seller_growth_campaigns
      set status = 'paused'
      where id = p_campaign_id
      returning * into v_campaign;

    when 'resume' then
      if v_campaign.status <> 'paused' then
        raise exception 'Only a paused campaign can be resumed.'
          using errcode = 'check_violation';
      end if;
      if v_campaign.signup_closes_at is not null
         and v_campaign.signup_closes_at <= now() then
        raise exception 'Move or clear the signup closing date before resuming.'
          using errcode = 'check_violation';
      end if;
      update public.seller_growth_campaigns
      set status = 'active'
      where id = p_campaign_id
      returning * into v_campaign;

    when 'end' then
      if v_campaign.status not in ('active', 'paused') then
        raise exception 'Only an active or paused campaign can be ended.'
          using errcode = 'check_violation';
      end if;
      update public.seller_growth_campaigns
      set status = 'ended'
      where id = p_campaign_id
      returning * into v_campaign;

    when 'set_capacity' then
      if v_campaign.status = 'ended' then
        raise exception 'An ended campaign cannot be changed.'
          using errcode = 'check_violation';
      end if;

      select count(*)
      into v_grant_count
      from public.promotional_plan_grants
      where campaign_id = p_campaign_id;

      if p_max_grants is null
         or p_max_grants < greatest(1, v_grant_count)
         or p_max_grants > 100000 then
        raise exception 'Capacity must be between the issued grant count and 100000.'
          using errcode = 'check_violation';
      end if;
      update public.seller_growth_campaigns
      set max_grants = p_max_grants
      where id = p_campaign_id
      returning * into v_campaign;

    when 'set_signup_close' then
      if v_campaign.status = 'ended' then
        raise exception 'An ended campaign cannot be changed.'
          using errcode = 'check_violation';
      end if;

      if p_signup_closes_at is not null
         and (
           p_signup_closes_at <= now()
           or p_signup_closes_at <= v_campaign.starts_at
         ) then
        raise exception 'The signup closing date must be in the future.'
          using errcode = 'check_violation';
      end if;
      update public.seller_growth_campaigns
      set signup_closes_at = p_signup_closes_at
      where id = p_campaign_id
      returning * into v_campaign;

    else
      raise exception 'Unsupported campaign action.'
        using errcode = 'invalid_parameter_value';
  end case;

  v_after := jsonb_build_object(
    'id', v_campaign.id,
    'status', v_campaign.status,
    'max_grants', v_campaign.max_grants,
    'signup_closes_at', v_campaign.signup_closes_at,
    'updated_at', v_campaign.updated_at
  );

  insert into public.seller_growth_campaign_admin_events (
    campaign_id,
    actor_id,
    action,
    reason,
    idempotency_key,
    before_state,
    after_state
  )
  values (
    p_campaign_id,
    p_actor_id,
    p_action,
    btrim(p_reason),
    p_idempotency_key,
    v_before,
    v_after
  );

  return v_after;
end;
$$;

revoke all on function public.apply_seller_growth_campaign_control(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_seller_growth_campaign_control(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  timestamptz
) to service_role;
