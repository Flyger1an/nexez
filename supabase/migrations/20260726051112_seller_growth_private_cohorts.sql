-- Private seller cohorts built on the existing email-bound Launch pass
-- lifecycle. Existing campaigns remain open and existing invitations remain
-- referral passes until an operator explicitly changes enrollment mode.

alter table public.seller_growth_campaigns
  add column if not exists enrollment_mode text not null default 'open';

alter table public.seller_growth_campaigns
  drop constraint if exists seller_growth_campaigns_enrollment_mode_check;
alter table public.seller_growth_campaigns
  add constraint seller_growth_campaigns_enrollment_mode_check
  check (enrollment_mode in ('open', 'invite_only'));

comment on column public.seller_growth_campaigns.enrollment_mode is
  'open permits verified new-business grants; invite_only requires an email-bound cohort or referral claim.';

alter table public.seller_growth_invites
  add column if not exists invite_kind text not null default 'referral';
alter table public.seller_growth_invites
  add column if not exists cohort_label text;
alter table public.seller_growth_invites
  alter column inviter_owner_id drop not null;

alter table public.seller_growth_invites
  drop constraint if exists seller_growth_invites_invite_kind_check;
alter table public.seller_growth_invites
  add constraint seller_growth_invites_invite_kind_check
  check (invite_kind in ('referral', 'cohort'));

alter table public.seller_growth_invites
  drop constraint if exists seller_growth_invites_inviter_kind_check;
alter table public.seller_growth_invites
  add constraint seller_growth_invites_inviter_kind_check
  check (
    (invite_kind = 'referral' and inviter_owner_id is not null)
    or (invite_kind = 'cohort' and inviter_owner_id is null)
  );

alter table public.seller_growth_invites
  drop constraint if exists seller_growth_invites_cohort_label_check;
alter table public.seller_growth_invites
  add constraint seller_growth_invites_cohort_label_check
  check (
    cohort_label is null
    or char_length(btrim(cohort_label)) between 1 and 120
  );

create index if not exists seller_growth_cohort_roster_idx
  on public.seller_growth_invites (campaign_id, created_at desc)
  where invite_kind = 'cohort';

alter table public.seller_growth_campaign_admin_events
  drop constraint if exists seller_growth_campaign_admin_events_action_check;
alter table public.seller_growth_campaign_admin_events
  add constraint seller_growth_campaign_admin_events_action_check
  check (action in (
    'pause',
    'resume',
    'end',
    'set_capacity',
    'set_signup_close',
    'set_enrollment_mode',
    'cohort_add',
    'cohort_resend',
    'cohort_revoke'
  ));

-- Keep referral telemetry separate from platform-seeded cohort seats.
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
      and invite_kind = 'referral'
  ),
  cohort_metrics as (
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
      count(*) filter (where delivery_count = 0) as undelivered
    from public.seller_growth_invites
    where campaign_id = p_campaign_id
      and invite_kind = 'cohort'
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
    'cohort_total', coalesce(c.total, 0),
    'cohort_pending', coalesce(c.pending, 0),
    'cohort_claimed', coalesce(c.claimed, 0),
    'cohort_qualified', coalesce(c.qualified, 0),
    'cohort_expired', coalesce(c.expired, 0),
    'cohort_revoked', coalesce(c.revoked, 0),
    'cohort_delivered', coalesce(c.delivered, 0),
    'cohort_undelivered', coalesce(c.undelivered, 0),
    'fallback_applied', coalesce(e.fallback_applied, 0),
    'grant_expired_events', coalesce(e.grant_expired_events, 0),
    'notices_sent', coalesce(n.sent, 0),
    'latest_event_at', e.latest_event_at
  )
  from grant_metrics g
  cross join invite_metrics i
  cross join cohort_metrics c
  cross join paid_metrics p
  cross join event_metrics e
  cross join notice_metrics n;
$$;

revoke all on function public.seller_growth_control_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.seller_growth_control_snapshot(uuid)
  to service_role;

-- Invite-only mode changes only the direct new-business path. A claimed,
-- email-bound referral or cohort invitation remains valid in either mode.
create or replace function private.nz_maybe_issue_seller_growth_grant(p_owner uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_campaign public.seller_growth_campaigns%rowtype;
  v_invite public.seller_growth_invites%rowtype;
  v_user_created_at timestamptz;
  v_email_confirmed_at timestamptz;
  v_identity_keys text[];
  v_grant_id uuid;
  v_grant_count integer;
  v_is_new_account boolean;
  v_grant_source text;
begin
  if p_owner is null then
    return null;
  end if;

  select u.created_at, u.email_confirmed_at
  into v_user_created_at, v_email_confirmed_at
  from auth.users u
  where u.id = p_owner;

  if v_email_confirmed_at is null then
    return null;
  end if;

  if not exists (
    select 1
    from public.pages p
    where p.owner_id = p_owner
      and p.is_published is true
  ) then
    return null;
  end if;

  select c.*
  into v_campaign
  from public.seller_growth_campaigns c
  where c.status = 'active'
    and c.starts_at <= now()
    and (
      c.signup_closes_at is null
      or c.signup_closes_at >= now()
    )
  order by c.starts_at desc
  limit 1
  for update;

  if v_campaign.id is null then
    return null;
  end if;

  select i.*
  into v_invite
  from public.seller_growth_invites i
  where i.campaign_id = v_campaign.id
    and i.accepted_by_owner_id = p_owner
    and i.status = 'claimed'
  order by i.accepted_at desc nulls last
  limit 1;

  v_is_new_account :=
    v_user_created_at >= v_campaign.starts_at
    and (
      v_campaign.signup_closes_at is null
      or v_user_created_at <= v_campaign.signup_closes_at
    );

  if v_invite.id is null and (
    v_campaign.enrollment_mode = 'invite_only'
    or not v_is_new_account
  ) then
    return null;
  end if;

  -- A currently paid/trialing plan is already better served by Stripe billing.
  if exists (
    select 1
    from public.billing_subscriptions s
    where s.owner_id = p_owner
      and private.nz_plan_rank(s.plan_id) >= 1
      and (
        s.status in ('active', 'past_due', 'unpaid')
        or (
          s.status = 'trialing'
          and (s.trial_ends_at is null or s.trial_ends_at >= now())
        )
      )
  ) then
    return null;
  end if;

  select g.id into v_grant_id
  from public.promotional_plan_grants g
  where g.owner_id = p_owner
    and g.campaign_id = v_campaign.id;

  if v_grant_id is not null then
    if v_invite.id is not null then
      update public.seller_growth_invites
      set
        status = 'qualified',
        qualified_at = coalesce(qualified_at, now()),
        invitee_grant_id = v_grant_id
      where id = v_invite.id
        and status = 'claimed';
    end if;
    return v_grant_id;
  end if;

  v_identity_keys := private.nz_seller_growth_identity_keys(p_owner);
  if coalesce(cardinality(v_identity_keys), 0) = 0 then
    return null;
  end if;

  select count(*) into v_grant_count
  from public.promotional_plan_grants g
  where g.campaign_id = v_campaign.id;

  if v_grant_count >= v_campaign.max_grants then
    return null;
  end if;

  if exists (
    select 1
    from public.seller_growth_business_claims c
    where c.campaign_id = v_campaign.id
      and c.identity_key = any(v_identity_keys)
  ) then
    return null;
  end if;

  v_grant_source := case
    when v_invite.id is null or v_invite.invite_kind = 'cohort' then 'welcome'
    else 'referral'
  end;

  insert into public.promotional_plan_grants (
    owner_id,
    campaign_id,
    plan_id,
    source,
    source_invite_id,
    starts_at,
    ends_at,
    metadata
  )
  values (
    p_owner,
    v_campaign.id,
    v_campaign.grant_plan_id,
    v_grant_source,
    v_invite.id,
    now(),
    now() + make_interval(days => v_campaign.grant_duration_days),
    jsonb_build_object(
      'campaign_key', v_campaign.campaign_key,
      'invite_kind', case when v_invite.id is null then null else v_invite.invite_kind end
    )
  )
  returning id into v_grant_id;

  insert into public.seller_growth_business_claims (
    campaign_id,
    grant_id,
    identity_key
  )
  select v_campaign.id, v_grant_id, identity.identity_key
  from unnest(v_identity_keys) as identity(identity_key);

  insert into public.seller_growth_events (
    campaign_id,
    owner_id,
    invite_id,
    grant_id,
    event_type,
    metadata
  )
  values (
    v_campaign.id,
    p_owner,
    v_invite.id,
    v_grant_id,
    'grant_issued',
    jsonb_build_object(
      'plan_id', v_campaign.grant_plan_id,
      'duration_days', v_campaign.grant_duration_days,
      'source', v_grant_source,
      'invite_kind', case when v_invite.id is null then null else v_invite.invite_kind end
    )
  );

  if v_invite.id is not null then
    update public.seller_growth_invites
    set
      status = 'qualified',
      qualified_at = now(),
      invitee_grant_id = v_grant_id
    where id = v_invite.id
      and status = 'claimed';

    insert into public.seller_growth_events (
      campaign_id,
      owner_id,
      invite_id,
      grant_id,
      event_type,
      metadata
    )
    values (
      v_campaign.id,
      p_owner,
      v_invite.id,
      v_grant_id,
      'invite_qualified',
      jsonb_build_object('invite_kind', v_invite.invite_kind)
    );
  end if;

  return v_grant_id;
exception
  when unique_violation then
    return null;
end;
$$;

revoke all on function private.nz_maybe_issue_seller_growth_grant(uuid)
  from public, anon, authenticated;

-- Cohort rows are created only by the service-role admin route. They do not
-- consume seller referral slots and do not require an inviter grant.
create or replace function private.nz_enforce_seller_growth_invite()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_campaign public.seller_growth_campaigns%rowtype;
  v_count integer;
  v_inviter_email text;
begin
  new.invitee_email := lower(btrim(new.invitee_email));

  if new.invite_kind = 'referral' and new.inviter_owner_id is null then
    raise exception 'A referral pass requires an inviter.'
      using errcode = 'check_violation';
  end if;
  if new.invite_kind = 'cohort' and new.inviter_owner_id is not null then
    raise exception 'A cohort seat cannot be assigned to a seller inviter.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'pending' and new.status = 'claimed' then
      select c.*
      into v_campaign
      from public.seller_growth_campaigns c
      where c.id = new.campaign_id
      for update;

      if v_campaign.id is null
         or v_campaign.status <> 'active'
         or v_campaign.starts_at > now()
         or (
           v_campaign.signup_closes_at is not null
           and v_campaign.signup_closes_at < now()
         )
         or old.expires_at <= now() then
        raise exception 'This Launch pass campaign is no longer accepting claims.'
          using errcode = 'check_violation';
      end if;

      if new.accepted_by_owner_id is null then
        raise exception 'A claimed Launch pass requires an account owner.'
          using errcode = 'check_violation';
      end if;

      if public.owner_plan_rank(new.accepted_by_owner_id) > 0 then
        raise exception 'This account already has paid or promotional plan access.'
          using errcode = 'check_violation';
      end if;

      if not exists (
        select 1
        from auth.users u
        where u.id = new.accepted_by_owner_id
          and u.email_confirmed_at is not null
          and lower(u.email) = new.invitee_email
      ) then
        raise exception 'Sign in with the verified invitation email to claim this pass.'
          using errcode = 'check_violation';
      end if;

      return new;
    end if;

    if new.status <> 'pending' or old.status = 'pending' then
      return new;
    end if;
  end if;

  select c.*
  into v_campaign
  from public.seller_growth_campaigns c
  where c.id = new.campaign_id
  for update;

  if v_campaign.id is null
     or v_campaign.status <> 'active'
     or v_campaign.starts_at > now()
     or (
       v_campaign.signup_closes_at is not null
       and v_campaign.signup_closes_at < now()
     ) then
    raise exception 'This invitation campaign is not accepting new invitations.'
      using errcode = 'check_violation';
  end if;

  if new.invite_kind = 'cohort' then
    return new;
  end if;

  if not exists (
    select 1
    from public.promotional_plan_grants g
    where g.owner_id = new.inviter_owner_id
      and g.campaign_id = new.campaign_id
      and g.status = 'active'
      and g.starts_at <= now()
      and g.ends_at > now()
  ) then
    raise exception 'Activate your complimentary Launch access before inviting another business.'
      using errcode = 'check_violation';
  end if;

  select lower(u.email) into v_inviter_email
  from auth.users u
  where u.id = new.inviter_owner_id;

  if v_inviter_email is not null and v_inviter_email = new.invitee_email then
    raise exception 'You cannot invite your own email address.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    select count(*) into v_count
    from public.seller_growth_invites i
    where i.inviter_owner_id = new.inviter_owner_id
      and i.campaign_id = new.campaign_id
      and i.invite_kind = 'referral';

    if v_count >= v_campaign.invite_slots * 5 then
      raise exception 'This account has reached the campaign invitation limit.'
        using errcode = 'check_violation';
    end if;
  end if;

  select count(*) into v_count
  from public.seller_growth_invites i
  where i.inviter_owner_id = new.inviter_owner_id
    and i.campaign_id = new.campaign_id
    and i.invite_kind = 'referral'
    and (
      i.status in ('claimed', 'qualified')
      or (i.status = 'pending' and i.expires_at > now())
    );

  if v_count >= v_campaign.invite_slots then
    raise exception 'Both Launch passes are already in use.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function private.nz_enforce_seller_growth_invite()
  from public, anon, authenticated;

-- Replace the campaign-control RPC with an enrollment-mode-aware version.
drop function if exists public.apply_seller_growth_campaign_control(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  timestamptz
);

create function public.apply_seller_growth_campaign_control(
  p_campaign_id uuid,
  p_actor_id uuid,
  p_action text,
  p_reason text,
  p_idempotency_key text,
  p_max_grants integer default null,
  p_signup_closes_at timestamptz default null,
  p_enrollment_mode text default null
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
  v_existing_signup_close timestamptz;
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

  if p_action <> 'set_capacity' and p_max_grants is not null then
    raise exception 'Capacity is valid only for a capacity action.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_action <> 'set_signup_close' and p_signup_closes_at is not null then
    raise exception 'A signup closing date is valid only for a signup-date action.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_action <> 'set_enrollment_mode' and p_enrollment_mode is not null then
    raise exception 'Enrollment mode is valid only for an enrollment-mode action.'
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
    v_existing_signup_close := case
      when nullif(v_existing.after_state ->> 'signup_closes_at', '') is null
        then null
      else (v_existing.after_state ->> 'signup_closes_at')::timestamptz
    end;

    if v_existing.campaign_id <> p_campaign_id
       or v_existing.actor_id is distinct from p_actor_id
       or v_existing.action <> p_action
       or v_existing.reason <> btrim(p_reason)
       or (
         p_action = 'set_capacity'
         and (v_existing.after_state ->> 'max_grants')::integer
           is distinct from p_max_grants
       )
       or (
         p_action = 'set_signup_close'
         and v_existing_signup_close is distinct from p_signup_closes_at
       )
       or (
         p_action = 'set_enrollment_mode'
         and v_existing.after_state ->> 'enrollment_mode'
           is distinct from p_enrollment_mode
       ) then
      raise exception 'The idempotency key was already used for another request.'
        using errcode = 'unique_violation';
    end if;
    return v_existing.after_state;
  end if;

  v_before := jsonb_build_object(
    'id', v_campaign.id,
    'status', v_campaign.status,
    'max_grants', v_campaign.max_grants,
    'signup_closes_at', v_campaign.signup_closes_at,
    'enrollment_mode', v_campaign.enrollment_mode,
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

    when 'set_enrollment_mode' then
      if v_campaign.status = 'ended' then
        raise exception 'An ended campaign cannot be changed.'
          using errcode = 'check_violation';
      end if;
      if p_enrollment_mode not in ('open', 'invite_only') then
        raise exception 'Choose open or invite-only enrollment.'
          using errcode = 'invalid_parameter_value';
      end if;
      update public.seller_growth_campaigns
      set enrollment_mode = p_enrollment_mode
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
    'enrollment_mode', v_campaign.enrollment_mode,
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
  timestamptz,
  text
) from public, anon, authenticated;
grant execute on function public.apply_seller_growth_campaign_control(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  timestamptz,
  text
) to service_role;

-- Add, renew, and revoke cohort seats atomically with their operator audit.
create or replace function public.apply_seller_growth_cohort_control(
  p_campaign_id uuid,
  p_actor_id uuid,
  p_action text,
  p_reason text,
  p_idempotency_key text,
  p_member_id uuid default null,
  p_email text default null,
  p_label text default null,
  p_token_hash text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_campaign public.seller_growth_campaigns%rowtype;
  v_member public.seller_growth_invites%rowtype;
  v_existing public.seller_growth_campaign_admin_events%rowtype;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_expires_at timestamptz;
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
  if p_action not in ('cohort_add', 'cohort_resend', 'cohort_revoke') then
    raise exception 'Unsupported cohort action.'
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
       or v_existing.action <> p_action
       or v_existing.reason <> btrim(p_reason)
       or (
         p_action = 'cohort_add'
         and (
           v_existing.after_state ->> 'email' is distinct from v_email
           or v_existing.after_state ->> 'label' is distinct from v_label
           or (
             nullif(v_existing.after_state ->> 'requested_expires_at', '')
           )::timestamptz is distinct from p_expires_at
         )
       )
       or (
         p_action in ('cohort_resend', 'cohort_revoke')
         and (v_existing.after_state ->> 'member_id')::uuid
           is distinct from p_member_id
       )
       or (
         p_action = 'cohort_resend'
         and (
           nullif(v_existing.after_state ->> 'requested_expires_at', '')
         )::timestamptz is distinct from p_expires_at
       ) then
      raise exception 'The idempotency key was already used for another request.'
        using errcode = 'unique_violation';
    end if;
    return v_existing.after_state || jsonb_build_object('replayed', true);
  end if;

  if p_action in ('cohort_add', 'cohort_resend') then
    if v_campaign.status <> 'active'
       or v_campaign.starts_at > now()
       or (
         v_campaign.signup_closes_at is not null
         and v_campaign.signup_closes_at < now()
       ) then
      raise exception 'This campaign is not accepting cohort invitations.'
        using errcode = 'check_violation';
    end if;
    if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
      raise exception 'A valid invitation token hash is required.'
        using errcode = 'invalid_parameter_value';
    end if;
    v_expires_at := coalesce(
      p_expires_at,
      now() + make_interval(days => v_campaign.invite_expires_days)
    );
    if v_expires_at <= now() or v_expires_at > now() + interval '90 days' then
      raise exception 'Cohort invitations must expire within 90 days.'
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  case p_action
    when 'cohort_add' then
      if p_member_id is not null then
        raise exception 'A new cohort seat cannot include a member id.'
          using errcode = 'invalid_parameter_value';
      end if;
      if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
        raise exception 'Enter a valid business email.'
          using errcode = 'invalid_parameter_value';
      end if;
      if v_label is not null and char_length(v_label) > 120 then
        raise exception 'Cohort labels cannot exceed 120 characters.'
          using errcode = 'invalid_parameter_value';
      end if;

      insert into public.seller_growth_invites (
        campaign_id,
        inviter_owner_id,
        inviter_business_name,
        invitee_email,
        token_hash,
        invite_kind,
        cohort_label,
        status,
        expires_at
      )
      values (
        p_campaign_id,
        null,
        'Nexez',
        v_email,
        p_token_hash,
        'cohort',
        v_label,
        'pending',
        v_expires_at
      )
      returning * into v_member;

    when 'cohort_resend' then
      if p_member_id is null or p_email is not null or p_label is not null then
        raise exception 'Renewing a cohort seat requires only its member id.'
          using errcode = 'invalid_parameter_value';
      end if;

      select *
      into v_member
      from public.seller_growth_invites
      where id = p_member_id
        and campaign_id = p_campaign_id
        and invite_kind = 'cohort'
      for update;

      if v_member.id is null then
        raise exception 'Cohort member not found.'
          using errcode = 'no_data_found';
      end if;
      if v_member.status not in ('pending', 'expired', 'revoked') then
        raise exception 'Only an unused cohort invitation can be renewed.'
          using errcode = 'check_violation';
      end if;

      v_before := jsonb_build_object(
        'member_id', v_member.id,
        'email', v_member.invitee_email,
        'label', v_member.cohort_label,
        'status', v_member.status,
        'expires_at', v_member.expires_at
      );

      update public.seller_growth_invites
      set
        token_hash = p_token_hash,
        status = 'pending',
        expires_at = v_expires_at,
        accepted_by_owner_id = null,
        accepted_at = null,
        qualified_at = null,
        invitee_grant_id = null
      where id = v_member.id
      returning * into v_member;

    when 'cohort_revoke' then
      if p_member_id is null
         or p_email is not null
         or p_label is not null
         or p_token_hash is not null
         or p_expires_at is not null then
        raise exception 'Revoking a cohort seat requires only its member id.'
          using errcode = 'invalid_parameter_value';
      end if;

      select *
      into v_member
      from public.seller_growth_invites
      where id = p_member_id
        and campaign_id = p_campaign_id
        and invite_kind = 'cohort'
      for update;

      if v_member.id is null then
        raise exception 'Cohort member not found.'
          using errcode = 'no_data_found';
      end if;
      if v_member.status not in ('pending', 'claimed', 'expired') then
        raise exception 'This cohort seat cannot be revoked.'
          using errcode = 'check_violation';
      end if;

      v_before := jsonb_build_object(
        'member_id', v_member.id,
        'email', v_member.invitee_email,
        'label', v_member.cohort_label,
        'status', v_member.status,
        'expires_at', v_member.expires_at
      );

      update public.seller_growth_invites
      set status = 'revoked'
      where id = v_member.id
      returning * into v_member;
  end case;

  v_after := jsonb_build_object(
    'member_id', v_member.id,
    'email', v_member.invitee_email,
    'label', v_member.cohort_label,
    'status', v_member.status,
    'expires_at', v_member.expires_at,
    'accepted_at', v_member.accepted_at,
    'qualified_at', v_member.qualified_at,
    'delivery_count', v_member.delivery_count,
    'last_sent_at', v_member.last_sent_at,
    'requested_expires_at', p_expires_at,
    'replayed', false
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
    v_after - 'replayed'
  );

  return v_after;
end;
$$;

revoke all on function public.apply_seller_growth_cohort_control(
  uuid,
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_seller_growth_cohort_control(
  uuid,
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz
) to service_role;

create or replace function public.record_seller_growth_cohort_delivery(
  p_member_id uuid
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  update public.seller_growth_invites
  set
    delivery_count = delivery_count + 1,
    last_sent_at = now()
  where id = p_member_id
    and invite_kind = 'cohort'
    and status = 'pending'
  returning jsonb_build_object(
    'member_id', id,
    'delivery_count', delivery_count,
    'last_sent_at', last_sent_at
  );
$$;

revoke all on function public.record_seller_growth_cohort_delivery(uuid)
  from public, anon, authenticated;
grant execute on function public.record_seller_growth_cohort_delivery(uuid)
  to service_role;
