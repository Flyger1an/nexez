-- Bind every idempotency replay to the exact operator request. A key reused
-- with a different reason, target capacity, or signup date must fail closed
-- instead of returning the first action's response.

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
