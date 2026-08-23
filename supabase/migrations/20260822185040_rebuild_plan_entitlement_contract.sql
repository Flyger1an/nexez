-- Canonical plan entitlements and database enforcement.
--
-- This migration deliberately separates product access from transaction
-- economics. Platform administrators receive Enterprise feature access and
-- limits, but their commercial plan and commission continue to resolve from
-- billing plus live promotions. Commerce/channel readiness is not a plan
-- feature and therefore does not appear in this catalog.

create schema if not exists private;

create table if not exists private.plan_catalog (
  plan_id text primary key,
  plan_rank integer not null unique,
  listing_limit integer,
  custom_domain_limit integer,
  team_seat_limit integer,
  storefront_limit integer,
  commission_bps integer not null,
  constraint plan_catalog_plan_id_check
    check (plan_id in ('free', 'launch', 'pro', 'scale', 'enterprise')),
  constraint plan_catalog_rank_check check (plan_rank between 0 and 4),
  constraint plan_catalog_listing_limit_check check (listing_limit is null or listing_limit > 0),
  constraint plan_catalog_custom_domain_limit_check check (custom_domain_limit is null or custom_domain_limit >= 0),
  constraint plan_catalog_team_seat_limit_check check (team_seat_limit is null or team_seat_limit >= 0),
  constraint plan_catalog_storefront_limit_check check (storefront_limit is null or storefront_limit > 0),
  constraint plan_catalog_commission_bps_check check (commission_bps between 0 and 1000)
);

create table if not exists private.plan_feature_catalog (
  feature_key text primary key,
  min_plan_rank integer not null,
  constraint plan_feature_catalog_rank_check check (min_plan_rank between 0 and 4)
);

revoke all on table private.plan_catalog
  from public, anon, authenticated, service_role;
revoke all on table private.plan_feature_catalog
  from public, anon, authenticated, service_role;

insert into private.plan_catalog (
  plan_id,
  plan_rank,
  listing_limit,
  custom_domain_limit,
  team_seat_limit,
  storefront_limit,
  commission_bps
)
values
  ('free',       0,   1,  0,  0,  1, 900),
  ('launch',     1,   3,  1,  0,  1, 700),
  ('pro',        2,  25,  5,  3,  3, 500),
  ('scale',      3, 100, 25, 10, 10, 300),
  ('enterprise', 4, null, null, null, null, 200)
on conflict (plan_id) do update
set
  plan_rank = excluded.plan_rank,
  listing_limit = excluded.listing_limit,
  custom_domain_limit = excluded.custom_domain_limit,
  team_seat_limit = excluded.team_seat_limit,
  storefront_limit = excluded.storefront_limit,
  commission_bps = excluded.commission_bps;

delete from private.plan_catalog
where plan_id not in ('free', 'launch', 'pro', 'scale', 'enterprise');

insert into private.plan_feature_catalog (feature_key, min_plan_rank)
values
  ('customDomain', 1),
  ('aiFeatures', 1),
  ('removeBadge', 1),
  ('whiteLabel', 1),
  ('integrations', 2),
  ('outboundWebhooks', 2),
  ('apiAccess', 2),
  ('negotiation', 2),
  ('analyticsHistory', 2),
  ('teamCollaboration', 2),
  ('prioritySupport', 3),
  ('sso', 4)
on conflict (feature_key) do update
set min_plan_rank = excluded.min_plan_rank;

delete from private.plan_feature_catalog
where feature_key not in (
  'customDomain',
  'aiFeatures',
  'removeBadge',
  'whiteLabel',
  'integrations',
  'outboundWebhooks',
  'apiAccess',
  'negotiation',
  'analyticsHistory',
  'teamCollaboration',
  'prioritySupport',
  'sso'
);

comment on table private.plan_catalog is
  'Canonical Nexez commercial plan, quota, and default commission matrix. Null limits mean unlimited.';
comment on table private.plan_feature_catalog is
  'Canonical cumulative product-feature allocation by minimum feature-plan rank. Commerce readiness is intentionally excluded.';

-- Storefront quota downgrades preserve every brand row and listing assignment.
-- Only the allocation/serving state changes, and the oldest storefronts remain
-- active deterministically. Owners can still select, edit, and delete suspended
-- rows, but the system-maintained marker is not directly writable by browser
-- sessions.
alter table public.storefronts
  add column if not exists plan_suspended_at timestamptz;

comment on column public.storefronts.plan_suspended_at is
  'Null when allocated by the owner plan; non-null when retained but excluded from public serving by the storefront quota.';

revoke insert, update on table public.storefronts from authenticated;
grant select, delete on table public.storefronts to authenticated;
grant insert (
  owner_id,
  handle,
  display_name,
  description,
  logo_url,
  accent_color,
  updated_at
) on table public.storefronts to authenticated;
grant update (
  handle,
  display_name,
  description,
  logo_url,
  accent_color,
  updated_at
) on table public.storefronts to authenticated;

create or replace function private.nz_plan_rank(p_plan text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select catalog.plan_rank
    from private.plan_catalog as catalog
    where catalog.plan_id = p_plan
  ), 0);
$$;

create or replace function private.nz_plan_default_commission_bps(p_plan text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select catalog.commission_bps
    from private.plan_catalog as catalog
    where catalog.plan_id = p_plan
  ), (
    select catalog.commission_bps
    from private.plan_catalog as catalog
    where catalog.plan_id = 'free'
  ));
$$;

create or replace function private.nz_plan_feature_min_rank(p_feature text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select feature.min_plan_rank
  from private.plan_feature_catalog as feature
  where feature.feature_key = p_feature;
$$;

revoke all on function private.nz_plan_rank(text)
  from public, anon, authenticated, service_role;
revoke all on function private.nz_plan_default_commission_bps(text)
  from public, anon, authenticated, service_role;
revoke all on function private.nz_plan_feature_min_rank(text)
  from public, anon, authenticated, service_role;

-- Existing production data is inside the application policy range. Tighten the
-- database boundary so an operational write cannot persist a silently ignored
-- Enterprise override.
alter table public.owner_commercial_terms
  drop constraint if exists owner_commercial_terms_commission_bps_check;
alter table public.owner_commercial_terms
  add constraint owner_commercial_terms_commission_bps_check
  check (commission_bps is null or commission_bps between 100 and 200);

comment on column public.owner_commercial_terms.commission_bps is
  'Negotiated Enterprise platform commission in basis points. Null disables the override; valid overrides are 100-200 bps.';

-- Commercial fee windows are part of the same economic contract as plan
-- defaults. Keep legacy malformed rows deploy-safe via NOT VALID, but never let
-- an infinite boundary confer in SQL when the application rejects it.
alter table public.owner_commercial_terms
  drop constraint if exists owner_commercial_terms_effective_window_finite_check;
alter table public.owner_commercial_terms
  add constraint owner_commercial_terms_effective_window_finite_check
  check (
    pg_catalog.isfinite(effective_from)
    and (
      effective_until is null
      or (
        pg_catalog.isfinite(effective_until)
        and effective_until > effective_from
      )
    )
  ) not valid;

-- Stripe subscription lifecycle plus Nexez-local placeholder states. Unknown
-- values must fail at ingestion instead of silently changing entitlement logic.
alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_status_check;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_status_check
  check (status in (
    'unconfigured',
    'incomplete',
    'incomplete_expired',
    'trialing',
    'active',
    'past_due',
    'canceled',
    'unpaid',
    'paused',
    'expired'
  ));

-- Time-bounded entitlements must be finite and fail closed. These checks are
-- introduced NOT VALID so an unexpected legacy row cannot block deployment;
-- PostgreSQL still enforces them for every new or changed row. Clean or already
-- conforming databases validate the constraints during this migration; malformed
-- legacy rows remain non-conferring and require an explicit operator repair.
alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_trial_finite_check;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_trial_finite_check
  check (
    status <> 'trialing'
    or (
      trial_ends_at is not null
      and pg_catalog.isfinite(trial_ends_at)
    )
  ) not valid;

alter table public.promotional_plan_grants
  add column if not exists entitlement_activated_at timestamptz;

comment on column public.promotional_plan_grants.entitlement_activated_at is
  'Database lifecycle marker set after a live grant has driven materialized entitlement reconciliation.';

alter table public.promotional_plan_grants
  drop constraint if exists promotional_plan_grants_active_window_finite_check;
alter table public.promotional_plan_grants
  add constraint promotional_plan_grants_active_window_finite_check
  check (
    status <> 'active'
    or (
      pg_catalog.isfinite(starts_at)
      and pg_catalog.isfinite(ends_at)
      and ends_at > starts_at
    )
  ) not valid;

alter table public.promotional_plan_grants
  drop constraint if exists promotional_plan_grants_activation_timestamp_finite_check;
alter table public.promotional_plan_grants
  add constraint promotional_plan_grants_activation_timestamp_finite_check
  check (
    entitlement_activated_at is null
    or pg_catalog.isfinite(entitlement_activated_at)
  );

-- Existing live grants are reconciled by the migration-wide owner pass below.
-- Mark them now so the recurring worker only claims grants whose start boundary
-- is crossed after this migration commits.
update public.promotional_plan_grants as grant_row
set entitlement_activated_at = statement_timestamp()
where grant_row.status = 'active'
  and pg_catalog.isfinite(grant_row.starts_at)
  and pg_catalog.isfinite(grant_row.ends_at)
  and grant_row.starts_at <= statement_timestamp()
  and grant_row.ends_at > statement_timestamp()
  and grant_row.entitlement_activated_at is null;

alter table public.seller_growth_campaigns
  drop constraint if exists seller_growth_campaigns_active_window_finite_check;
alter table public.seller_growth_campaigns
  add constraint seller_growth_campaigns_active_window_finite_check
  check (
    status <> 'active'
    or (
      pg_catalog.isfinite(starts_at)
      and (
        signup_closes_at is null
        or (
          pg_catalog.isfinite(signup_closes_at)
          and signup_closes_at > starts_at
        )
      )
    )
  ) not valid;

do $validate_finite_entitlement_windows$
begin
  if not exists (
    select 1
    from public.owner_commercial_terms as terms
    where not pg_catalog.isfinite(terms.effective_from)
      or (
        terms.effective_until is not null
        and (
          not pg_catalog.isfinite(terms.effective_until)
          or terms.effective_until <= terms.effective_from
        )
      )
  ) then
    alter table public.owner_commercial_terms
      validate constraint owner_commercial_terms_effective_window_finite_check;
  end if;

  if not exists (
    select 1
    from public.billing_subscriptions as subscription
    where subscription.status = 'trialing'
      and (
        subscription.trial_ends_at is null
        or not pg_catalog.isfinite(subscription.trial_ends_at)
      )
  ) then
    alter table public.billing_subscriptions
      validate constraint billing_subscriptions_trial_finite_check;
  end if;

  if not exists (
    select 1
    from public.promotional_plan_grants as grant_row
    where grant_row.status = 'active'
      and (
        not pg_catalog.isfinite(grant_row.starts_at)
        or not pg_catalog.isfinite(grant_row.ends_at)
        or grant_row.ends_at <= grant_row.starts_at
      )
  ) then
    alter table public.promotional_plan_grants
      validate constraint promotional_plan_grants_active_window_finite_check;
  end if;

  if not exists (
    select 1
    from public.seller_growth_campaigns as campaign
    where campaign.status = 'active'
      and (
        not pg_catalog.isfinite(campaign.starts_at)
        or (
          campaign.signup_closes_at is not null
          and (
            not pg_catalog.isfinite(campaign.signup_closes_at)
            or campaign.signup_closes_at <= campaign.starts_at
          )
        )
      )
  ) then
    alter table public.seller_growth_campaigns
      validate constraint seller_growth_campaigns_active_window_finite_check;
  end if;
end
$validate_finite_entitlement_windows$;

-- The retired no-Free model overloaded Stripe `paused` and natural trial
-- expiry as a public-serving suspension. Under the canonical contract those
-- states fall back to Free: the primary plan allocation remains serveable.
-- There is currently no independent moderation-suspension relation, so this
-- hook is deliberately false. A future moderation control may redefine this
-- function without coupling enforcement back to billing lifecycle states.
create or replace function private.nz_owner_is_paused(p_owner uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select false;
$$;

revoke all on function private.nz_owner_is_paused(uuid)
  from public, anon, authenticated, service_role;

comment on function private.nz_owner_is_paused(uuid) is
  'Explicit non-billing moderation suspension hook. Stripe pause/expiry is a Free fallback and never pauses public serving.';

-- Keep the legacy billing trigger name for compatibility, but derive serving
-- only from an explicit moderation hook plus storefront allocation. The growth
-- entitlement trigger runs first by trigger name and materializes quota state;
-- this final projection refresh cannot resurrect a suspended storefront.
create or replace function private.nz_resync_serving_for_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if tg_op = 'UPDATE'
     and new.owner_id is not distinct from old.owner_id
     and new.plan_id is not distinct from old.plan_id
     and new.status is not distinct from old.status
     and new.trial_ends_at is not distinct from old.trial_ends_at
     and new.account_origin is not distinct from old.account_origin then
    return new;
  end if;

  for v_owner in
    select distinct candidate.owner_id
    from unnest(array[
      case when tg_op = 'UPDATE' then old.owner_id else null end,
      new.owner_id
    ]) as candidate(owner_id)
    where candidate.owner_id is not null
    order by candidate.owner_id
  loop
    update public.pages_public as projection
    set serving = not private.nz_owner_is_paused(v_owner)
      and not exists (
        select 1
        from public.pages as page
        join public.storefronts as storefront
          on storefront.id = page.storefront_id
        where page.id = projection.id
          and page.owner_id = v_owner
          and storefront.plan_suspended_at is not null
      )
    from public.pages as page
    where page.id = projection.id
      and page.owner_id = v_owner;
  end loop;

  return new;
end;
$$;

revoke all on function private.nz_resync_serving_for_owner()
  from public, anon, authenticated, service_role;

update public.pages_public as projection
set serving = not private.nz_owner_is_paused(page.owner_id)
  and not exists (
    select 1
    from public.storefronts as storefront
    where storefront.id = page.storefront_id
      and storefront.plan_suspended_at is not null
  )
from public.pages as page
where page.id = projection.id;

-- A private suspension ledger preserves every invitation across a downgrade.
-- Page RLS consults this ledger, so excess or lower-tier seats lose access
-- without destructive status rewrites.
create table if not exists private.team_invite_entitlement_suspensions (
  invite_id uuid primary key references public.team_invites(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'plan_limit'
    check (reason in ('plan_limit', 'feature_unavailable')),
  suspended_at timestamptz not null default now()
);

create index if not exists team_invite_entitlement_suspensions_owner_idx
  on private.team_invite_entitlement_suspensions (owner_id, invite_id);

alter table private.team_invite_entitlement_suspensions enable row level security;
revoke all on table private.team_invite_entitlement_suspensions
  from public, anon, authenticated, service_role;

create or replace function private.nz_owner_plan_entitlements(
  p_owner uuid,
  p_at timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_at timestamptz := coalesce(p_at, statement_timestamp());
  v_subscription_plan_id text;
  v_subscription_rank integer := 0;
  v_subscription_status text;
  v_subscription_trial_ends_at timestamptz;
  v_subscription_confers boolean := false;
  v_chosen_plan_id text;
  v_grant_id uuid;
  v_grant_plan_id text;
  v_grant_rank integer := 0;
  v_grant_source text;
  v_grant_starts_at timestamptz;
  v_grant_ends_at timestamptz;
  v_commercial_plan_id text := 'free';
  v_commercial_rank integer := 0;
  v_commercial_source text := 'free';
  v_feature_plan_id text := 'free';
  v_feature_rank integer := 0;
  v_feature_source text := 'free';
  v_is_admin boolean := false;
  v_commission_bps integer;
  v_commission_source text := 'plan_default';
  v_override_bps integer;
  v_features jsonb := '{}'::jsonb;
  v_limits jsonb := '{}'::jsonb;
  v_promotion jsonb := null;
begin
  if p_owner is not null then
    select
      case when catalog.plan_id is not null then subscription.plan_id else null end,
      subscription.status,
      subscription.trial_ends_at
    into
      v_chosen_plan_id,
      v_subscription_status,
      v_subscription_trial_ends_at
    from public.billing_subscriptions as subscription
    left join private.plan_catalog as catalog
      on catalog.plan_id = subscription.plan_id
    where subscription.owner_id = p_owner;

    v_subscription_confers := coalesce(
      v_subscription_status in ('active', 'past_due', 'unpaid')
      or (
        v_subscription_status = 'trialing'
        and v_subscription_trial_ends_at is not null
        and pg_catalog.isfinite(v_subscription_trial_ends_at)
        and v_subscription_trial_ends_at > v_at
      ),
      false
    );

    if v_subscription_confers and v_chosen_plan_id is not null then
      v_subscription_plan_id := v_chosen_plan_id;
      v_subscription_rank := private.nz_plan_rank(v_chosen_plan_id);
    else
      v_subscription_plan_id := 'free';
      v_subscription_rank := 0;
    end if;

    select
      grant_row.id,
      grant_row.plan_id,
      catalog.plan_rank,
      grant_row.source,
      grant_row.starts_at,
      grant_row.ends_at
    into
      v_grant_id,
      v_grant_plan_id,
      v_grant_rank,
      v_grant_source,
      v_grant_starts_at,
      v_grant_ends_at
    from public.promotional_plan_grants as grant_row
    join private.plan_catalog as catalog
      on catalog.plan_id = grant_row.plan_id
    where grant_row.owner_id = p_owner
      and grant_row.status = 'active'
      and pg_catalog.isfinite(grant_row.starts_at)
      and pg_catalog.isfinite(grant_row.ends_at)
      and grant_row.ends_at > grant_row.starts_at
      and grant_row.starts_at <= v_at
      and grant_row.ends_at > v_at
    order by catalog.plan_rank desc, grant_row.ends_at desc, grant_row.id
    limit 1;

    v_grant_rank := coalesce(v_grant_rank, 0);

    if v_grant_rank > v_subscription_rank then
      v_commercial_plan_id := v_grant_plan_id;
      v_commercial_rank := v_grant_rank;
      v_commercial_source := 'promotion';
      v_commission_source := 'promotion';
    elsif v_subscription_rank > 0 then
      v_commercial_plan_id := v_subscription_plan_id;
      v_commercial_rank := v_subscription_rank;
      v_commercial_source := 'subscription';
    end if;

    select exists (
      select 1
      from public.platform_admins as administrator
      where administrator.user_id = p_owner
    ) into v_is_admin;
  else
    v_subscription_plan_id := 'free';
  end if;

  if v_is_admin then
    v_feature_plan_id := 'enterprise';
    v_feature_rank := 4;
    v_feature_source := 'admin';
  else
    v_feature_plan_id := v_commercial_plan_id;
    v_feature_rank := v_commercial_rank;
    v_feature_source := v_commercial_source;
  end if;

  select jsonb_build_object(
    'listings', catalog.listing_limit,
    'customDomains', catalog.custom_domain_limit,
    'teamSeats', catalog.team_seat_limit,
    'storefronts', catalog.storefront_limit
  )
  into v_limits
  from private.plan_catalog as catalog
  where catalog.plan_id = v_feature_plan_id;

  select jsonb_object_agg(
    feature.feature_key,
    v_feature_rank >= feature.min_plan_rank
    order by feature.feature_key
  )
  into v_features
  from private.plan_feature_catalog as feature;

  v_commission_bps := private.nz_plan_default_commission_bps(v_commercial_plan_id);

  if v_commercial_plan_id = 'enterprise' and p_owner is not null then
    select terms.commission_bps
    into v_override_bps
    from public.owner_commercial_terms as terms
    where terms.owner_id = p_owner
      and terms.commission_bps between 100 and 200
      and pg_catalog.isfinite(terms.effective_from)
      and terms.effective_from <= v_at
      and (
        terms.effective_until is null
        or (
          pg_catalog.isfinite(terms.effective_until)
          and terms.effective_until > v_at
        )
      );

    if v_override_bps is not null then
      v_commission_bps := v_override_bps;
      v_commission_source := 'enterprise_override';
    end if;
  end if;

  if v_grant_id is not null then
    v_promotion := jsonb_build_object(
      'id', v_grant_id,
      'planId', v_grant_plan_id,
      'source', v_grant_source,
      'startsAt', v_grant_starts_at,
      'endsAt', v_grant_ends_at
    );
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'evaluatedAt', v_at,
    'ownerId', p_owner,
    'featurePlanId', v_feature_plan_id,
    'featurePlanRank', v_feature_rank,
    'featurePlanSource', v_feature_source,
    'commercialPlanId', v_commercial_plan_id,
    'commercialPlanRank', v_commercial_rank,
    'commercialPlanSource', v_commercial_source,
    'billing', jsonb_build_object(
      'chosenPlanId', v_chosen_plan_id,
      'status', v_subscription_status,
      'confers', v_subscription_confers,
      'trialEndsAt', v_subscription_trial_ends_at
    ),
    'promotion', v_promotion,
    'limits', coalesce(v_limits, '{}'::jsonb),
    'features', coalesce(v_features, '{}'::jsonb),
    'commissionBps', v_commission_bps,
    'commissionSource', v_commission_source
  );
end;
$$;

revoke all on function private.nz_owner_plan_entitlements(uuid, timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.get_my_plan_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then
    raise exception 'authentication required'
      using errcode = 'insufficient_privilege';
  end if;

  return private.nz_owner_plan_entitlements(v_owner, statement_timestamp());
end;
$$;

revoke all on function public.get_my_plan_entitlements()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_plan_entitlements()
  to authenticated;

comment on function public.get_my_plan_entitlements() is
  'Authenticated owner-only, atomic plan snapshot. Null quota values mean unlimited; admin feature access never changes commercial commission.';

-- Backward-compatible database gates are thin wrappers over the same atomic
-- contract. They remain internal rather than arbitrary-owner public RPCs.
create or replace function public.owner_plan_rank(p_owner uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (private.nz_owner_plan_entitlements(p_owner, statement_timestamp()) ->> 'featurePlanRank')::integer,
    0
  );
$$;

create or replace function public.plan_published_page_limit(p_owner uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.nz_owner_plan_entitlements(p_owner, statement_timestamp()) #> '{limits,listings}' = 'null'::jsonb
      then 2147483647
    else coalesce(
      (private.nz_owner_plan_entitlements(p_owner, statement_timestamp()) #>> '{limits,listings}')::integer,
      1
    )
  end;
$$;

create or replace function public.owner_team_seat_limit(p_owner uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.nz_owner_plan_entitlements(p_owner, statement_timestamp()) #> '{limits,teamSeats}' = 'null'::jsonb
      then 2147483647
    else coalesce(
      (private.nz_owner_plan_entitlements(p_owner, statement_timestamp()) #>> '{limits,teamSeats}')::integer,
      0
    )
  end;
$$;

create or replace function public.owner_custom_domain_limit(p_owner uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.nz_owner_plan_entitlements(p_owner, statement_timestamp()) #> '{limits,customDomains}' = 'null'::jsonb
      then 2147483647
    else coalesce(
      (private.nz_owner_plan_entitlements(p_owner, statement_timestamp()) #>> '{limits,customDomains}')::integer,
      0
    )
  end;
$$;

create or replace function public.owner_storefront_limit(p_owner uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.nz_owner_plan_entitlements(p_owner, statement_timestamp()) #> '{limits,storefronts}' = 'null'::jsonb
      then 2147483647
    else coalesce(
      (private.nz_owner_plan_entitlements(p_owner, statement_timestamp()) #>> '{limits,storefronts}')::integer,
      1
    )
  end;
$$;

revoke all on function public.owner_plan_rank(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.plan_published_page_limit(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.owner_team_seat_limit(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.owner_custom_domain_limit(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.owner_storefront_limit(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.nz_owner_feature_allowed(
  p_owner uuid,
  p_feature text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      private.nz_owner_plan_entitlements(p_owner, statement_timestamp())
      -> 'features'
      ->> p_feature
    )::boolean,
    false
  );
$$;

create or replace function private.nz_my_feature_allowed(p_feature text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then
    return false;
  end if;
  return private.nz_owner_feature_allowed(v_owner, p_feature);
end;
$$;

revoke all on function private.nz_owner_feature_allowed(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function private.nz_my_feature_allowed(text)
  from public, anon, authenticated, service_role;
grant execute on function private.nz_my_feature_allowed(text)
  to authenticated;

-- Server-side discovery and governance paths read the sanitized public
-- projection. Keep it read-only while pinning disaster-recovery parity.
grant select on public.pages_public to service_role;

-- Route-level feature checks are not authoritative while these owner tables
-- retain broad PostgREST mutation grants. Keep paid configuration visible after
-- downgrade, but permit only no-op retention or destructive cleanup until the
-- owner is entitled again.
create or replace function private.nz_enforce_api_key_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.nz_owner_feature_allowed(new.owner_id, 'apiAccess') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Programmatic API keys are a Pro plan feature.'
      using errcode = 'check_violation',
            hint = 'Upgrade to Pro to create an API key.';
  end if;

  if new.owner_id is distinct from old.owner_id
     or new.name is distinct from old.name
     or new.key_hash is distinct from old.key_hash
     or new.prefix is distinct from old.prefix then
    raise exception 'Programmatic API key configuration is read-only below Pro.'
      using errcode = 'check_violation',
            hint = 'Upgrade to Pro, retain the key unchanged, revoke it, or delete it.';
  end if;

  if old.revoked_at is not null and new.revoked_at is null then
    raise exception 'A retained API key cannot be reactivated below Pro.'
      using errcode = 'check_violation',
            hint = 'Upgrade to Pro to create a replacement key.';
  end if;

  return new;
end;
$$;

revoke all on function private.nz_enforce_api_key_plan()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_enforce_api_key_plan on public.api_keys;
create trigger trg_enforce_api_key_plan
  before insert or update of owner_id, name, key_hash, prefix, revoked_at
  on public.api_keys
  for each row execute function private.nz_enforce_api_key_plan();

create or replace function private.nz_enforce_account_outbound_webhook_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.nz_owner_feature_allowed(new.owner_id, 'outboundWebhooks') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Outbound webhooks are a Pro plan feature.'
      using errcode = 'check_violation',
            hint = 'Upgrade to Pro to register an outbound webhook.';
  end if;

  if new.owner_id is distinct from old.owner_id
     or new.url is distinct from old.url
     or new.secret is distinct from old.secret then
    raise exception 'Outbound webhook configuration is read-only below Pro.'
      using errcode = 'check_violation',
            hint = 'Upgrade to Pro, retain the endpoint unchanged, disable it, or delete it.';
  end if;

  if old.active is false and new.active is true then
    raise exception 'A retained outbound webhook cannot be re-enabled below Pro.'
      using errcode = 'check_violation',
            hint = 'Upgrade to Pro to enable outbound delivery.';
  end if;

  return new;
end;
$$;

revoke all on function private.nz_enforce_account_outbound_webhook_plan()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_enforce_account_outbound_webhook_plan
  on public.outbound_webhooks;
create trigger trg_enforce_account_outbound_webhook_plan
  before insert or update of owner_id, url, secret, active
  on public.outbound_webhooks
  for each row execute function private.nz_enforce_account_outbound_webhook_plan();

create or replace function private.nz_enforce_page_secret_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_outbound_webhooks jsonb := '[]'::jsonb;
  v_old_calendly_webhook_secret text;
  v_old_calendly_pat_encrypted text;
  v_old_shopify_credentials_encrypted text;
  v_old_square_credentials_encrypted text;
  v_old_acuity_credentials_encrypted text;
begin
  -- Empty values are explicit disconnect/cleanup operations. Canonicalizing
  -- here prevents a blank ciphertext or JSON null from becoming dormant config.
  new.outbound_webhooks := case
    when new.outbound_webhooks is null
      or new.outbound_webhooks = 'null'::jsonb
      then '[]'::jsonb
    else new.outbound_webhooks
  end;
  new.calendly_webhook_secret := nullif(btrim(new.calendly_webhook_secret), '');
  new.calendly_pat_encrypted := nullif(btrim(new.calendly_pat_encrypted), '');
  new.shopify_credentials_encrypted := nullif(btrim(new.shopify_credentials_encrypted), '');
  new.square_credentials_encrypted := nullif(btrim(new.square_credentials_encrypted), '');
  new.acuity_credentials_encrypted := nullif(btrim(new.acuity_credentials_encrypted), '');

  if tg_op = 'UPDATE'
     and new.page_id is not distinct from old.page_id
     and new.owner_id is not distinct from old.owner_id then
    v_old_outbound_webhooks := coalesce(old.outbound_webhooks, '[]'::jsonb);
    v_old_calendly_webhook_secret := nullif(btrim(old.calendly_webhook_secret), '');
    v_old_calendly_pat_encrypted := nullif(btrim(old.calendly_pat_encrypted), '');
    v_old_shopify_credentials_encrypted := nullif(btrim(old.shopify_credentials_encrypted), '');
    v_old_square_credentials_encrypted := nullif(btrim(old.square_credentials_encrypted), '');
    v_old_acuity_credentials_encrypted := nullif(btrim(old.acuity_credentials_encrypted), '');
  end if;

  if not private.nz_owner_feature_allowed(new.owner_id, 'integrations')
     and (
       (
         new.calendly_webhook_secret is not null
         and new.calendly_webhook_secret is distinct from v_old_calendly_webhook_secret
       )
       or (
         new.calendly_pat_encrypted is not null
         and new.calendly_pat_encrypted is distinct from v_old_calendly_pat_encrypted
       )
       or (
         new.shopify_credentials_encrypted is not null
         and new.shopify_credentials_encrypted is distinct from v_old_shopify_credentials_encrypted
       )
       or (
         new.square_credentials_encrypted is not null
         and new.square_credentials_encrypted is distinct from v_old_square_credentials_encrypted
       )
       or (
         new.acuity_credentials_encrypted is not null
         and new.acuity_credentials_encrypted is distinct from v_old_acuity_credentials_encrypted
       )
     ) then
    raise exception 'Manual integration credentials are a Pro plan feature.'
      using errcode = 'check_violation',
            hint = 'Upgrade to Pro, retain existing credentials unchanged, or disconnect them. The installed Shopify app remains available on every plan.';
  end if;

  -- This legacy JSON accepts both bare URL strings and {url, secret?} objects,
  -- with no stable endpoint id or active flag. Clear-all is therefore the only
  -- unambiguous monotonic cleanup below Pro; the downgraded UI exposes that
  -- exact disconnect action instead of attempting partial rewrites.
  if not private.nz_owner_feature_allowed(new.owner_id, 'outboundWebhooks')
     and new.outbound_webhooks is distinct from v_old_outbound_webhooks
     and new.outbound_webhooks <> '[]'::jsonb then
    raise exception 'Per-page outbound webhooks are a Pro plan feature.'
      using errcode = 'check_violation',
            hint = 'Upgrade to Pro, retain existing endpoints unchanged, or clear them.';
  end if;

  return new;
end;
$$;

revoke all on function private.nz_enforce_page_secret_plan()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_enforce_page_secret_plan on public.page_secrets;
create trigger trg_enforce_page_secret_plan
  before insert or update of
    page_id,
    owner_id,
    calendly_webhook_secret,
    outbound_webhooks,
    calendly_pat_encrypted,
    shopify_credentials_encrypted,
    square_credentials_encrypted,
    acuity_credentials_encrypted
  on public.page_secrets
  for each row execute function private.nz_enforce_page_secret_plan();

-- Saved private URL snapshots and competitor benchmarks are the durable Launch
-- research feature. Historical rows remain readable/removable after downgrade;
-- only creation is gated, while core simulation runs remain all-plan.
create or replace function private.nz_enforce_agent_lab_research_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.nz_owner_feature_allowed(new.owner_id, 'aiFeatures') then
    raise exception 'Saved Agent Lab research is a Launch plan feature.'
      using errcode = 'check_violation',
            hint = 'Upgrade to Launch to save private URL snapshots and competitor reports.';
  end if;

  return new;
end;
$$;

revoke all on function private.nz_enforce_agent_lab_research_plan()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_enforce_agent_lab_research_plan
  on public.agent_lab_research_runs;
create trigger trg_enforce_agent_lab_research_plan
  before insert on public.agent_lab_research_runs
  for each row execute function private.nz_enforce_agent_lab_research_plan();

create index if not exists team_invites_live_owner_idx
  on public.team_invites (owner_id, created_at, id)
  where status <> 'revoked';

create index if not exists pages_verified_domain_owner_idx
  on public.pages (owner_id, lower(btrim(custom_domain)), custom_domain_verified, created_at, id)
  where custom_domain is not null
    and btrim(custom_domain) <> ''
    and custom_domain_verified is not null;

create index if not exists storefronts_active_owner_allocation_idx
  on public.storefronts (owner_id, created_at, id)
  where plan_suspended_at is null;

drop index if exists public.promotional_plan_grants_activation_scan_idx;
create index promotional_plan_grants_activation_scan_idx
  on public.promotional_plan_grants (starts_at, id)
  include (owner_id, ends_at)
  where status = 'active'
    and entitlement_activated_at is null;

-- Row-level triggers run after PostgreSQL has locked an existing tuple. They
-- must therefore never block waiting for an advisory quota lock: doing so can
-- cycle with reconciliation, which correctly locks the quota before touching
-- tuples. Contended row writers abort with one stable, retryable contract.
create or replace function private.nz_try_entitlement_allocation_lock(
  p_lock_key text,
  p_resource text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_lock_key is null
     or not pg_try_advisory_xact_lock(hashtextextended(p_lock_key, 0)) then
    raise exception 'NEXEZ_ENTITLEMENT_ALLOCATION_RETRY'
      using errcode = '40001',
            detail = coalesce(p_resource, 'unknown entitlement resource'),
            hint = 'Retry the complete allocation mutation.';
  end if;
end;
$$;

revoke all on function private.nz_try_entitlement_allocation_lock(text, text)
  from public, anon, authenticated, service_role;

create or replace function private.nz_try_owner_quota_locks(
  p_resource text,
  p_owner_a uuid,
  p_owner_b uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  for v_owner in
    select distinct candidate.owner_id
    from unnest(array[p_owner_a, p_owner_b]) as candidate(owner_id)
    where candidate.owner_id is not null
    order by candidate.owner_id
  loop
    perform private.nz_try_entitlement_allocation_lock(
      'nexez:quota:' || p_resource || ':' || v_owner::text,
      p_resource || ':' || v_owner::text
    );
  end loop;
end;
$$;

revoke all on function private.nz_try_owner_quota_locks(text, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.nz_try_growth_campaign_locks(
  p_campaign_a uuid,
  p_campaign_b uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign uuid;
begin
  for v_campaign in
    select distinct candidate.campaign_id
    from unnest(array[p_campaign_a, p_campaign_b]) as candidate(campaign_id)
    where candidate.campaign_id is not null
    order by candidate.campaign_id
  loop
    perform private.nz_try_entitlement_allocation_lock(
      'nexez:growth:campaign:' || v_campaign::text,
      'campaign:' || v_campaign::text
    );
  end loop;
end;
$$;

revoke all on function private.nz_try_growth_campaign_locks(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Growth qualification runs AFTER every published-page insert and every
-- UPDATE OF publish/website/domain proof columns. Even a no-op publish write or
-- proof removal reaches the issuer, whose ordered advisory locks are blocking.
-- Take the complete owner quota prefix in the earliest same-timing BEFORE
-- trigger so a writer that already holds a page tuple aborts retryably instead
-- of waiting and forming a tuple/advisory deadlock with reconciliation.
create or replace function private.nz_lock_growth_page_qualification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is null or new.is_published is not true then
    return new;
  end if;

  perform private.nz_try_owner_quota_locks(
    'listings',
    new.owner_id,
    case when tg_op = 'UPDATE' then old.owner_id else null end
  );
  perform private.nz_try_owner_quota_locks(
    'domains',
    new.owner_id,
    case when tg_op = 'UPDATE' then old.owner_id else null end
  );

  return new;
end;
$$;

revoke all on function private.nz_lock_growth_page_qualification()
  from public, anon, authenticated, service_role;

drop trigger if exists a00_nz_lock_growth_page_qualification on public.pages;
create trigger a00_nz_lock_growth_page_qualification
  before insert or update of
    owner_id,
    is_published,
    website_verified_at,
    custom_domain_verified
  on public.pages
  for each row execute function private.nz_lock_growth_page_qualification();

-- Seller-growth issuance can be reached from page/domain writes, billing
-- lifecycle writes, Shopify qualification, and invitation claims. Every entry
-- acquires the owner quota prefix before the shared campaign row, so a later
-- grant-triggered reconciliation can only move forward through the global
-- order: listings -> domains -> campaign -> reconciliation -> storefronts ->
-- team.
create or replace function private.nz_maybe_issue_seller_growth_grant(p_owner uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_campaign_id uuid;
  v_campaign public.seller_growth_campaigns%rowtype;
  v_invite public.seller_growth_invites%rowtype;
  v_user_created_at timestamptz;
  v_email_confirmed_at timestamptz;
  v_identity_keys text[];
  v_grant_id uuid;
  v_grant_count integer;
  v_is_new_account boolean;
  v_grant_source text;
  v_now timestamptz := statement_timestamp();
begin
  if p_owner is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('nexez:quota:listings:' || p_owner::text, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('nexez:quota:domains:' || p_owner::text, 0)
  );

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

  -- Discover without a row lock, acquire the ordered advisory campaign lock,
  -- then revalidate under the row lock. If operations changed the winning
  -- campaign in between, fail closed and let the next qualifying write retry.
  select c.id
  into v_campaign_id
  from public.seller_growth_campaigns c
  where c.status = 'active'
    and pg_catalog.isfinite(c.starts_at)
    and c.starts_at <= v_now
    and (
      c.signup_closes_at is null
      or (
        pg_catalog.isfinite(c.signup_closes_at)
        and c.signup_closes_at >= v_now
      )
    )
  order by c.starts_at desc, c.id
  limit 1;

  if v_campaign_id is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('nexez:growth:campaign:' || v_campaign_id::text, 0)
  );

  select c.*
  into v_campaign
  from public.seller_growth_campaigns c
  where c.id = v_campaign_id
    and c.status = 'active'
    and pg_catalog.isfinite(c.starts_at)
    and c.starts_at <= v_now
    and (
      c.signup_closes_at is null
      or (
        pg_catalog.isfinite(c.signup_closes_at)
        and c.signup_closes_at >= v_now
      )
    )
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
  -- Malformed legacy trials never confer and are repaired by the worker below.
  if exists (
    select 1
    from public.billing_subscriptions s
    where s.owner_id = p_owner
      and private.nz_plan_rank(s.plan_id) >= 1
      and (
        s.status in ('active', 'past_due', 'unpaid')
        or (
          s.status = 'trialing'
          and s.trial_ends_at is not null
          and pg_catalog.isfinite(s.trial_ends_at)
          and s.trial_ends_at > v_now
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
        qualified_at = coalesce(qualified_at, v_now),
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
    v_now,
    v_now + make_interval(days => v_campaign.grant_duration_days),
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
      qualified_at = v_now,
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
  from public, anon, authenticated, service_role;

-- Grant issuance uses statement time so long-running transactions do not keep
-- evaluating eligibility against a stale transaction timestamp. Keep the
-- invitation guard on the same clock: otherwise a grant issued by an earlier
-- statement in the transaction can be active yet appear not to have started.
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
  v_now timestamptz := statement_timestamp();
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
      select campaign.*
      into v_campaign
      from public.seller_growth_campaigns as campaign
      where campaign.id = new.campaign_id
      for update;

      if v_campaign.id is null
         or v_campaign.status <> 'active'
         or v_campaign.starts_at > v_now
         or (
           v_campaign.signup_closes_at is not null
           and v_campaign.signup_closes_at < v_now
         )
         or old.expires_at <= v_now then
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
        from auth.users as invited_user
        where invited_user.id = new.accepted_by_owner_id
          and invited_user.email_confirmed_at is not null
          and lower(invited_user.email) = new.invitee_email
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

  select campaign.*
  into v_campaign
  from public.seller_growth_campaigns as campaign
  where campaign.id = new.campaign_id
  for update;

  if v_campaign.id is null
     or v_campaign.status <> 'active'
     or v_campaign.starts_at > v_now
     or (
       v_campaign.signup_closes_at is not null
       and v_campaign.signup_closes_at < v_now
     ) then
    raise exception 'This invitation campaign is not accepting new invitations.'
      using errcode = 'check_violation';
  end if;

  if new.invite_kind = 'cohort' then
    return new;
  end if;

  if not exists (
    select 1
    from public.promotional_plan_grants as grant_row
    where grant_row.owner_id = new.inviter_owner_id
      and grant_row.campaign_id = new.campaign_id
      and grant_row.status = 'active'
      and grant_row.starts_at <= v_now
      and grant_row.ends_at > v_now
  ) then
    raise exception 'Activate your complimentary Launch access before inviting another business.'
      using errcode = 'check_violation';
  end if;

  select lower(inviter.email)
  into v_inviter_email
  from auth.users as inviter
  where inviter.id = new.inviter_owner_id;

  if v_inviter_email is not null and v_inviter_email = new.invitee_email then
    raise exception 'You cannot invite your own email address.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    select count(*)
    into v_count
    from public.seller_growth_invites as invitation
    where invitation.inviter_owner_id = new.inviter_owner_id
      and invitation.campaign_id = new.campaign_id
      and invitation.invite_kind = 'referral';

    if v_count >= v_campaign.invite_slots * 5 then
      raise exception 'This account has reached the campaign invitation limit.'
        using errcode = 'check_violation';
    end if;
  end if;

  select count(*)
  into v_count
  from public.seller_growth_invites as invitation
  where invitation.inviter_owner_id = new.inviter_owner_id
    and invitation.campaign_id = new.campaign_id
    and invitation.invite_kind = 'referral'
    and (
      invitation.status in ('claimed', 'qualified')
      or (invitation.status = 'pending' and invitation.expires_at > v_now)
    );

  if v_count >= v_campaign.invite_slots then
    raise exception 'Both Launch passes are already in use.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function private.nz_enforce_seller_growth_invite()
  from public, anon, authenticated, service_role;

-- Growth Control reads the same statement-time boundary as issuance and the
-- invitation guard. It also applies the canonical finite-trial rule so a
-- malformed legacy trial cannot appear as a paid conversion.
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
        where grant_row.status = 'active'
          and grant_row.starts_at <= statement_timestamp()
          and grant_row.ends_at > statement_timestamp()
      ) as active,
      count(*) filter (where grant_row.status = 'expired') as expired,
      count(*) filter (where grant_row.status = 'revoked') as revoked,
      count(*) filter (where grant_row.status = 'superseded') as superseded,
      count(*) filter (where grant_row.source = 'welcome') as welcome,
      count(*) filter (where grant_row.source = 'referral') as referral,
      count(*) filter (where grant_row.fallback_page_id is not null) as fallback_selected,
      count(*) filter (
        where grant_row.created_at >= statement_timestamp() - interval '30 days'
      ) as issued_30d
    from public.promotional_plan_grants as grant_row
    where grant_row.campaign_id = p_campaign_id
  ),
  invite_metrics as (
    select
      count(*) as total,
      count(*) filter (
        where invitation.status = 'pending'
          and invitation.expires_at > statement_timestamp()
      ) as pending,
      count(*) filter (where invitation.status = 'claimed') as claimed,
      count(*) filter (where invitation.status = 'qualified') as qualified,
      count(*) filter (
        where invitation.status = 'expired'
          or (
            invitation.status = 'pending'
            and invitation.expires_at <= statement_timestamp()
          )
      ) as expired,
      count(*) filter (where invitation.status = 'revoked') as revoked,
      count(*) filter (where invitation.delivery_count > 0) as delivered,
      count(*) filter (where invitation.delivery_count = 0) as undelivered,
      count(*) filter (
        where invitation.created_at >= statement_timestamp() - interval '30 days'
      ) as created_30d
    from public.seller_growth_invites as invitation
    where invitation.campaign_id = p_campaign_id
      and invitation.invite_kind = 'referral'
  ),
  cohort_metrics as (
    select
      count(*) as total,
      count(*) filter (
        where invitation.status = 'pending'
          and invitation.expires_at > statement_timestamp()
      ) as pending,
      count(*) filter (where invitation.status = 'claimed') as claimed,
      count(*) filter (where invitation.status = 'qualified') as qualified,
      count(*) filter (
        where invitation.status = 'expired'
          or (
            invitation.status = 'pending'
            and invitation.expires_at <= statement_timestamp()
          )
      ) as expired,
      count(*) filter (where invitation.status = 'revoked') as revoked,
      count(*) filter (where invitation.delivery_count > 0) as delivered,
      count(*) filter (where invitation.delivery_count = 0) as undelivered
    from public.seller_growth_invites as invitation
    where invitation.campaign_id = p_campaign_id
      and invitation.invite_kind = 'cohort'
  ),
  paid_metrics as (
    select count(distinct grant_row.owner_id) as converted
    from public.promotional_plan_grants as grant_row
    join public.billing_subscriptions as subscription
      on subscription.owner_id = grant_row.owner_id
    where grant_row.campaign_id = p_campaign_id
      and subscription.plan_id in ('launch', 'pro', 'scale', 'enterprise')
      and (
        subscription.status in ('active', 'past_due', 'unpaid')
        or (
          subscription.status = 'trialing'
          and subscription.trial_ends_at is not null
          and pg_catalog.isfinite(subscription.trial_ends_at)
          and subscription.trial_ends_at > statement_timestamp()
        )
      )
  ),
  event_metrics as (
    select
      count(*) filter (
        where growth_event.event_type = 'fallback_applied'
      ) as fallback_applied,
      count(*) filter (
        where growth_event.event_type = 'grant_expired'
      ) as grant_expired_events,
      max(growth_event.created_at) as latest_event_at
    from public.seller_growth_events as growth_event
    where growth_event.campaign_id = p_campaign_id
  ),
  notice_metrics as (
    select count(*) as sent
    from public.promotional_grant_notices as notice
    join public.promotional_plan_grants as grant_row
      on grant_row.id = notice.grant_id
    where grant_row.campaign_id = p_campaign_id
  )
  select jsonb_build_object(
    'grants_total', coalesce(grant_metrics.total, 0),
    'grants_active', coalesce(grant_metrics.active, 0),
    'grants_expired', coalesce(grant_metrics.expired, 0),
    'grants_revoked', coalesce(grant_metrics.revoked, 0),
    'grants_superseded', coalesce(grant_metrics.superseded, 0),
    'welcome_grants', coalesce(grant_metrics.welcome, 0),
    'referral_grants', coalesce(grant_metrics.referral, 0),
    'grants_with_fallback', coalesce(grant_metrics.fallback_selected, 0),
    'grants_issued_30d', coalesce(grant_metrics.issued_30d, 0),
    'paid_conversions', coalesce(paid_metrics.converted, 0),
    'invites_total', coalesce(invite_metrics.total, 0),
    'invites_pending', coalesce(invite_metrics.pending, 0),
    'invites_claimed', coalesce(invite_metrics.claimed, 0),
    'invites_qualified', coalesce(invite_metrics.qualified, 0),
    'invites_expired', coalesce(invite_metrics.expired, 0),
    'invites_revoked', coalesce(invite_metrics.revoked, 0),
    'invites_delivered', coalesce(invite_metrics.delivered, 0),
    'invites_undelivered', coalesce(invite_metrics.undelivered, 0),
    'invites_created_30d', coalesce(invite_metrics.created_30d, 0),
    'cohort_total', coalesce(cohort_metrics.total, 0),
    'cohort_pending', coalesce(cohort_metrics.pending, 0),
    'cohort_claimed', coalesce(cohort_metrics.claimed, 0),
    'cohort_qualified', coalesce(cohort_metrics.qualified, 0),
    'cohort_expired', coalesce(cohort_metrics.expired, 0),
    'cohort_revoked', coalesce(cohort_metrics.revoked, 0),
    'cohort_delivered', coalesce(cohort_metrics.delivered, 0),
    'cohort_undelivered', coalesce(cohort_metrics.undelivered, 0),
    'fallback_applied', coalesce(event_metrics.fallback_applied, 0),
    'grant_expired_events', coalesce(event_metrics.grant_expired_events, 0),
    'notices_sent', coalesce(notice_metrics.sent, 0),
    'latest_event_at', event_metrics.latest_event_at
  )
  from grant_metrics
  cross join invite_metrics
  cross join cohort_metrics
  cross join paid_metrics
  cross join event_metrics
  cross join notice_metrics;
$$;

revoke all on function public.seller_growth_control_snapshot(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.seller_growth_control_snapshot(uuid)
  to service_role;

-- The foreign-key campaign check happens after this BEFORE INSERT trigger, so
-- direct service-role grant inserts enter the same ordered lock prefix before
-- they can fire grant reconciliation.
create or replace function private.nz_lock_direct_plan_grant_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.nz_try_owner_quota_locks('listings', old.owner_id);
    perform private.nz_try_owner_quota_locks('domains', old.owner_id);
    perform private.nz_try_growth_campaign_locks(old.campaign_id);
    return old;
  end if;

  perform private.nz_try_owner_quota_locks(
    'listings',
    new.owner_id,
    case when tg_op = 'UPDATE' then old.owner_id else null end
  );
  perform private.nz_try_owner_quota_locks(
    'domains',
    new.owner_id,
    case when tg_op = 'UPDATE' then old.owner_id else null end
  );
  perform private.nz_try_growth_campaign_locks(
    new.campaign_id,
    case when tg_op = 'UPDATE' then old.campaign_id else null end
  );
  return new;
end;
$$;

revoke all on function private.nz_lock_direct_plan_grant_insert()
  from public, anon, authenticated, service_role;

-- Direct current-window writes already reconcile through the AFTER trigger.
-- This marker distinguishes them from future-start grants, whose activation is
-- claimed later by the bounded lifecycle worker when wall-clock time advances.
create or replace function private.nz_stamp_plan_grant_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
begin
  if new.status = 'active' then
    if pg_catalog.isfinite(new.starts_at)
       and pg_catalog.isfinite(new.ends_at)
       and new.starts_at <= v_now
       and new.ends_at > v_now then
      new.entitlement_activated_at := v_now;
    else
      new.entitlement_activated_at := null;
    end if;
  elsif tg_op = 'INSERT' then
    new.entitlement_activated_at := null;
  elsif new.entitlement_activated_at is distinct from old.entitlement_activated_at then
    -- Activation is database-owned audit state even after a grant is no longer
    -- active; service code cannot forge or erase its historical marker.
    new.entitlement_activated_at := old.entitlement_activated_at;
  end if;

  return new;
end;
$$;

revoke all on function private.nz_stamp_plan_grant_activation()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_00_lock_direct_plan_grant_insert
  on public.promotional_plan_grants;
create trigger trg_00_lock_direct_plan_grant_insert
  before insert or delete or update of
    owner_id,
    campaign_id,
    plan_id,
    status,
    starts_at,
    ends_at,
    entitlement_activated_at
  on public.promotional_plan_grants
  for each row execute function private.nz_lock_direct_plan_grant_insert();

drop trigger if exists trg_01_stamp_plan_grant_activation
  on public.promotional_plan_grants;
create trigger trg_01_stamp_plan_grant_activation
  before insert or update of
    owner_id,
    plan_id,
    status,
    starts_at,
    ends_at,
    entitlement_activated_at
  on public.promotional_plan_grants
  for each row execute function private.nz_stamp_plan_grant_activation();

create or replace function private.nz_lock_billing_entitlement_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.nz_try_owner_quota_locks('listings', old.owner_id);
    perform private.nz_try_owner_quota_locks('domains', old.owner_id);
    return old;
  end if;

  perform private.nz_try_owner_quota_locks(
    'listings',
    new.owner_id,
    case when tg_op = 'UPDATE' then old.owner_id else null end
  );
  perform private.nz_try_owner_quota_locks(
    'domains',
    new.owner_id,
    case when tg_op = 'UPDATE' then old.owner_id else null end
  );
  return new;
end;
$$;

revoke all on function private.nz_lock_billing_entitlement_write()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_00_lock_billing_entitlement_write
  on public.billing_subscriptions;
create trigger trg_00_lock_billing_entitlement_write
  before insert or delete or update of
    owner_id,
    plan_id,
    status,
    trial_ends_at,
    stripe_connect_charges_enabled
  on public.billing_subscriptions
  for each row execute function private.nz_lock_billing_entitlement_write();

create or replace function private.nz_lock_admin_entitlement_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.nz_try_owner_quota_locks('listings', old.user_id);
    perform private.nz_try_owner_quota_locks('domains', old.user_id);
    return old;
  end if;

  perform private.nz_try_owner_quota_locks(
    'listings',
    new.user_id,
    case when tg_op = 'UPDATE' then old.user_id else null end
  );
  perform private.nz_try_owner_quota_locks(
    'domains',
    new.user_id,
    case when tg_op = 'UPDATE' then old.user_id else null end
  );
  return new;
end;
$$;

revoke all on function private.nz_lock_admin_entitlement_write()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_00_lock_admin_entitlement_write
  on public.platform_admins;
create trigger trg_00_lock_admin_entitlement_write
  before insert or delete or update of user_id on public.platform_admins
  for each row execute function private.nz_lock_admin_entitlement_write();

create or replace function private.nz_lock_growth_campaign_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.nz_try_growth_campaign_locks(old.id);
    return old;
  end if;

  perform private.nz_try_growth_campaign_locks(
    new.id,
    case when tg_op = 'UPDATE' then old.id else null end
  );
  return new;
end;
$$;

revoke all on function private.nz_lock_growth_campaign_write()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_00_lock_growth_campaign_write
  on public.seller_growth_campaigns;
create trigger trg_00_lock_growth_campaign_write
  before insert or delete or update of status, starts_at, signup_closes_at
  on public.seller_growth_campaigns
  for each row execute function private.nz_lock_growth_campaign_write();

-- The existing invitation guard locks the campaign row. Claimed invitations
-- can then issue a grant in an AFTER trigger, so take the owner quota prefix
-- and campaign advisory lock first. Trigger names order same-timing triggers.
create or replace function private.nz_lock_seller_growth_invite_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claims boolean := false;
begin
  if tg_op = 'INSERT' then
    v_claims := new.status = 'claimed';
  else
    v_claims := new.status = 'claimed'
      and (
        old.status is distinct from new.status
        or old.accepted_by_owner_id is distinct from new.accepted_by_owner_id
      );
  end if;

  if v_claims and new.accepted_by_owner_id is not null then
    perform private.nz_try_owner_quota_locks(
      'listings',
      new.accepted_by_owner_id
    );
    perform private.nz_try_owner_quota_locks(
      'domains',
      new.accepted_by_owner_id
    );
  end if;

  if new.campaign_id is not null then
    perform private.nz_try_entitlement_allocation_lock(
      'nexez:growth:campaign:' || new.campaign_id::text,
      'campaign:' || new.campaign_id::text
    );

    if exists (
      select 1
      from public.seller_growth_campaigns as campaign
      where campaign.id = new.campaign_id
        and campaign.status = 'active'
        and (
          not pg_catalog.isfinite(campaign.starts_at)
          or (
            campaign.signup_closes_at is not null
            and not pg_catalog.isfinite(campaign.signup_closes_at)
          )
        )
    ) then
      raise exception 'This invitation campaign has an invalid activation window.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.nz_lock_seller_growth_invite_claim()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_00_lock_seller_growth_invite_claim
  on public.seller_growth_invites;
create trigger trg_00_lock_seller_growth_invite_claim
  before insert or update of campaign_id, status, accepted_by_owner_id
  on public.seller_growth_invites
  for each row execute function private.nz_lock_seller_growth_invite_claim();

-- Published-listing writes remain serialized, but the obsolete grandfather
-- baseline no longer expands the exact plan allocation. Downgrades preserve
-- rows by moving deterministic overflow back to draft.
create or replace function public.enforce_published_page_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
begin
  if new.is_published is not true then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.is_published is true
     and old.owner_id is not distinct from new.owner_id then
    return new;
  end if;
  if new.owner_id is null then
    return new;
  end if;

  perform private.nz_try_owner_quota_locks(
    'listings',
    new.owner_id,
    case when tg_op = 'UPDATE' then old.owner_id else null end
  );

  v_limit := public.plan_published_page_limit(new.owner_id);

  select count(*)::integer
  into v_count
  from public.pages as page
  where page.owner_id = new.owner_id
    and page.is_published is true
    and page.id <> new.id;

  if v_count >= v_limit then
    raise exception 'Published listing limit reached for your plan (% listing(s)).', v_limit
      using errcode = 'check_violation',
            hint = 'Upgrade your plan or unpublish another listing.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_published_page_limit()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_enforce_published_page_limit on public.pages;
create trigger trg_enforce_published_page_limit
  before insert or update of owner_id, is_published on public.pages
  for each row execute function public.enforce_published_page_limit();

create or replace function private.nz_enforce_storefront_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
begin
  if tg_op = 'DELETE' then
    perform private.nz_try_owner_quota_locks('storefronts', old.owner_id);
    return old;
  end if;

  perform private.nz_try_owner_quota_locks(
    'storefronts',
    new.owner_id,
    case when tg_op = 'UPDATE' then old.owner_id else null end
  );

  if new.owner_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.owner_id is not distinct from new.owner_id then
    return new;
  end if;

  v_limit := public.owner_storefront_limit(new.owner_id);

  select count(*)::integer
  into v_count
  from public.storefronts as storefront
  where storefront.owner_id = new.owner_id
    and storefront.plan_suspended_at is null
    and storefront.id <> new.id;

  if v_count >= v_limit then
    raise exception 'Storefront limit reached for your plan (% storefront(s)).', v_limit
      using errcode = 'check_violation',
            hint = 'Upgrade your plan to create another storefront.';
  end if;

  -- Browser inserts cannot self-classify as suspended. A new storefront that
  -- fits the serialized active allocation always enters as active.
  new.plan_suspended_at := null;

  return new;
end;
$$;

revoke all on function private.nz_enforce_storefront_limit()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_enforce_storefront_limit on public.storefronts;
create trigger trg_enforce_storefront_limit
  before insert or delete or update of owner_id, created_at on public.storefronts
  for each row execute function private.nz_enforce_storefront_limit();

-- Branding configuration is retained after a downgrade, but direct table
-- writes must not become a way to allocate Launch features. Treat null and
-- blank string values as cleared while leaving unknown JSON keys untouched.
create or replace function private.nz_branding_configuration_value(
  p_branding jsonb,
  p_key text
)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_branding) <> 'object'
      or not (p_branding ? p_key)
      or p_branding -> p_key = 'null'::jsonb
      then null
    when jsonb_typeof(p_branding -> p_key) = 'string'
      and nullif(btrim(p_branding ->> p_key), '') is null
      then null
    when jsonb_typeof(p_branding -> p_key) = 'string'
      then to_jsonb(btrim(p_branding ->> p_key))
    else p_branding -> p_key
  end;
$$;

revoke all on function private.nz_branding_configuration_value(jsonb, text)
  from public, anon, authenticated, service_role;

create or replace function private.nz_enforce_page_branding_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_branding jsonb := '{}'::jsonb;
  v_key text;
  v_old_value jsonb;
  v_new_value jsonb;
  v_old_hides_badge boolean := false;
  v_new_hides_badge boolean := false;
begin
  if tg_op = 'UPDATE'
     and new.owner_id is not distinct from old.owner_id
     and new.branding is not distinct from old.branding then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.owner_id is not distinct from old.owner_id then
    v_old_branding := coalesce(old.branding, '{}'::jsonb);
  end if;

  if not private.nz_owner_feature_allowed(new.owner_id, 'whiteLabel') then
    foreach v_key in array array['brand_name', 'accent_color', 'logo_url'] loop
      v_old_value := private.nz_branding_configuration_value(v_old_branding, v_key);
      v_new_value := private.nz_branding_configuration_value(new.branding, v_key);

      if v_new_value is not null
         and v_new_value is distinct from v_old_value then
        raise exception 'Custom page branding is a Launch plan feature.'
          using errcode = 'check_violation',
                hint = 'Upgrade to Launch, retain existing branding unchanged, or clear the retained value.';
      end if;
    end loop;
  end if;

  if not private.nz_owner_feature_allowed(new.owner_id, 'removeBadge') then
    v_old_hides_badge := coalesce(v_old_branding -> 'hide_nexez_badge' = 'true'::jsonb, false);
    v_new_hides_badge := coalesce(new.branding -> 'hide_nexez_badge' = 'true'::jsonb, false);

    if v_new_hides_badge and not v_old_hides_badge then
      raise exception 'Removing the Nexez badge is a Launch plan feature.'
        using errcode = 'check_violation',
              hint = 'Upgrade to Launch, retain an existing hidden-badge setting, or show the badge.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.nz_enforce_page_branding_plan()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_enforce_page_branding_plan on public.pages;
create trigger trg_enforce_page_branding_plan
  before insert or update of owner_id, branding
  on public.pages
  for each row execute function private.nz_enforce_page_branding_plan();

create or replace function private.nz_enforce_storefront_branding_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_logo_url text;
  v_old_accent_color text;
begin
  -- Canonical blanks are destructive cleanup, not dormant retained branding.
  new.logo_url := nullif(btrim(new.logo_url), '');
  new.accent_color := nullif(btrim(new.accent_color), '');

  if tg_op = 'UPDATE'
     and new.owner_id is not distinct from old.owner_id then
    v_old_logo_url := nullif(btrim(old.logo_url), '');
    v_old_accent_color := nullif(btrim(old.accent_color), '');
  end if;

  if private.nz_owner_feature_allowed(new.owner_id, 'whiteLabel') then
    return new;
  end if;

  if (new.logo_url is not null and new.logo_url is distinct from v_old_logo_url)
     or (
       new.accent_color is not null
       and new.accent_color is distinct from v_old_accent_color
     ) then
    raise exception 'Custom storefront branding is a Launch plan feature.'
      using errcode = 'check_violation',
            hint = 'Upgrade to Launch, retain existing branding unchanged, or clear the retained value.';
  end if;

  return new;
end;
$$;

revoke all on function private.nz_enforce_storefront_branding_plan()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_enforce_storefront_branding_plan on public.storefronts;
create trigger trg_enforce_storefront_branding_plan
  before insert or update of owner_id, logo_url, accent_color
  on public.storefronts
  for each row execute function private.nz_enforce_storefront_branding_plan();

-- Recompute the exact oldest-N active allocation without deleting storefronts,
-- moving listings, or erasing brand configuration. This shares the quota lock
-- with the insert guard, so entitlement changes cannot race storefront writes.
create or replace function private.nz_reconcile_owner_storefront_entitlements(p_owner uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_suspended integer := 0;
begin
  if p_owner is null then
    return 0;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('nexez:quota:storefronts:' || p_owner::text, 0)
  );

  v_limit := public.owner_storefront_limit(p_owner);

  with ranked_storefronts as (
    select
      storefront.id,
      row_number() over (
        order by storefront.created_at, storefront.id
      ) as allocation_number
    from public.storefronts as storefront
    where storefront.owner_id = p_owner
  ),
  desired_state as (
    select
      ranked.id,
      ranked.allocation_number > v_limit as should_suspend
    from ranked_storefronts as ranked
  )
  update public.storefronts as storefront
  set plan_suspended_at = case
    when desired.should_suspend
      then coalesce(storefront.plan_suspended_at, statement_timestamp())
    else null
  end
  from desired_state as desired
  where storefront.id = desired.id
    and (
      (desired.should_suspend and storefront.plan_suspended_at is null)
      or (not desired.should_suspend and storefront.plan_suspended_at is not null)
    );

  select count(*)::integer
  into v_suspended
  from public.storefronts as storefront
  where storefront.owner_id = p_owner
    and storefront.plan_suspended_at is not null;

  -- The anon projection has no storefront_id, so materialize the suspension in
  -- its existing serving flag. Base pages and assignments stay untouched.
  update public.pages_public as projection
  set serving = not exists (
    select 1
    from public.storefronts as storefront
    where storefront.id = page.storefront_id
      and storefront.plan_suspended_at is not null
  )
  from public.pages as page
  where page.id = projection.id
    and page.owner_id = p_owner;

  return v_suspended;
end;
$$;

revoke all on function private.nz_reconcile_owner_storefront_entitlements(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.nz_reconcile_storefront_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.nz_reconcile_owner_storefront_entitlements(old.owner_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id) then
    perform private.nz_reconcile_owner_storefront_entitlements(new.owner_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.nz_reconcile_storefront_trigger()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_reconcile_storefront_entitlements on public.storefronts;
create trigger trg_reconcile_storefront_entitlements
  after insert or delete or update of owner_id, created_at on public.storefronts
  for each row execute function private.nz_reconcile_storefront_trigger();

-- A suspended storefront remains fully manageable, and existing listing
-- assignments remain intact. New listings and explicit moves, however, must
-- target a currently allocated storefront. Storefront assignment is owner-level
-- workspace administration: editor collaborators may update normal page content,
-- but cannot move the owner's listing between account storefronts through the
-- broad page UPDATE policy. The implicit default uses the same deterministic
-- oldest-active ordering as reconciliation.
create or replace function public.nz_pages_enforce_storefront_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_storefront_owner uuid;
  v_plan_suspended_at timestamptz;
begin
  if tg_op = 'UPDATE'
     and new.storefront_id is distinct from old.storefront_id
     and auth.role() = 'authenticated'
     and auth.uid() is distinct from old.owner_id then
    raise exception 'Only the page owner may change its storefront assignment.'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'INSERT' and new.storefront_id is null and new.owner_id is not null then
    select storefront.id
    into new.storefront_id
    from public.storefronts as storefront
    where storefront.owner_id = new.owner_id
      and storefront.plan_suspended_at is null
    order by storefront.created_at, storefront.id
    limit 1;
  end if;

  if new.storefront_id is not null then
    select storefront.owner_id, storefront.plan_suspended_at
    into v_storefront_owner, v_plan_suspended_at
    from public.storefronts as storefront
    where storefront.id = new.storefront_id;

    if v_storefront_owner is null or v_storefront_owner is distinct from new.owner_id then
      raise exception 'storefront_id % does not belong to page owner %', new.storefront_id, new.owner_id
        using errcode = 'insufficient_privilege';
    end if;

    if (tg_op = 'INSERT' or new.storefront_id is distinct from old.storefront_id)
       and v_plan_suspended_at is not null then
      raise exception 'Storefront % is suspended by the current plan allocation.', new.storefront_id
        using errcode = 'check_violation',
              hint = 'Upgrade the owner plan or choose an active storefront.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.nz_pages_enforce_storefront_owner()
  from public, anon, authenticated, service_role;

drop trigger if exists nz_pages_enforce_storefront_owner on public.pages;
create trigger nz_pages_enforce_storefront_owner
  before insert or update on public.pages
  for each row execute function public.nz_pages_enforce_storefront_owner();

-- Calendar connection identity and AI opt-in are authoring controls, not merely
-- execution hints. Preserve them after downgrade, but permit only destructive
-- cleanup until the corresponding feature is available again.
create or replace function private.nz_enforce_page_calendar_ai_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_google_calendar_id text;
  v_new_google_calendar_id text := nullif(btrim(new.google_calendar_id), '');
  v_old_llm_opt_in boolean := false;
begin
  new.google_calendar_id := v_new_google_calendar_id;

  if tg_op = 'UPDATE'
     and new.owner_id is not distinct from old.owner_id then
    v_old_google_calendar_id := nullif(btrim(old.google_calendar_id), '');
    v_old_llm_opt_in := coalesce(old.llm_opt_in, false);
  end if;

  if not private.nz_owner_feature_allowed(new.owner_id, 'integrations')
     and v_new_google_calendar_id is not null
     and v_new_google_calendar_id is distinct from v_old_google_calendar_id then
    raise exception 'Google Calendar integration is a Pro plan feature.'
      using errcode = 'check_violation',
            hint = 'Upgrade to Pro, retain the existing calendar unchanged, or disconnect it.';
  end if;

  if not private.nz_owner_feature_allowed(new.owner_id, 'aiFeatures')
     and coalesce(new.llm_opt_in, false)
     and not v_old_llm_opt_in then
    raise exception 'AI opt-in is a Launch plan feature.'
      using errcode = 'check_violation',
            hint = 'Upgrade to Launch to opt in. Opting out remains available on every plan.';
  end if;

  return new;
end;
$$;

revoke all on function private.nz_enforce_page_calendar_ai_plan()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_enforce_page_calendar_ai_plan on public.pages;
create trigger trg_enforce_page_calendar_ai_plan
  before insert or update of owner_id, google_calendar_id, llm_opt_in
  on public.pages
  for each row execute function private.nz_enforce_page_calendar_ai_plan();

-- Route checks are not authoritative while authenticated owners retain direct
-- page writes. Keep custom-domain configuration visible after a downgrade, but
-- make every routing-bearing field read-only below Launch except for explicit
-- disconnect/proof cleanup. This also blocks a trusted verification worker from
-- reactivating a retained, unverified domain after the owner's plan lapses.
create or replace function private.nz_enforce_page_custom_domain_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_domain text;
  v_new_domain text := lower(nullif(btrim(new.custom_domain), ''));
  v_old_path text := '/';
  v_new_path text := coalesce(nullif(btrim(new.domain_path), ''), '/');
  v_old_verified_at timestamptz;
begin
  if private.nz_owner_feature_allowed(new.owner_id, 'customDomain') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.owner_id is not distinct from old.owner_id then
    v_old_domain := lower(nullif(btrim(old.custom_domain), ''));
    v_old_path := coalesce(nullif(btrim(old.domain_path), ''), '/');
    v_old_verified_at := old.custom_domain_verified;
  end if;

  -- Null/blank domain is a destructive disconnect, never dormant paid config.
  -- Canonicalize the other routing fields so a direct write cannot retain a
  -- hidden path or proof for later reactivation.
  if v_new_domain is null then
    new.custom_domain := null;
    new.custom_domain_verified := null;
    new.domain_path := '/';
    return new;
  end if;

  if v_new_domain is distinct from v_old_domain
     or v_new_path is distinct from v_old_path then
    raise exception 'Custom domains and domain paths are a Launch plan feature.'
      using errcode = 'check_violation',
            hint = 'Upgrade to Launch, retain the existing domain routing unchanged, or disconnect it.';
  end if;

  if new.custom_domain_verified is not null
     and new.custom_domain_verified is distinct from v_old_verified_at then
    raise exception 'A retained custom domain cannot be verified or reactivated below Launch.'
      using errcode = 'check_violation',
            hint = 'Upgrade to Launch or leave the retained verification proof unchanged.';
  end if;

  -- Preserve the canonical routing identity for semantically equivalent no-op
  -- writes while still allowing an existing proof to be explicitly cleared.
  new.custom_domain := v_new_domain;
  new.domain_path := v_new_path;
  return new;
end;
$$;

revoke all on function private.nz_enforce_page_custom_domain_plan()
  from public, anon, authenticated, service_role;

-- Same-timing triggers run alphabetically. This guard must precede the legacy
-- reclaim trigger, whose allowed writes may clear another owner's stale,
-- unverified claim. A denied below-Launch claim therefore has no side effects.
drop trigger if exists trg_00_enforce_page_custom_domain_plan on public.pages;
create trigger trg_00_enforce_page_custom_domain_plan
  before insert or update of
    owner_id,
    custom_domain,
    custom_domain_verified,
    domain_path
  on public.pages
  for each row execute function private.nz_enforce_page_custom_domain_plan();

-- The quota is charged when DNS ownership becomes verified. Multiple listing
-- paths on the same normalized domain consume one allocation.
create or replace function private.nz_enforce_verified_custom_domain_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text;
  v_limit integer;
  v_count integer;
begin
  v_domain := lower(nullif(btrim(new.custom_domain), ''));
  if new.owner_id is null
     or new.custom_domain_verified is null
     or v_domain is null then
    return new;
  end if;

  -- Global per-owner lock order is listings -> domains -> entitlement
  -- reconciliation -> storefronts -> team. A verified-domain page write can
  -- qualify a promotional grant in an AFTER trigger, which enters the full
  -- reconciliation path; taking the listing lock first avoids a domain/listing
  -- inversion against a concurrent publish.
  perform private.nz_try_owner_quota_locks(
    'listings',
    new.owner_id,
    case when tg_op = 'UPDATE' then old.owner_id else null end
  );
  perform private.nz_try_owner_quota_locks(
    'domains',
    new.owner_id,
    case when tg_op = 'UPDATE' then old.owner_id else null end
  );

  -- Another path on an already-verified owner domain does not consume a slot.
  if exists (
    select 1
    from public.pages as page
    where page.owner_id = new.owner_id
      and page.id <> new.id
      and page.custom_domain_verified is not null
      and lower(btrim(page.custom_domain)) = v_domain
  ) then
    return new;
  end if;

  v_limit := public.owner_custom_domain_limit(new.owner_id);

  select count(distinct lower(btrim(page.custom_domain)))::integer
  into v_count
  from public.pages as page
  where page.owner_id = new.owner_id
    and page.id <> new.id
    and page.custom_domain_verified is not null
    and nullif(btrim(page.custom_domain), '') is not null;

  if v_count >= v_limit then
    raise exception 'Verified custom-domain limit reached for your plan (% domain(s)).', v_limit
      using errcode = 'check_violation',
            hint = 'Upgrade your plan or disconnect another verified domain.';
  end if;

  return new;
end;
$$;

revoke all on function private.nz_enforce_verified_custom_domain_limit()
  from public, anon, authenticated, service_role;

-- PostgreSQL fires same-timing triggers by name. The existing
-- trg_custom_domain_single_owner hygiene trigger runs first and clears stale
-- proofs before this quota trigger evaluates the final NEW row.
drop trigger if exists trg_enforce_verified_custom_domain_limit on public.pages;
create trigger trg_enforce_verified_custom_domain_limit
  before insert or update of owner_id, custom_domain, custom_domain_verified
  on public.pages
  for each row execute function private.nz_enforce_verified_custom_domain_limit();

create or replace function private.nz_enforce_team_invite_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allocates_seat boolean;
  v_limit integer;
  v_count integer;
begin
  if tg_op = 'DELETE' then
    perform private.nz_try_owner_quota_locks('team', old.owner_id);
    return old;
  end if;

  if tg_op = 'UPDATE'
     and new.created_at is distinct from old.created_at then
    raise exception 'team_invites.created_at is immutable.'
      using errcode = 'insufficient_privilege';
  end if;

  perform private.nz_try_owner_quota_locks(
    'team',
    new.owner_id,
    case when tg_op = 'UPDATE' then old.owner_id else null end
  );

  if new.owner_id is null then
    return new;
  end if;

  -- A downgraded workspace keeps its invite history and may remove access, but
  -- cannot advance the premium collaboration workflow or rewrite the retained
  -- identity/role through direct PostgREST updates. This applies equally to a
  -- trusted accept worker: pending -> accepted is a new access grant.
  if tg_op = 'UPDATE'
     and not private.nz_owner_feature_allowed(new.owner_id, 'teamCollaboration') then
    if new.owner_id is distinct from old.owner_id
       or new.email is distinct from old.email
       or new.role is distinct from old.role
       or (
         new.status is distinct from old.status
         and new.status <> 'revoked'
       ) then
      raise exception 'Retained team invitations are read-only below Pro except for revocation.'
        using errcode = 'check_violation',
              hint = 'Upgrade to Pro to change or accept the invitation, or revoke it to remove access.';
    end if;

    return new;
  end if;

  if tg_op = 'INSERT' then
    v_allocates_seat := new.status <> 'revoked';
  else
    v_allocates_seat := new.status <> 'revoked'
      and (
        old.status = 'revoked'
        or old.owner_id is distinct from new.owner_id
      );
  end if;

  if not v_allocates_seat then
    return new;
  end if;

  if not private.nz_owner_feature_allowed(new.owner_id, 'teamCollaboration') then
    raise exception 'Team collaboration is a Pro plan feature.'
      using errcode = 'check_violation',
            hint = 'Upgrade to Pro to invite team members.';
  end if;

  v_limit := public.owner_team_seat_limit(new.owner_id);

  select count(*)::integer
  into v_count
  from public.team_invites as invite
  where invite.owner_id = new.owner_id
    and invite.status <> 'revoked'
    and invite.id <> new.id;

  if v_count >= v_limit then
    raise exception 'Team seat limit reached for your plan (% seat(s)).', v_limit
      using errcode = 'check_violation',
            hint = 'Upgrade your plan or revoke another invitation.';
  end if;

  return new;
end;
$$;

revoke all on function private.nz_enforce_team_invite_plan()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_enforce_team_collaboration on public.team_invites;
drop function if exists public.enforce_team_collaboration_plan();
create trigger trg_enforce_team_collaboration
  before insert or delete or update of
    status,
    owner_id,
    email,
    role,
    created_at
  on public.team_invites
  for each row execute function private.nz_enforce_team_invite_plan();

-- Preserve the all-role owner_id immutability installed by
-- 20260626001100_pin_pages_owner.sql. There is no supported transfer workflow.

-- created_at controls oldest-N downgrade allocation and must be immutable.
-- embedding and last_booking are platform-authored ranking/trust signals: an
-- authenticated owner or editor may edit normal listing content but cannot
-- forge either signal. Browser inserts receive a trusted statement timestamp;
-- service-role jobs may seed all three fields for controlled imports/repairs.
create or replace function private.nz_enforce_page_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.role() = 'authenticated' or current_user = 'authenticated' then
      if new.embedding is not null or new.last_booking is not null then
        raise exception 'Page ranking and trust signals require a trusted server workflow.'
          using errcode = 'insufficient_privilege',
                hint = 'Authenticated page creators cannot seed embedding or last_booking.';
      end if;

      -- Defaults are evaluated before BEFORE triggers, so normalize instead
      -- of trying to distinguish an explicit browser value from now().
      new.created_at := statement_timestamp();
    end if;

    return new;
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'pages.created_at is immutable.'
      using errcode = 'insufficient_privilege';
  end if;

  -- pgvector intentionally has no equality operator; its canonical text form
  -- is stable and sufficient for detecting a privileged-column rewrite.
  if new.embedding::text is not distinct from old.embedding::text
     and new.last_booking is not distinct from old.last_booking then
    return new;
  end if;

  if auth.role() = 'service_role'
     or current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  raise exception 'Page ranking and trust signals require a trusted server workflow.'
    using errcode = 'insufficient_privilege',
          hint = 'Authenticated page owners and collaborators cannot write embedding or last_booking.';
end;
$$;

revoke all on function private.nz_enforce_page_privileged_columns()
  from public, anon, authenticated, service_role;

grant select (id, embedding, last_booking) on public.pages to service_role;
grant update (embedding, last_booking) on public.pages to service_role;
grant insert (
  id,
  owner_id,
  name,
  slug,
  created_at,
  embedding,
  last_booking
) on public.pages to service_role;

drop trigger if exists trg_enforce_page_privileged_columns on public.pages;
create trigger trg_enforce_page_privileged_columns
  before insert or update of created_at, embedding, last_booking
  on public.pages
  for each row execute function private.nz_enforce_page_privileged_columns();

-- Team approval state predates the normalized invite table and is still stored
-- inside pages.team_collaboration. Protect that direct PostgREST write surface
-- in PostgreSQL as well: owners below Pro may retain and read historical JSON,
-- or explicitly remove its approvals, but cannot add approvals or mutate their
-- workflow state by bypassing the application route.
create or replace function private.nz_enforce_page_team_collaboration_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_tail jsonb := '{}'::jsonb;
  v_new_tail jsonb := '{}'::jsonb;
  v_new_approvals jsonb;
begin
  if tg_op = 'UPDATE'
     and new.team_collaboration is not distinct from old.team_collaboration then
    return new;
  end if;

  -- Collaborators intentionally request approval through the validated server
  -- route, which constructs bounded entries and writes with service-role
  -- authority. Never let a browser-authenticated non-owner forge, approve, or
  -- clear the embedded workflow through the broad collaborator page policy.
  if auth.role() = 'authenticated'
     and auth.uid() is distinct from (case
       when tg_op = 'UPDATE' then old.owner_id
       else new.owner_id
     end) then
    raise exception 'Only the page owner may write team approval state directly.'
      using errcode = 'insufficient_privilege',
            hint = 'Use the team approval request route for collaborator review requests.';
  end if;

  -- A null/empty whole value is an explicit destructive cleanup. Normalize it
  -- to the column's canonical non-null representation.
  if new.team_collaboration is null
     or new.team_collaboration = 'null'::jsonb
     or new.team_collaboration = '{}'::jsonb then
    new.team_collaboration := '{"approvals":[]}'::jsonb;
    return new;
  end if;

  if jsonb_typeof(new.team_collaboration) = 'object' then
    v_new_tail := new.team_collaboration - 'approvals';
    v_new_approvals := new.team_collaboration -> 'approvals';

    if tg_op = 'UPDATE'
       and jsonb_typeof(old.team_collaboration) = 'object' then
      v_old_tail := old.team_collaboration - 'approvals';
    end if;

    -- Preserve any non-workflow metadata while allowing the caller to clear
    -- approvals. Requiring the remaining object to be unchanged prevents an
    -- empty approvals array from becoming a generic Free-plan JSON bypass.
    if (
         case jsonb_typeof(v_new_approvals)
           when 'null' then true
           when 'array' then jsonb_array_length(v_new_approvals) = 0
           else false
         end
       )
       and v_new_tail is not distinct from v_old_tail then
      new.team_collaboration := jsonb_set(
        new.team_collaboration,
        '{approvals}',
        '[]'::jsonb,
        true
      );
      return new;
    end if;
  end if;

  if new.owner_id is not null
     and private.nz_owner_feature_allowed(
       new.owner_id,
       'teamCollaboration'
     ) then
    return new;
  end if;

  raise exception 'Team approval workflows are a Pro plan feature.'
    using errcode = 'check_violation',
          hint = 'Upgrade to Pro or clear the retained approvals.';
end;
$$;

revoke all on function private.nz_enforce_page_team_collaboration_plan()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_enforce_page_team_collaboration_plan on public.pages;
create trigger trg_enforce_page_team_collaboration_plan
  before insert or update of team_collaboration
  on public.pages
  for each row execute function private.nz_enforce_page_team_collaboration_plan();

-- Negotiation posture and rules are embedded in pages.services/products and in
-- the owner-only pages.draft staging JSON. The application gates its form and
-- intake reducer, but owners can also write either surface through PostgREST.
-- Canonicalize exactly the paid portion of each offer: open-to-offers posture
-- plus pricing/automation keys. Booking, scope, and unknown forward-compatible
-- rules remain core features. Below Pro, the combined services/products
-- multiset of paid negotiation configurations may only stay the same or shrink;
-- ordinary renames and kind moves remain available while additions, clones,
-- and material paid mutations fail closed.
create or replace function private.nz_offer_negotiation_configuration(
  p_offer jsonb
)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'offerType', case
      when p_offer ->> 'offerType' = 'negotiable' then 'negotiable'
      else 'fixed'
    end,
    'rules', case
      when jsonb_typeof(p_offer -> 'rules') = 'object' then
        jsonb_strip_nulls(jsonb_build_object(
          'minPrice', p_offer #> '{rules,minPrice}',
          'maxDiscountPercent', p_offer #> '{rules,maxDiscountPercent}',
          'autoAccept', p_offer #> '{rules,autoAccept}',
          'autoAcceptWithinPercent', p_offer #> '{rules,autoAcceptWithinPercent}',
          'autoCounter', p_offer #> '{rules,autoCounter}',
          'autoSettleMax', p_offer #> '{rules,autoSettleMax}'
        ))
      else '{}'::jsonb
    end
  );
$$;

create or replace function private.nz_offer_collection_adds_negotiation(
  p_old jsonb,
  p_new jsonb,
  p_old_secondary jsonb default '[]'::jsonb
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  with old_offer as (
    select
      source.source_id,
      private.nz_offer_negotiation_configuration(value) as configuration
    from (values (1, p_old), (2, p_old_secondary)) as source(source_id, collection)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(source.collection) = 'array'
        then source.collection
        else '[]'::jsonb
      end
    )
  ),
  old_source_configured as (
    select source_id, configuration, count(*)::bigint as offer_count
    from old_offer
    where configuration ->> 'offerType' = 'negotiable'
       or configuration -> 'rules' <> '{}'::jsonb
    group by source_id, configuration
  ),
  old_configured as (
    -- A draft is an alternative staged collection, not an additional copy of
    -- live configuration. Use the greatest per-source multiplicity so the
    -- same retained offer appearing in both surfaces cannot authorize a clone.
    select configuration, max(offer_count)::bigint as offer_count
    from old_source_configured
    group by configuration
  ),
  new_offer as (
    select
      private.nz_offer_negotiation_configuration(value) as configuration
    from jsonb_array_elements(
      case when jsonb_typeof(p_new) = 'array' then p_new else '[]'::jsonb end
    )
  ),
  new_configured as (
    select configuration, count(*)::bigint as offer_count
    from new_offer
    where configuration ->> 'offerType' = 'negotiable'
       or configuration -> 'rules' <> '{}'::jsonb
    group by configuration
  )
  select exists (
    select 1
    from new_configured as incoming
    left join old_configured as retained
      on retained.configuration = incoming.configuration
    where incoming.offer_count > coalesce(retained.offer_count, 0)
  );
$$;

revoke all on function private.nz_offer_negotiation_configuration(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.nz_offer_collection_adds_negotiation(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.nz_enforce_page_negotiation_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_offers jsonb := '[]'::jsonb;
  v_old_draft_offers jsonb := '[]'::jsonb;
  v_new_offers jsonb :=
    (case when jsonb_typeof(new.services) = 'array' then new.services else '[]'::jsonb end)
    ||
    (case when jsonb_typeof(new.products) = 'array' then new.products else '[]'::jsonb end);
  v_new_draft_offers jsonb :=
    (case when jsonb_typeof(new.draft -> 'services') = 'array'
      then new.draft -> 'services' else '[]'::jsonb end)
    ||
    (case when jsonb_typeof(new.draft -> 'products') = 'array'
      then new.draft -> 'products' else '[]'::jsonb end);
begin
  if tg_op = 'UPDATE'
     and new.owner_id is not distinct from old.owner_id
     and new.services is not distinct from old.services
     and new.products is not distinct from old.products
     and new.draft is not distinct from old.draft then
    return new;
  end if;

  if new.owner_id is not null
     and private.nz_owner_feature_allowed(new.owner_id, 'negotiation') then
    return new;
  end if;

  -- An ownership transfer is a fresh allocation for the destination owner;
  -- retained paid configuration belongs only to the original owner.
  if tg_op = 'UPDATE'
     and new.owner_id is not distinct from old.owner_id then
    v_old_offers :=
      (case when jsonb_typeof(old.services) = 'array' then old.services else '[]'::jsonb end)
      ||
      (case when jsonb_typeof(old.products) = 'array' then old.products else '[]'::jsonb end);
    v_old_draft_offers :=
      (case when jsonb_typeof(old.draft -> 'services') = 'array'
        then old.draft -> 'services' else '[]'::jsonb end)
      ||
      (case when jsonb_typeof(old.draft -> 'products') = 'array'
        then old.draft -> 'products' else '[]'::jsonb end);
  end if;

  if private.nz_offer_collection_adds_negotiation(v_old_offers, v_new_offers)
     or private.nz_offer_collection_adds_negotiation(
       v_old_draft_offers,
       v_new_draft_offers,
       v_old_offers
     ) then
    raise exception 'Open-to-offers pricing and paid automation rules are a Pro plan feature.'
      using errcode = 'check_violation',
            hint = 'Upgrade to Pro, retain the existing paid configuration unchanged, or set the offer to Fixed and clear only its paid pricing/automation rules.';
  end if;

  return new;
end;
$$;

revoke all on function private.nz_enforce_page_negotiation_plan()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_enforce_page_negotiation_plan on public.pages;
create trigger trg_enforce_page_negotiation_plan
  before insert or update of owner_id, services, products, draft
  on public.pages
  for each row execute function private.nz_enforce_page_negotiation_plan();

create or replace function private.nz_owner_domain_is_allocated(
  p_owner uuid,
  p_domain text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with grouped_domains as (
    select
      lower(btrim(page.custom_domain)) as domain_key,
      min(page.custom_domain_verified) as first_verified_at,
      min(page.created_at) as first_created_at
    from public.pages as page
    where page.owner_id = p_owner
      and page.custom_domain_verified is not null
      and nullif(btrim(page.custom_domain), '') is not null
    group by lower(btrim(page.custom_domain))
  ),
  ranked_domains as (
    select
      domain_key,
      row_number() over (
        order by first_verified_at, first_created_at, domain_key
      ) as allocation_number
    from grouped_domains
  )
  select coalesce((
    select ranked.allocation_number <= public.owner_custom_domain_limit(p_owner)
    from ranked_domains as ranked
    where ranked.domain_key = lower(nullif(btrim(p_domain), ''))
  ), false);
$$;

revoke all on function private.nz_owner_domain_is_allocated(uuid, text)
  from public, anon, authenticated, service_role;

-- The public projection exposes only verified domains within the current
-- allocation. Base-page configuration and DNS proof are retained on downgrade.
create or replace function private.nz_mask_public_custom_domain_by_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select page.owner_id
  into v_owner
  from public.pages as page
  where page.id = new.id;

  if new.custom_domain_verified is null
     or not private.nz_owner_domain_is_allocated(v_owner, new.custom_domain) then
    new.custom_domain := null;
    new.custom_domain_verified := null;
    new.domain_path := '/';
  end if;

  return new;
end;
$$;

revoke all on function private.nz_mask_public_custom_domain_by_plan()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_mask_public_custom_domain_by_plan on public.pages_public;
create trigger trg_mask_public_custom_domain_by_plan
  before insert or update of custom_domain, custom_domain_verified, domain_path
  on public.pages_public
  for each row execute function private.nz_mask_public_custom_domain_by_plan();

-- Every projection write is fail-closed for a suspended storefront. This also
-- protects future page edits: nz_sync_pages_public may propose serving=true,
-- but the materialized public row remains offline until reconciliation restores
-- that storefront's allocation.
create or replace function private.nz_mask_public_storefront_by_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.pages as page
    join public.storefronts as storefront
      on storefront.id = page.storefront_id
    where page.id = new.id
      and storefront.plan_suspended_at is not null
  ) then
    new.serving := false;
  end if;

  return new;
end;
$$;

revoke all on function private.nz_mask_public_storefront_by_plan()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_mask_public_storefront_by_plan on public.pages_public;
create trigger trg_mask_public_storefront_by_plan
  before insert or update of serving
  on public.pages_public
  for each row execute function private.nz_mask_public_storefront_by_plan();

create or replace function private.nz_resync_owner_public_entitlements(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_owner is null then
    return;
  end if;

  update public.pages_public as projection
  set
    serving = true,
    custom_domain = page.custom_domain,
    custom_domain_verified = page.custom_domain_verified,
    domain_path = coalesce(page.domain_path, '/')
  from public.pages as page
  where page.id = projection.id
    and page.owner_id = p_owner;
end;
$$;

revoke all on function private.nz_resync_owner_public_entitlements(uuid)
  from public, anon, authenticated, service_role;

-- Domain allocation is ranked across every verified domain owned by the
-- account. When the currently allocated domain is cleared, unverified, or its
-- last page is deleted, a retained overflow domain becomes eligible. Re-sync
-- every remaining projection immediately instead of waiting for an unrelated
-- billing or page write.
create or replace function private.nz_reconcile_domain_allocation_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_owner_a uuid;
  v_owner_b uuid;
begin
  if tg_op = 'INSERT' then
    if new.owner_id is null
       or new.custom_domain_verified is null
       or nullif(btrim(new.custom_domain), '') is null then
      return new;
    end if;
    v_owner_a := new.owner_id;
  elsif tg_op = 'DELETE' then
    if old.owner_id is null
       or old.custom_domain_verified is null
       or nullif(btrim(old.custom_domain), '') is null then
      return old;
    end if;
    v_owner_a := old.owner_id;
  else
    if new.custom_domain is not distinct from old.custom_domain
       and new.custom_domain_verified is not distinct from old.custom_domain_verified
       and new.owner_id is not distinct from old.owner_id then
      return new;
    end if;
    v_owner_a := old.owner_id;
    v_owner_b := new.owner_id;
  end if;

  if v_owner_a is null and v_owner_b is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- Keep the same global per-owner order as direct activation and full
  -- entitlement reconciliation. Both locks remain held through projection
  -- refresh, so a concurrent downgrade/activation cannot publish stale state.
  perform private.nz_try_owner_quota_locks('listings', v_owner_a, v_owner_b);
  perform private.nz_try_owner_quota_locks('domains', v_owner_a, v_owner_b);

  for v_owner in
    select distinct candidate.owner_id
    from unnest(array[v_owner_a, v_owner_b]) as candidate(owner_id)
    where candidate.owner_id is not null
    order by candidate.owner_id
  loop
    perform private.nz_resync_owner_public_entitlements(v_owner);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.nz_reconcile_domain_allocation_trigger()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_reconcile_domain_allocation on public.pages;
create trigger trg_reconcile_domain_allocation
  after insert or delete or update of owner_id, custom_domain, custom_domain_verified
  on public.pages
  for each row execute function private.nz_reconcile_domain_allocation_trigger();

create or replace function private.nz_reconcile_owner_team_entitlements(p_owner uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_suspended integer := 0;
begin
  if p_owner is null then
    return 0;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('nexez:quota:team:' || p_owner::text, 0)
  );

  v_limit := public.owner_team_seat_limit(p_owner);

  delete from private.team_invite_entitlement_suspensions as suspension
  where suspension.owner_id = p_owner;

  with ranked_invites as (
    select
      invite.id,
      row_number() over (
        order by
          case invite.status when 'accepted' then 0 else 1 end,
          invite.created_at,
          invite.id
      ) as allocation_number
    from public.team_invites as invite
    where invite.owner_id = p_owner
      and invite.status <> 'revoked'
  )
  insert into private.team_invite_entitlement_suspensions (
    invite_id,
    owner_id,
    reason,
    suspended_at
  )
  select
    ranked.id,
    p_owner,
    case when v_limit = 0 then 'feature_unavailable' else 'plan_limit' end,
    statement_timestamp()
  from ranked_invites as ranked
  where ranked.allocation_number > v_limit
  on conflict (invite_id) do update
  set
    owner_id = excluded.owner_id,
    reason = excluded.reason,
    suspended_at = excluded.suspended_at;

  get diagnostics v_suspended = row_count;
  return v_suspended;
end;
$$;

revoke all on function private.nz_reconcile_owner_team_entitlements(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.nz_reconcile_owner_entitlements(p_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing_limit integer;
  v_fallback_page uuid;
  v_unpublished integer := 0;
  v_suspended_storefronts integer := 0;
  v_suspended_team integer := 0;
begin
  if p_owner is null then
    return jsonb_build_object(
      'unpublishedListings', 0,
      'suspendedStorefronts', 0,
      'suspendedTeamSeats', 0
    );
  end if;

  -- One global per-owner lock order closes downgrade races and avoids
  -- deadlocks with page AFTER triggers that may issue a promotional grant:
  -- listings -> domains -> reconciliation -> storefronts -> team.
  --
  -- The first two locks serialize the entitlement snapshot plus corrective
  -- writes with direct publish/domain activation. Without them, a concurrent
  -- writer can observe the last committed higher plan while this transaction's
  -- downgrade is still uncommitted, then commit over quota afterward.
  perform pg_advisory_xact_lock(
    hashtextextended('nexez:quota:listings:' || p_owner::text, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('nexez:quota:domains:' || p_owner::text, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('nexez:entitlement-reconcile:' || p_owner::text, 0)
  );

  v_listing_limit := public.plan_published_page_limit(p_owner);

  select grant_row.fallback_page_id
  into v_fallback_page
  from public.promotional_plan_grants as grant_row
  join public.pages as page
    on page.id = grant_row.fallback_page_id
   and page.owner_id = p_owner
   and page.is_published is true
  where grant_row.owner_id = p_owner
    and grant_row.fallback_page_id is not null
  order by grant_row.created_at desc, grant_row.id
  limit 1;

  with ranked_pages as (
    select
      page.id,
      row_number() over (
        order by
          case when page.id = v_fallback_page then 0 else 1 end,
          page.created_at,
          page.id
      ) as allocation_number
    from public.pages as page
    where page.owner_id = p_owner
      and page.is_published is true
  )
  update public.pages as page
  set is_published = false
  from ranked_pages as ranked
  where page.id = ranked.id
    and ranked.allocation_number > v_listing_limit;

  get diagnostics v_unpublished = row_count;

  v_suspended_storefronts := private.nz_reconcile_owner_storefront_entitlements(p_owner);
  perform private.nz_resync_owner_public_entitlements(p_owner);
  v_suspended_team := private.nz_reconcile_owner_team_entitlements(p_owner);

  return jsonb_build_object(
    'unpublishedListings', v_unpublished,
    'suspendedStorefronts', v_suspended_storefronts,
    'suspendedTeamSeats', v_suspended_team
  );
end;
$$;

revoke all on function private.nz_reconcile_owner_entitlements(uuid)
  from public, anon, authenticated, service_role;

-- Compatibility shim for the existing growth cron/function name. It now
-- reconciles every tier rather than only the Free fallback.
create or replace function private.nz_reconcile_owner_free_fallback(p_owner uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    (private.nz_reconcile_owner_entitlements(p_owner) ->> 'unpublishedListings')::integer,
    0
  );
$$;

revoke all on function private.nz_reconcile_owner_free_fallback(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.nz_reconcile_team_invite_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.nz_reconcile_owner_team_entitlements(old.owner_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id or new.status is distinct from old.status) then
    perform private.nz_reconcile_owner_team_entitlements(new.owner_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.nz_reconcile_team_invite_trigger()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_reconcile_team_entitlements on public.team_invites;
create trigger trg_reconcile_team_entitlements
  after insert or delete or update of status, owner_id, created_at
  on public.team_invites
  for each row execute function private.nz_reconcile_team_invite_trigger();

-- Replace the older entitlement triggers so every billing/grant/admin mutation
-- reaches one reconciliation path.
create or replace function private.nz_growth_billing_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  v_owner := case when tg_op = 'DELETE' then old.owner_id else new.owner_id end;

  perform private.nz_maybe_issue_seller_growth_grant(v_owner);
  perform private.nz_reconcile_owner_entitlements(v_owner);

  if tg_op = 'UPDATE' and old.owner_id is distinct from new.owner_id then
    perform private.nz_reconcile_owner_entitlements(old.owner_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.nz_growth_billing_trigger()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_growth_and_entitlements_on_billing on public.billing_subscriptions;
create trigger trg_growth_and_entitlements_on_billing
  after insert or delete or update of
    owner_id,
    plan_id,
    status,
    trial_ends_at,
    stripe_connect_charges_enabled
  on public.billing_subscriptions
  for each row execute function private.nz_growth_billing_trigger();

create or replace function private.nz_growth_grant_entitlement_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  v_owner := case when tg_op = 'DELETE' then old.owner_id else new.owner_id end;
  perform private.nz_reconcile_owner_entitlements(v_owner);

  if tg_op = 'UPDATE' and old.owner_id is distinct from new.owner_id then
    perform private.nz_reconcile_owner_entitlements(old.owner_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.nz_growth_grant_entitlement_trigger()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_growth_entitlements_on_grant on public.promotional_plan_grants;
create trigger trg_growth_entitlements_on_grant
  after insert or delete or update of owner_id, status, starts_at, ends_at, plan_id
  on public.promotional_plan_grants
  for each row execute function private.nz_growth_grant_entitlement_trigger();

create or replace function private.nz_admin_entitlement_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.nz_reconcile_owner_entitlements(old.user_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and (tg_op = 'INSERT' or new.user_id is distinct from old.user_id) then
    perform private.nz_reconcile_owner_entitlements(new.user_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.nz_admin_entitlement_trigger()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_reconcile_entitlements_on_admin on public.platform_admins;
create trigger trg_reconcile_entitlements_on_admin
  after insert or delete or update of user_id on public.platform_admins
  for each row execute function private.nz_admin_entitlement_trigger();

create or replace function private.nz_can_collaborate_with_owner(
  p_owner uuid,
  p_require_editor boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and private.nz_owner_feature_allowed(p_owner, 'teamCollaboration')
    and exists (
      select 1
      from (
        select
          invite.id,
          invite.email,
          invite.role,
          invite.status,
          row_number() over (
            order by
              case invite.status when 'accepted' then 0 else 1 end,
              invite.created_at,
              invite.id
          ) as allocation_number
        from public.team_invites as invite
        where invite.owner_id = p_owner
          and invite.status <> 'revoked'
      ) as invite
      where invite.status = 'accepted'
        and invite.allocation_number <= public.owner_team_seat_limit(p_owner)
        and (not p_require_editor or invite.role = 'editor')
        and lower(invite.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and not exists (
          select 1
          from private.team_invite_entitlement_suspensions as suspension
          where suspension.invite_id = invite.id
        )
    );
$$;

revoke all on function private.nz_can_collaborate_with_owner(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function private.nz_can_collaborate_with_owner(uuid, boolean)
  to authenticated;

drop policy if exists "owners and collaborators read pages" on public.pages;
drop policy if exists "owners and entitled collaborators read pages" on public.pages;
create policy "owners and entitled collaborators read pages"
  on public.pages
  for select
  to authenticated
  using (
    (select auth.uid()) = owner_id
    or private.nz_can_collaborate_with_owner(owner_id, false)
  );

drop policy if exists "owners and editor collaborators update pages" on public.pages;
drop policy if exists "owners and entitled editor collaborators update pages" on public.pages;
create policy "owners and entitled editor collaborators update pages"
  on public.pages
  for update
  to authenticated
  using (
    (select auth.uid()) = owner_id
    or private.nz_can_collaborate_with_owner(owner_id, true)
  )
  with check (
    (select auth.uid()) = owner_id
    or private.nz_can_collaborate_with_owner(owner_id, true)
  );

-- Raw analytics access has the same history boundary as the rollup RPC.
drop policy if exists "Owners can read own checkout events" on public.checkout_events;
drop policy if exists "Owners read plan-bounded checkout events" on public.checkout_events;
create policy "Owners read plan-bounded checkout events"
  on public.checkout_events
  for select
  to authenticated
  using (
    (select auth.uid()) = owner_id
    and (
      (select private.nz_my_feature_allowed('analyticsHistory'))
      or created_at >= statement_timestamp() - interval '30 days'
    )
  );

drop policy if exists "Owners can read own agent visits" on public.agent_visits;
drop policy if exists "Owners read plan-bounded agent visits" on public.agent_visits;
create policy "Owners read plan-bounded agent visits"
  on public.agent_visits
  for select
  to authenticated
  using (
    (select auth.uid()) = owner_id
    and (
      (select private.nz_my_feature_allowed('analyticsHistory'))
      or created_at >= statement_timestamp() - interval '30 days'
    )
  );

-- Preserve the audited aggregation implementation as an inaccessible private
-- function, then put the plan boundary in a small owner-only wrapper. The
-- guarded move also makes interrupted local replay safe.
do $move_unbounded_analytics_rollup$
begin
  if to_regprocedure(
    'private.nz_owner_analytics_rollup_unbounded_v1(timestamptz,timestamptz,uuid,text,text,text)'
  ) is null then
    alter function public.nz_owner_analytics_rollup(
      timestamptz,
      timestamptz,
      uuid,
      text,
      text,
      text
    ) set schema private;

    alter function private.nz_owner_analytics_rollup(
      timestamptz,
      timestamptz,
      uuid,
      text,
      text,
      text
    ) rename to nz_owner_analytics_rollup_unbounded_v1;
  end if;
end
$move_unbounded_analytics_rollup$;

revoke all on function private.nz_owner_analytics_rollup_unbounded_v1(
  timestamptz,
  timestamptz,
  uuid,
  text,
  text,
  text
) from public, anon, authenticated, service_role;

create or replace function public.nz_owner_analytics_rollup(
  p_from timestamptz,
  p_to timestamptz default null,
  p_page_id uuid default null,
  p_query text default null,
  p_event_type text default null,
  p_traffic text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_effective_from timestamptz;
  v_history_cutoff timestamptz := statement_timestamp() - interval '30 days';
  v_traffic text := coalesce(nullif(lower(btrim(p_traffic)), ''), 'all');
begin
  if v_owner is null then
    raise exception 'authentication required'
      using errcode = 'insufficient_privilege';
  end if;
  if p_from is null then
    raise exception 'analytics range start is required'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_to is not null and p_to < p_from then
    raise exception 'analytics range end must not precede its start'
      using errcode = 'invalid_parameter_value';
  end if;
  if v_traffic not in ('all', 'ai', 'human') then
    raise exception 'invalid analytics traffic filter'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_page_id is not null and not exists (
    select 1
    from public.pages as page
    where page.id = p_page_id
      and page.owner_id = v_owner
  ) then
    raise exception 'analytics listing not found'
      using errcode = 'no_data_found';
  end if;

  if private.nz_owner_feature_allowed(v_owner, 'analyticsHistory') then
    v_effective_from := p_from;
  else
    v_effective_from := greatest(
      p_from,
      v_history_cutoff
    );

    -- The caller supplied a valid range, but every instant in it precedes the
    -- plan-visible window. Do not invert the clamped range passed to the private
    -- implementation, and do not query a substitute window that could disclose
    -- data outside the request. Return the canonical empty rollup instead.
    if p_to is not null and p_to < v_effective_from then
      return jsonb_build_object(
        'schemaVersion', 1,
        'counts', jsonb_build_object(
          'events', 0,
          'visits', 0,
          'aiVisits', 0,
          'humanVisits', 0,
          'discoveryClicks', 0,
          'checkoutAttempts', 0,
          'checkoutHandoffs', 0,
          'checkoutStarts', 0,
          'paidOrders', 0,
          'paidDirectOrders', 0,
          'retainedDirectOrders', 0,
          'negotiations', 0,
          'openNegotiations', 0,
          'completedNegotiations', 0
        ),
        'trust', jsonb_build_object(
          'events', jsonb_build_object(
            'total', 0,
            'verified', 0,
            'legacy', 0,
            'unverified', 0
          ),
          'visits', jsonb_build_object(
            'total', 0,
            'verified', 0,
            'legacy', 0,
            'unverified', 0
          )
        ),
        'daily', '[]'::jsonb,
        'channels', '[]'::jsonb,
        'currencies', '[]'::jsonb,
        'agentTypes', '[]'::jsonb,
        'topPages', '[]'::jsonb,
        'topOffers', '[]'::jsonb,
        'topQueries', '[]'::jsonb,
        'topReferrers', '[]'::jsonb,
        'activePageIds', '[]'::jsonb
      );
    end if;
  end if;

  return private.nz_owner_analytics_rollup_unbounded_v1(
    v_effective_from,
    p_to,
    p_page_id,
    p_query,
    p_event_type,
    p_traffic
  );
end;
$$;

revoke all on function public.nz_owner_analytics_rollup(
  timestamptz,
  timestamptz,
  uuid,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.nz_owner_analytics_rollup(
  timestamptz,
  timestamptz,
  uuid,
  text,
  text,
  text
) to authenticated;

comment on function public.nz_owner_analytics_rollup(
  timestamptz,
  timestamptz,
  uuid,
  text,
  text,
  text
) is
  'Owner-only analytics rollup. Free and Launch requests are clamped to the trailing 30 days inside PostgreSQL.';

-- Time passing does not fire a row trigger. Reconcile finite trial/grant expiry
-- and future grant activation under one global row budget. Each candidate set
-- uses SKIP LOCKED, while the shared remaining count guarantees a worker call
-- touches no more than p_batch_size lifecycle rows in total.
create or replace function private.nz_reconcile_time_bound_plan_entitlements(
  p_batch_size integer default 250
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trials_expired integer := 0;
  v_grants_expired integer := 0;
  v_grants_activated integer := 0;
  v_remaining integer;
  v_activated_owners uuid[] := '{}'::uuid[];
  v_owner uuid;
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 5000 then
    raise exception 'p_batch_size must be between 1 and 5000'
      using errcode = 'invalid_parameter_value';
  end if;

  v_remaining := p_batch_size;

  with candidates as (
    select subscription.owner_id
    from public.billing_subscriptions as subscription
    where subscription.status = 'trialing'
      and subscription.trial_ends_at is not null
      and subscription.trial_ends_at < statement_timestamp()
    order by subscription.trial_ends_at, subscription.owner_id
    limit v_remaining
    for update skip locked
  )
  update public.billing_subscriptions as subscription
  set status = 'expired'
  from candidates
  where subscription.owner_id = candidates.owner_id
    and subscription.status = 'trialing'
    and subscription.trial_ends_at < statement_timestamp();

  get diagnostics v_trials_expired = row_count;
  v_remaining := v_remaining - v_trials_expired;

  if v_remaining > 0 then
    with candidates as (
      select grant_row.id
      from public.promotional_plan_grants as grant_row
      where grant_row.status = 'active'
        and grant_row.ends_at <= statement_timestamp()
      order by grant_row.ends_at, grant_row.id
      limit v_remaining
      for update skip locked
    ),
    expired as (
      update public.promotional_plan_grants as grant_row
      set
        status = 'expired',
        updated_at = statement_timestamp()
      from candidates
      where grant_row.id = candidates.id
        and grant_row.status = 'active'
        and grant_row.ends_at <= statement_timestamp()
      returning
        grant_row.id,
        grant_row.campaign_id,
        grant_row.owner_id
    ),
    logged as (
      insert into public.seller_growth_events (
        campaign_id,
        owner_id,
        grant_id,
        event_type,
        metadata
      )
      select
        expired.campaign_id,
        expired.owner_id,
        expired.id,
        'grant_expired',
        jsonb_build_object('expired_by', 'database_entitlement_reconciler')
      from expired
      returning id
    )
    select count(*)::integer
    into v_grants_expired
    from expired;

    v_remaining := v_remaining - v_grants_expired;
  end if;

  if v_remaining > 0 then
    with candidates as (
      select grant_row.id
      from public.promotional_plan_grants as grant_row
      where grant_row.status = 'active'
        and grant_row.entitlement_activated_at is null
        and grant_row.starts_at <= statement_timestamp()
        and grant_row.ends_at > statement_timestamp()
      order by grant_row.starts_at, grant_row.id
      limit v_remaining
      for update skip locked
    ),
    activated as (
      update public.promotional_plan_grants as grant_row
      set entitlement_activated_at = statement_timestamp()
      from candidates
      where grant_row.id = candidates.id
        and grant_row.status = 'active'
        and grant_row.entitlement_activated_at is null
        and grant_row.starts_at <= statement_timestamp()
        and grant_row.ends_at > statement_timestamp()
      returning grant_row.owner_id
    )
    select
      count(*)::integer,
      coalesce(array_agg(distinct activated.owner_id), '{}'::uuid[])
    into v_grants_activated, v_activated_owners
    from activated;

    foreach v_owner in array v_activated_owners loop
      perform private.nz_reconcile_owner_entitlements(v_owner);
    end loop;

    v_remaining := v_remaining - v_grants_activated;
  end if;

  return jsonb_build_object(
    'trialsExpired', v_trials_expired,
    'grantsExpired', v_grants_expired,
    'grantsActivated', v_grants_activated,
    'rowsProcessed', p_batch_size - v_remaining
  );
end;
$$;

revoke all on function private.nz_reconcile_time_bound_plan_entitlements(integer)
  from public, anon, authenticated, service_role;

-- A clean Supabase replay does not implicitly give service_role ordinary data
-- privileges on tables created by the migration owner. RLS bypass alone is not
-- enough: the server-side clients used by entitlement resolution, page APIs,
-- cleanup, and credential storage still need explicit table ACLs. Keep these
-- grants limited to the operations exercised by trusted server workflows; no
-- browser role gains access, and private plan catalogs remain fully revoked.
grant select, insert, update, delete on table public.pages to service_role;
grant select on table public.pages_public to service_role;
grant select, delete on table public.storefronts to service_role;
grant select, update, delete on table public.team_invites to service_role;
grant select, insert, update, delete on table public.billing_subscriptions to service_role;
grant select, delete on table public.platform_admins to service_role;
grant select, update, delete on table public.api_keys to service_role;
grant select, insert, update, delete on table public.page_secrets to service_role;

do $time_bound_entitlement_schedule$
declare
  existing_job bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for existing_job in
      select jobid
      from cron.job
      where jobname in (
        'nexez_expire_time_bound_plan_entitlements',
        'nexez_reconcile_time_bound_plan_entitlements'
      )
    loop
      perform cron.unschedule(existing_job);
    end loop;

    perform cron.schedule(
      'nexez_reconcile_time_bound_plan_entitlements',
      '* * * * *',
      $command$select private.nz_reconcile_time_bound_plan_entitlements(250)$command$
    );
  end if;
end
$time_bound_entitlement_schedule$;

-- Apply the rebuilt contract to existing accounts. Rows and configuration are
-- retained: only overflow listings are drafted, excess domains are masked from
-- the public projection, and team access is suspended in the private ledger.
do $initial_entitlement_reconciliation$
declare
  v_owner uuid;
begin
  for v_owner in
    select owner_id
    from (
      select page.owner_id from public.pages as page
      union
      select subscription.owner_id from public.billing_subscriptions as subscription
      union
      select invite.owner_id from public.team_invites as invite
      union
      select storefront.owner_id from public.storefronts as storefront
      union
      select grant_row.owner_id from public.promotional_plan_grants as grant_row
      union
      select administrator.user_id from public.platform_admins as administrator
    ) as owners
    where owner_id is not null
    order by owner_id
  loop
    perform private.nz_reconcile_owner_entitlements(v_owner);
  end loop;
end
$initial_entitlement_reconciliation$;
