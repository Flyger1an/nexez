-- Controlled private-cohort rollout. Candidates are staged separately from
-- delivery, and automated release is limited to verified addresses in a
-- bounded wave. Delivery claims are recoverable and provider-idempotent.

alter table public.seller_growth_invites
  add column if not exists cohort_wave integer;
alter table public.seller_growth_invites
  add column if not exists email_verification_status text not null default 'unverified';
alter table public.seller_growth_invites
  add column if not exists email_verification_provider text;
alter table public.seller_growth_invites
  add column if not exists email_verified_at timestamptz;
alter table public.seller_growth_invites
  add column if not exists rollout_state text not null default 'legacy';
alter table public.seller_growth_invites
  add column if not exists rollout_claimed_at timestamptz;
alter table public.seller_growth_invites
  add column if not exists rollout_attempts integer not null default 0;
alter table public.seller_growth_invites
  add column if not exists rollout_last_error text;
alter table public.seller_growth_invites
  add column if not exists rollout_provider_message_id text;
alter table public.seller_growth_invites
  add column if not exists rollout_released_at timestamptz;
alter table public.seller_growth_invites
  add column if not exists rollout_release_key text;
alter table public.seller_growth_invites
  add column if not exists rollout_token_seed text;

update public.seller_growth_invites
set
  cohort_wave = coalesce(cohort_wave, 1),
  email_verification_status = case
    when delivery_count > 0 then 'valid'
    else email_verification_status
  end,
  email_verification_provider = case
    when delivery_count > 0 then coalesce(email_verification_provider, 'legacy_delivery')
    else email_verification_provider
  end,
  email_verified_at = case
    when delivery_count > 0 then coalesce(email_verified_at, last_sent_at, created_at)
    else email_verified_at
  end,
  rollout_state = case
    when delivery_count > 0 then 'sent'
    when rollout_state = 'legacy' then 'staged'
    else rollout_state
  end,
  rollout_released_at = case
    when delivery_count > 0 then coalesce(rollout_released_at, last_sent_at)
    else rollout_released_at
  end
where invite_kind = 'cohort';

alter table public.seller_growth_invites
  drop constraint if exists seller_growth_invites_cohort_wave_check;
alter table public.seller_growth_invites
  add constraint seller_growth_invites_cohort_wave_check
  check (cohort_wave is null or cohort_wave between 1 and 20);

alter table public.seller_growth_invites
  drop constraint if exists seller_growth_invites_email_verification_status_check;
alter table public.seller_growth_invites
  add constraint seller_growth_invites_email_verification_status_check
  check (email_verification_status in ('unverified', 'valid', 'risky', 'invalid', 'unknown'));

alter table public.seller_growth_invites
  drop constraint if exists seller_growth_invites_verification_provider_check;
alter table public.seller_growth_invites
  add constraint seller_growth_invites_verification_provider_check
  check (
    email_verification_provider is null
    or char_length(btrim(email_verification_provider)) between 1 and 120
  );

alter table public.seller_growth_invites
  drop constraint if exists seller_growth_invites_rollout_state_check;
alter table public.seller_growth_invites
  add constraint seller_growth_invites_rollout_state_check
  check (rollout_state in ('legacy', 'staged', 'ready', 'releasing', 'sent', 'failed', 'suppressed'));

alter table public.seller_growth_invites
  drop constraint if exists seller_growth_invites_rollout_attempts_check;
alter table public.seller_growth_invites
  add constraint seller_growth_invites_rollout_attempts_check
  check (rollout_attempts between 0 and 3);

alter table public.seller_growth_invites
  drop constraint if exists seller_growth_invites_rollout_last_error_check;
alter table public.seller_growth_invites
  add constraint seller_growth_invites_rollout_last_error_check
  check (rollout_last_error is null or char_length(rollout_last_error) between 1 and 500);

create index if not exists seller_growth_cohort_wave_release_idx
  on public.seller_growth_invites (
    campaign_id,
    cohort_wave,
    rollout_state,
    email_verification_status,
    created_at
  )
  where invite_kind = 'cohort' and delivery_count = 0;

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
    'cohort_revoke',
    'cohort_stage_batch',
    'cohort_release_wave'
  ));

create or replace function public.stage_seller_growth_cohort_batch(
  p_campaign_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_idempotency_key text,
  p_candidates jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_campaign public.seller_growth_campaigns%rowtype;
  v_event public.seller_growth_campaign_admin_events%rowtype;
  v_existing public.seller_growth_invites%rowtype;
  v_item jsonb;
  v_email text;
  v_label text;
  v_provider text;
  v_verification text;
  v_wave integer;
  v_rollout_state text;
  v_input_digest text := md5(coalesce(p_candidates, 'null'::jsonb)::text);
  v_result jsonb;
  v_staged integer := 0;
  v_updated integer := 0;
  v_duplicates integer := 0;
  v_waves jsonb;
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
  if jsonb_typeof(p_candidates) is distinct from 'array'
     or jsonb_array_length(p_candidates) not between 1 and 100 then
    raise exception 'Stage between 1 and 100 cohort candidates at a time.'
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
  if v_campaign.status = 'ended' then
    raise exception 'An ended campaign cannot accept staged candidates.'
      using errcode = 'check_violation';
  end if;

  select *
  into v_event
  from public.seller_growth_campaign_admin_events
  where idempotency_key = p_idempotency_key;

  if v_event.id is not null then
    if v_event.campaign_id <> p_campaign_id
       or v_event.actor_id is distinct from p_actor_id
       or v_event.action <> 'cohort_stage_batch'
       or v_event.reason <> btrim(p_reason)
       or v_event.after_state ->> 'input_digest' is distinct from v_input_digest then
      raise exception 'The idempotency key was already used for another request.'
        using errcode = 'unique_violation';
    end if;
    return v_event.after_state || jsonb_build_object('replayed', true);
  end if;

  if exists (
    select 1
    from (
      select lower(btrim(candidate ->> 'email')) as email
      from jsonb_array_elements(p_candidates) as candidate
      group by lower(btrim(candidate ->> 'email'))
      having count(*) > 1
    ) as duplicate_input
  ) then
    raise exception 'The batch contains duplicate email addresses.'
      using errcode = 'unique_violation';
  end if;

  for v_item in select value from jsonb_array_elements(p_candidates)
  loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'Every cohort candidate must be an object.'
        using errcode = 'invalid_parameter_value';
    end if;

    v_email := lower(btrim(coalesce(v_item ->> 'email', '')));
    v_label := nullif(btrim(coalesce(v_item ->> 'label', '')), '');
    v_wave := coalesce((v_item ->> 'wave')::integer, 0);
    v_verification := lower(btrim(coalesce(v_item ->> 'verificationStatus', 'unverified')));
    v_provider := nullif(lower(btrim(coalesce(v_item ->> 'verificationProvider', ''))), '');

    if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
      raise exception 'Every candidate must have a valid business email.'
        using errcode = 'invalid_parameter_value';
    end if;
    if v_label is not null and char_length(v_label) > 120 then
      raise exception 'Cohort labels cannot exceed 120 characters.'
        using errcode = 'invalid_parameter_value';
    end if;
    if v_wave not between 1 and 20 then
      raise exception 'Cohort waves must be between 1 and 20.'
        using errcode = 'invalid_parameter_value';
    end if;
    if v_verification not in ('unverified', 'valid', 'risky', 'invalid', 'unknown') then
      raise exception 'Unsupported email verification status.'
        using errcode = 'invalid_parameter_value';
    end if;
    if v_verification <> 'unverified' and v_provider is null then
      raise exception 'Verified results must identify their verification provider.'
        using errcode = 'invalid_parameter_value';
    end if;
    if v_verification = 'valid' and v_provider not in ('millionverifier', 'apollo') then
      raise exception 'Valid release candidates require Apollo or MillionVerifier evidence.'
        using errcode = 'invalid_parameter_value';
    end if;
    if v_provider is not null and char_length(v_provider) > 120 then
      raise exception 'Verification provider names cannot exceed 120 characters.'
        using errcode = 'invalid_parameter_value';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_candidates)
  loop
    v_email := lower(btrim(v_item ->> 'email'));
    v_label := nullif(btrim(coalesce(v_item ->> 'label', '')), '');
    v_wave := (v_item ->> 'wave')::integer;
    v_verification := lower(btrim(coalesce(v_item ->> 'verificationStatus', 'unverified')));
    v_provider := nullif(lower(btrim(coalesce(v_item ->> 'verificationProvider', ''))), '');
    v_rollout_state := case
      when v_verification = 'valid' then 'ready'
      when v_verification in ('risky', 'invalid') then 'suppressed'
      else 'staged'
    end;

    select *
    into v_existing
    from public.seller_growth_invites
    where campaign_id = p_campaign_id
      and invitee_email = v_email
    for update;

    if v_existing.id is null then
      insert into public.seller_growth_invites (
        campaign_id,
        inviter_owner_id,
        inviter_business_name,
        invitee_email,
        token_hash,
        invite_kind,
        cohort_label,
        status,
        expires_at,
        cohort_wave,
        email_verification_status,
        email_verification_provider,
        email_verified_at,
        rollout_state
      )
      values (
        p_campaign_id,
        null,
        'Nexez',
        v_email,
        md5(p_idempotency_key || ':' || v_email || ':' || gen_random_uuid()::text)
          || md5(v_email || ':' || p_idempotency_key || ':' || gen_random_uuid()::text),
        'cohort',
        v_label,
        'pending',
        statement_timestamp() + make_interval(days => v_campaign.invite_expires_days),
        v_wave,
        v_verification,
        v_provider,
        case when v_verification = 'unverified' then null else statement_timestamp() end,
        v_rollout_state
      );
      v_staged := v_staged + 1;
    elsif v_existing.invite_kind = 'cohort'
          and v_existing.status = 'pending'
          and v_existing.delivery_count = 0
          and v_existing.rollout_state not in ('releasing', 'sent') then
      update public.seller_growth_invites
      set
        cohort_label = v_label,
        cohort_wave = v_wave,
        email_verification_status = v_verification,
        email_verification_provider = v_provider,
        email_verified_at = case
          when v_verification = 'unverified' then null
          else statement_timestamp()
        end,
        rollout_state = v_rollout_state,
        rollout_last_error = null,
        rollout_claimed_at = null,
        rollout_release_key = null,
        rollout_token_seed = null,
        expires_at = statement_timestamp() + make_interval(days => v_campaign.invite_expires_days)
      where id = v_existing.id;
      v_updated := v_updated + 1;
    else
      v_duplicates := v_duplicates + 1;
    end if;
  end loop;

  select coalesce(jsonb_agg(wave order by wave), '[]'::jsonb)
  into v_waves
  from (
    select distinct (candidate ->> 'wave')::integer as wave
    from jsonb_array_elements(p_candidates) as candidate
  ) as distinct_waves;

  v_result := jsonb_build_object(
    'candidate_count', jsonb_array_length(p_candidates),
    'staged_count', v_staged,
    'updated_count', v_updated,
    'duplicate_count', v_duplicates,
    'waves', v_waves,
    'input_digest', v_input_digest,
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
    'cohort_stage_batch',
    btrim(p_reason),
    p_idempotency_key,
    '{}'::jsonb,
    v_result - 'replayed'
  );

  return v_result;
end;
$$;

revoke all on function public.stage_seller_growth_cohort_batch(
  uuid,
  uuid,
  text,
  text,
  jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.stage_seller_growth_cohort_batch(
  uuid,
  uuid,
  text,
  text,
  jsonb
) to service_role;

create or replace function public.claim_seller_growth_cohort_wave(
  p_campaign_id uuid,
  p_actor_id uuid,
  p_wave integer,
  p_limit integer,
  p_reason text,
  p_confirmation text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_campaign public.seller_growth_campaigns%rowtype;
  v_event public.seller_growth_campaign_admin_events%rowtype;
  v_members jsonb := '[]'::jsonb;
  v_result jsonb;
  v_delivered_count integer := 0;
  v_failed_count integer := 0;
begin
  if p_actor_id is null then
    raise exception 'An operator identity is required.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_wave is null or p_wave not between 1 and 20 then
    raise exception 'Cohort waves must be between 1 and 20.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_limit is null or p_limit not between 1 and 25 then
    raise exception 'Release between 1 and 25 candidates at a time.'
      using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(p_confirmation, '') <> 'RELEASE WAVE ' || p_wave::text then
    raise exception 'The release confirmation does not match this wave.'
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
  if v_campaign.status <> 'active'
     or v_campaign.starts_at > statement_timestamp()
     or (
       v_campaign.signup_closes_at is not null
       and v_campaign.signup_closes_at < statement_timestamp()
     ) then
    raise exception 'This campaign is not accepting cohort releases.'
      using errcode = 'check_violation';
  end if;

  select *
  into v_event
  from public.seller_growth_campaign_admin_events
  where idempotency_key = p_idempotency_key;

  if v_event.id is not null then
    if v_event.campaign_id <> p_campaign_id
       or v_event.actor_id is distinct from p_actor_id
       or v_event.action <> 'cohort_release_wave'
       or v_event.reason <> btrim(p_reason)
       or (v_event.after_state ->> 'wave')::integer is distinct from p_wave
       or (v_event.after_state ->> 'limit')::integer is distinct from p_limit then
      raise exception 'The idempotency key was already used for another request.'
        using errcode = 'unique_violation';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'member_id', invitation.id,
      'email', invitation.invitee_email,
      'label', invitation.cohort_label,
      'token_seed', invitation.rollout_token_seed,
      'attempt', invitation.rollout_attempts
    ) order by invitation.created_at, invitation.id), '[]'::jsonb)
    into v_members
    from public.seller_growth_invites as invitation
    where invitation.campaign_id = p_campaign_id
      and invitation.rollout_release_key = p_idempotency_key
      and invitation.rollout_state = 'releasing'
      and invitation.rollout_token_seed is not null;

    select
      count(*) filter (where invitation.rollout_state = 'sent')::integer,
      count(*) filter (where invitation.rollout_state in ('failed', 'suppressed'))::integer
    into v_delivered_count, v_failed_count
    from public.seller_growth_invites as invitation
    where invitation.campaign_id = p_campaign_id
      and invitation.rollout_release_key = p_idempotency_key;

    return jsonb_build_object(
      'wave', p_wave,
      'limit', p_limit,
      'members', v_members,
      'selected_count', coalesce((v_event.after_state ->> 'selected_count')::integer, 0),
      'already_delivered_count', v_delivered_count,
      'already_failed_count', v_failed_count,
      'replayed', true
    );
  end if;

  with candidate_rows as materialized (
    select
      invitation.id,
      invitation.rollout_state,
      invitation.rollout_attempts,
      invitation.rollout_token_seed
    from public.seller_growth_invites as invitation
    where invitation.campaign_id = p_campaign_id
      and invitation.invite_kind = 'cohort'
      and invitation.cohort_wave = p_wave
      and invitation.email_verification_status = 'valid'
      and invitation.status = 'pending'
      and invitation.delivery_count = 0
      and (
        (
          invitation.rollout_state in ('ready', 'failed')
          and invitation.rollout_attempts < 3
        )
        or (
          invitation.rollout_state = 'releasing'
          and invitation.rollout_claimed_at < statement_timestamp() - interval '15 minutes'
          and invitation.rollout_token_seed is not null
          and invitation.rollout_attempts between 1 and 3
        )
      )
    order by invitation.created_at, invitation.id
    for update skip locked
    limit p_limit
  ),
  prepared as (
    select
      candidate.id,
      case
        when candidate.rollout_state = 'releasing' then candidate.rollout_token_seed
        else gen_random_uuid()::text
      end as token_seed,
      case
        when candidate.rollout_state = 'releasing' then candidate.rollout_attempts
        else candidate.rollout_attempts + 1
      end as attempt
    from candidate_rows as candidate
  ),
  updated as (
    update public.seller_growth_invites as invitation
    set
      rollout_state = 'releasing',
      rollout_claimed_at = statement_timestamp(),
      rollout_attempts = prepared.attempt,
      rollout_last_error = null,
      rollout_release_key = p_idempotency_key,
      rollout_token_seed = prepared.token_seed,
      token_hash = encode(
        extensions.digest(
          'nexez-seller-growth-v1:'
            || rtrim(translate(encode(
              extensions.digest(
                'nexez-seller-growth-cohort-v1:' || prepared.token_seed,
                'sha256'
              ),
              'base64'
            ), '+/', '-_'), '='),
          'sha256'
        ),
        'hex'
      ),
      expires_at = statement_timestamp() + make_interval(days => v_campaign.invite_expires_days)
    from prepared
    where invitation.id = prepared.id
    returning
      invitation.id,
      invitation.invitee_email,
      invitation.cohort_label,
      invitation.rollout_token_seed,
      invitation.rollout_attempts,
      invitation.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'member_id', updated.id,
    'email', updated.invitee_email,
    'label', updated.cohort_label,
    'token_seed', updated.rollout_token_seed,
    'attempt', updated.rollout_attempts
  ) order by updated.created_at, updated.id), '[]'::jsonb)
  into v_members
  from updated;

  v_result := jsonb_build_object(
    'wave', p_wave,
    'limit', p_limit,
    'member_ids', coalesce((
      select jsonb_agg(member ->> 'member_id')
      from jsonb_array_elements(v_members) as member
    ), '[]'::jsonb),
    'selected_count', jsonb_array_length(v_members),
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
    'cohort_release_wave',
    btrim(p_reason),
    p_idempotency_key,
    '{}'::jsonb,
    v_result - 'replayed'
  );

  return jsonb_build_object(
    'wave', p_wave,
    'limit', p_limit,
    'members', v_members,
    'selected_count', jsonb_array_length(v_members),
    'already_delivered_count', 0,
    'already_failed_count', 0,
    'replayed', false
  );
end;
$$;

revoke all on function public.claim_seller_growth_cohort_wave(
  uuid,
  uuid,
  integer,
  integer,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.claim_seller_growth_cohort_wave(
  uuid,
  uuid,
  integer,
  integer,
  text,
  text,
  text
) to service_role;

create or replace function public.record_seller_growth_cohort_delivery_result(
  p_member_id uuid,
  p_release_key text,
  p_delivered boolean,
  p_error text default null,
  p_provider_message_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  if p_member_id is null
     or char_length(coalesce(p_release_key, '')) not between 8 and 160 then
    raise exception 'A member and release key are required.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_delivered is null then
    raise exception 'A delivery result is required.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_delivered is false and nullif(btrim(coalesce(p_error, '')), '') is null then
    raise exception 'A failed delivery must include an error.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.seller_growth_invites
  set
    rollout_state = case
      when p_delivered then 'sent'
      when rollout_attempts >= 3 then 'suppressed'
      else 'failed'
    end,
    rollout_claimed_at = null,
    rollout_last_error = case
      when p_delivered then null
      else left(btrim(p_error), 500)
    end,
    rollout_provider_message_id = case
      when p_delivered then nullif(btrim(coalesce(p_provider_message_id, '')), '')
      else rollout_provider_message_id
    end,
    rollout_released_at = case
      when p_delivered then statement_timestamp()
      else rollout_released_at
    end,
    rollout_token_seed = null,
    delivery_count = delivery_count + case when p_delivered then 1 else 0 end,
    last_sent_at = case when p_delivered then statement_timestamp() else last_sent_at end
  where id = p_member_id
    and invite_kind = 'cohort'
    and rollout_state = 'releasing'
    and rollout_release_key = p_release_key
  returning jsonb_build_object(
    'member_id', id,
    'rollout_state', rollout_state,
    'attempts', rollout_attempts,
    'delivery_count', delivery_count,
    'last_sent_at', last_sent_at
  )
  into v_result;

  if v_result is null then
    raise exception 'The cohort delivery claim is no longer active.'
      using errcode = 'check_violation';
  end if;

  return v_result;
end;
$$;

revoke all on function public.record_seller_growth_cohort_delivery_result(
  uuid,
  text,
  boolean,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.record_seller_growth_cohort_delivery_result(
  uuid,
  text,
  boolean,
  text,
  text
) to service_role;

create or replace function public.seller_growth_cohort_rollout_snapshot(
  p_campaign_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'staged', count(*) filter (where invitation.rollout_state = 'staged'),
    'ready', count(*) filter (where invitation.rollout_state = 'ready'),
    'releasing', count(*) filter (where invitation.rollout_state = 'releasing'),
    'delivery_failed', count(*) filter (where invitation.rollout_state = 'failed'),
    'suppressed', count(*) filter (where invitation.rollout_state = 'suppressed'),
    'verified_valid', count(*) filter (where invitation.email_verification_status = 'valid'),
    'verified_risky', count(*) filter (where invitation.email_verification_status = 'risky'),
    'verified_invalid', count(*) filter (where invitation.email_verification_status = 'invalid'),
    'verified_unknown', count(*) filter (
      where invitation.email_verification_status in ('unknown', 'unverified')
    )
  )
  from public.seller_growth_invites as invitation
  where invitation.campaign_id = p_campaign_id
    and invitation.invite_kind = 'cohort';
$$;

revoke all on function public.seller_growth_cohort_rollout_snapshot(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.seller_growth_cohort_rollout_snapshot(uuid)
  to service_role;
