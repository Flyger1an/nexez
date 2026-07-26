-- Seller growth campaign: durable Free fallback, time-bounded Launch grants,
-- and two email-bound referral passes per qualified business.
--
-- Security posture:
--   * Stripe subscriptions remain the source of paid billing truth.
--   * Promotional access lives in a separate, append-audited entitlement ledger.
--   * Every new public-schema table has RLS enabled and browser grants revoked.
--   * Only service-role server routes can create, claim, revoke, or expire grants.
--   * Effective-plan SQL takes the highest of paid subscription and live grant.

-- Free is once again a first-class durable billing state. The original billing
-- table predates that tier and rejects plan_id='free', so widen the existing
-- constraint before any onboarding route attempts to seed a Free account.
alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_plan_id_check;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_plan_id_check
  check (
    plan_id is null
    or plan_id in ('free', 'launch', 'pro', 'scale', 'enterprise')
  );

create table if not exists public.seller_growth_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_key text not null unique,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'ended')),
  grant_plan_id text not null default 'launch'
    check (grant_plan_id in ('launch', 'pro', 'scale', 'enterprise')),
  grant_duration_days integer not null default 180
    check (grant_duration_days between 1 and 1095),
  invite_slots integer not null default 2
    check (invite_slots between 0 and 10),
  invite_expires_days integer not null default 14
    check (invite_expires_days between 1 and 90),
  max_grants integer not null default 1000
    check (max_grants > 0),
  starts_at timestamptz not null default now(),
  signup_closes_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (signup_closes_at is null or signup_closes_at > starts_at)
);

create table if not exists public.promotional_plan_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.seller_growth_campaigns(id) on delete restrict,
  plan_id text not null
    check (plan_id in ('launch', 'pro', 'scale', 'enterprise')),
  source text not null
    check (source in ('welcome', 'referral', 'admin')),
  status text not null default 'active'
    check (status in ('active', 'expired', 'revoked', 'superseded')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  fallback_page_id uuid references public.pages(id) on delete set null,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (owner_id, campaign_id)
);

create table if not exists public.seller_growth_invites (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.seller_growth_campaigns(id) on delete restrict,
  inviter_owner_id uuid not null references auth.users(id) on delete cascade,
  inviter_business_name text not null,
  invitee_email text not null,
  token_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'qualified', 'expired', 'revoked')),
  expires_at timestamptz not null,
  accepted_by_owner_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  qualified_at timestamptz,
  invitee_grant_id uuid references public.promotional_plan_grants(id) on delete set null,
  delivery_count integer not null default 0 check (delivery_count >= 0),
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (invitee_email = lower(btrim(invitee_email))),
  unique (campaign_id, invitee_email)
);

alter table public.promotional_plan_grants
  add column if not exists source_invite_id uuid
  references public.seller_growth_invites(id) on delete set null;

create table if not exists public.seller_growth_business_claims (
  campaign_id uuid not null references public.seller_growth_campaigns(id) on delete cascade,
  grant_id uuid not null references public.promotional_plan_grants(id) on delete cascade,
  identity_key text not null,
  created_at timestamptz not null default now(),
  primary key (campaign_id, identity_key)
);

create table if not exists public.seller_growth_events (
  id bigint generated always as identity primary key,
  campaign_id uuid references public.seller_growth_campaigns(id) on delete set null,
  owner_id uuid references auth.users(id) on delete set null,
  invite_id uuid references public.seller_growth_invites(id) on delete set null,
  grant_id uuid references public.promotional_plan_grants(id) on delete set null,
  event_type text not null
    check (event_type in (
      'invite_created', 'invite_resent', 'invite_claimed', 'invite_qualified',
      'invite_revoked', 'invite_expired', 'grant_issued', 'grant_expired',
      'grant_revoked', 'fallback_applied'
    )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.promotional_grant_notices (
  grant_id uuid not null references public.promotional_plan_grants(id) on delete cascade,
  days_before integer not null check (days_before in (30, 14, 7, 1)),
  sent_at timestamptz not null default now(),
  primary key (grant_id, days_before)
);

create index if not exists promotional_plan_grants_owner_active_idx
  on public.promotional_plan_grants (owner_id, ends_at desc)
  where status = 'active';

create index if not exists seller_growth_invites_inviter_idx
  on public.seller_growth_invites (inviter_owner_id, campaign_id, created_at desc);

create index if not exists seller_growth_invites_acceptor_idx
  on public.seller_growth_invites (accepted_by_owner_id, campaign_id)
  where accepted_by_owner_id is not null;

create unique index if not exists seller_growth_invites_one_claim_per_owner_idx
  on public.seller_growth_invites (campaign_id, accepted_by_owner_id)
  where accepted_by_owner_id is not null;

create index if not exists seller_growth_events_owner_idx
  on public.seller_growth_events (owner_id, created_at desc);

alter table public.seller_growth_campaigns enable row level security;
alter table public.promotional_plan_grants enable row level security;
alter table public.seller_growth_invites enable row level security;
alter table public.seller_growth_business_claims enable row level security;
alter table public.seller_growth_events enable row level security;
alter table public.promotional_grant_notices enable row level security;

-- These ledgers are intentionally not browser-readable. Owner-safe DTOs are
-- returned by authenticated server routes after stripping tokens and audit data.
revoke all on public.seller_growth_campaigns from anon, authenticated;
revoke all on public.promotional_plan_grants from anon, authenticated;
revoke all on public.seller_growth_invites from anon, authenticated;
revoke all on public.seller_growth_business_claims from anon, authenticated;
revoke all on public.seller_growth_events from anon, authenticated;
revoke all on public.promotional_grant_notices from anon, authenticated;

grant select, insert, update, delete on public.seller_growth_campaigns to service_role;
grant select, insert, update, delete on public.promotional_plan_grants to service_role;
grant select, insert, update, delete on public.seller_growth_invites to service_role;
grant select, insert, update, delete on public.seller_growth_business_claims to service_role;
grant select, insert, update, delete on public.seller_growth_events to service_role;
grant select, insert, update, delete on public.promotional_grant_notices to service_role;
grant usage, select on sequence public.seller_growth_events_id_seq to service_role;

-- The effective-plan resolver runs with either an owner session or service role.
-- Owners may read only their own non-secret grant rows; every mutation stays server-only.
grant select on public.promotional_plan_grants to authenticated;
drop policy if exists "owners read own promotional grants" on public.promotional_plan_grants;
create policy "owners read own promotional grants"
  on public.promotional_plan_grants
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create or replace function private.nz_touch_seller_growth_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.nz_touch_seller_growth_updated_at()
  from public, anon, authenticated;

drop trigger if exists trg_seller_growth_campaigns_updated_at on public.seller_growth_campaigns;
create trigger trg_seller_growth_campaigns_updated_at
  before update on public.seller_growth_campaigns
  for each row execute function private.nz_touch_seller_growth_updated_at();

drop trigger if exists trg_promotional_plan_grants_updated_at on public.promotional_plan_grants;
create trigger trg_promotional_plan_grants_updated_at
  before update on public.promotional_plan_grants
  for each row execute function private.nz_touch_seller_growth_updated_at();

drop trigger if exists trg_seller_growth_invites_updated_at on public.seller_growth_invites;
create trigger trg_seller_growth_invites_updated_at
  before update on public.seller_growth_invites
  for each row execute function private.nz_touch_seller_growth_updated_at();

-- One bounded launch campaign. Operations can pause or end it with one row update;
-- grants already issued retain their original end date.
insert into public.seller_growth_campaigns (
  campaign_key,
  name,
  status,
  grant_plan_id,
  grant_duration_days,
  invite_slots,
  invite_expires_days,
  max_grants
)
values (
  'launch-six-month-2026',
  'Six months of Launch',
  'active',
  'launch',
  180,
  2,
  14,
  1000
)
on conflict (campaign_key) do nothing;

-- Keep every SQL gate in lockstep with lib/billing.ts.
create or replace function private.nz_plan_rank(p_plan text)
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_plan
    when 'launch' then 1
    when 'pro' then 2
    when 'scale' then 3
    when 'enterprise' then 4
    else 0
  end;
$$;
revoke all on function private.nz_plan_rank(text) from public, anon, authenticated;

create or replace function public.owner_plan_rank(p_owner uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select case
    when p_owner is null then 0
    when exists (
      select 1 from public.platform_admins a where a.user_id = p_owner
    ) then 4
    else greatest(
      coalesce((
        select case
          when (
            s.status in ('active', 'past_due', 'unpaid')
            or (
              s.status = 'trialing'
              and (s.trial_ends_at is null or s.trial_ends_at >= now())
            )
          ) then private.nz_plan_rank(s.plan_id)
          else 0
        end
        from public.billing_subscriptions s
        where s.owner_id = p_owner
      ), 0),
      coalesce((
        select max(private.nz_plan_rank(g.plan_id))
        from public.promotional_plan_grants g
        where g.owner_id = p_owner
          and g.status = 'active'
          and g.starts_at <= now()
          and g.ends_at > now()
      ), 0)
    )
  end;
$$;
revoke all on function public.owner_plan_rank(uuid) from public, anon, authenticated;

create or replace function public.plan_published_page_limit(p_owner uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select case public.owner_plan_rank(p_owner)
    when 1 then 3
    when 2 then 25
    when 3 then 100
    when 4 then 2147483647
    else 1
  end;
$$;
revoke all on function public.plan_published_page_limit(uuid)
  from public, anon, authenticated;

create or replace function public.owner_team_seat_limit(p_owner uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select case public.owner_plan_rank(p_owner)
    when 2 then 3
    when 3 then 10
    when 4 then 2147483647
    else 0
  end;
$$;
revoke all on function public.owner_team_seat_limit(uuid)
  from public, anon, authenticated;

-- A billing lapse now falls back to Free instead of taking every public listing
-- offline. Administrative suspensions should use a dedicated moderation control,
-- not an overloaded Stripe lifecycle status.
create or replace function private.nz_owner_is_paused(p_owner uuid)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select false;
$$;
revoke all on function private.nz_owner_is_paused(uuid)
  from public, anon, authenticated;

update public.pages_public set serving = true where serving is distinct from true;

-- Public projection keeps custom-domain configuration private while Free is active.
-- The base page retains the domain and proof so a later paid/granted plan restores it
-- without reconfiguration.
create or replace function private.nz_mask_public_custom_domain_by_plan()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_owner uuid;
begin
  select p.owner_id into v_owner
  from public.pages p
  where p.id = new.id;

  if public.owner_plan_rank(v_owner) < 1 then
    new.custom_domain := null;
    new.custom_domain_verified := null;
    new.domain_path := '/';
  end if;

  return new;
end;
$$;
revoke all on function private.nz_mask_public_custom_domain_by_plan()
  from public, anon, authenticated;

drop trigger if exists trg_mask_public_custom_domain_by_plan on public.pages_public;
create trigger trg_mask_public_custom_domain_by_plan
  before insert or update of custom_domain, custom_domain_verified, domain_path
  on public.pages_public
  for each row execute function private.nz_mask_public_custom_domain_by_plan();

create or replace function private.nz_resync_owner_public_entitlements(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_custom_domain_enabled boolean;
begin
  if p_owner is null then
    return;
  end if;

  v_custom_domain_enabled := public.owner_plan_rank(p_owner) >= 1;

  update public.pages_public pp
  set
    serving = true,
    custom_domain = case when v_custom_domain_enabled then p.custom_domain else null end,
    custom_domain_verified = case
      when v_custom_domain_enabled then p.custom_domain_verified
      else null
    end,
    domain_path = case when v_custom_domain_enabled then p.domain_path else '/' end
  from public.pages p
  where p.id = pp.id
    and p.owner_id = p_owner;
end;
$$;
revoke all on function private.nz_resync_owner_public_entitlements(uuid)
  from public, anon, authenticated;

-- Reconcile the durable Free fallback at the same database chokepoint that
-- changes entitlements. This covers promotional expiry, paid-trial expiry, and
-- a paid subscription ending after a promotion has already expired. Drafts and
-- excess listings are preserved; they are only unpublished.
create or replace function private.nz_reconcile_owner_free_fallback(p_owner uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_limit integer;
  v_fallback uuid;
  v_updated integer := 0;
begin
  if p_owner is null or public.owner_plan_rank(p_owner) > 0 then
    return 0;
  end if;

  select greatest(
    1,
    coalesce((
      select g.baseline
      from public.published_page_grandfather g
      where g.owner_id = p_owner
    ), 0)
  )
  into v_limit;

  -- Prefer the owner's explicit campaign fallback, even when that grant ended
  -- before a later paid subscription. Otherwise keep the oldest published page.
  select g.fallback_page_id
  into v_fallback
  from public.promotional_plan_grants g
  join public.pages p
    on p.id = g.fallback_page_id
   and p.owner_id = p_owner
   and p.is_published is true
  where g.owner_id = p_owner
    and g.fallback_page_id is not null
  order by g.created_at desc
  limit 1;

  with keepers as (
    select p.id
    from public.pages p
    where p.owner_id = p_owner
      and p.is_published is true
    order by
      case when p.id = v_fallback then 0 else 1 end,
      p.created_at asc,
      p.id asc
    limit v_limit
  )
  update public.pages p
  set is_published = false
  where p.owner_id = p_owner
    and p.is_published is true
    and not exists (select 1 from keepers k where k.id = p.id);

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;
revoke all on function private.nz_reconcile_owner_free_fallback(uuid)
  from public, anon, authenticated;

-- Collect every server-verifiable identity available for a business. A campaign
-- claim is unique across all of them, which prevents duplicate grants through a
-- second account using the same shop, payout account, or verified web property.
create or replace function private.nz_seller_growth_identity_keys(p_owner uuid)
returns text[]
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce(array_agg(distinct identity_key order by identity_key), array[]::text[])
  from (
    select 'shopify:' || lower(si.shop_domain) as identity_key
    from public.shopify_installs si
    where si.owner_id = p_owner
      and si.uninstalled_at is null

    union all

    select 'stripe:' || lower(s.stripe_connect_account_id)
    from public.billing_subscriptions s
    where s.owner_id = p_owner
      and s.stripe_connect_charges_enabled is true
      and s.stripe_connect_account_id is not null

    union all

    select 'domain:' || lower(btrim(p.custom_domain))
    from public.pages p
    where p.owner_id = p_owner
      and p.is_published is true
      and p.custom_domain_verified is not null
      and nullif(btrim(p.custom_domain), '') is not null

    union all

    select 'website:' || regexp_replace(
      regexp_replace(
        regexp_replace(lower(btrim(p.website_url)), '^https?://', ''),
        '^www\.',
        ''
      ),
      '[/:?#].*$',
      ''
    )
    from public.pages p
    where p.owner_id = p_owner
      and p.is_published is true
      and p.website_verified_at is not null
      and nullif(btrim(p.website_url), '') is not null
  ) identities
  where nullif(identity_key, '') is not null;
$$;
revoke all on function private.nz_seller_growth_identity_keys(uuid)
  from public, anon, authenticated;

-- Issue at most one grant for this owner/campaign. This function is called only
-- from trusted database triggers. It never blocks publishing when qualification
-- fails, a campaign is full, or another account already claimed the business.
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

  if v_invite.id is null and not v_is_new_account then
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

  -- The campaign row lock serializes cap and business-claim checks.
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
    case when v_invite.id is null then 'welcome' else 'referral' end,
    v_invite.id,
    now(),
    now() + make_interval(days => v_campaign.grant_duration_days),
    jsonb_build_object('campaign_key', v_campaign.campaign_key)
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
      'source', case when v_invite.id is null then 'welcome' else 'referral' end
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
      event_type
    )
    values (
      v_campaign.id,
      p_owner,
      v_invite.id,
      v_grant_id,
      'invite_qualified'
    );
  end if;

  return v_grant_id;
exception
  when unique_violation then
    -- Promotion races must never fail the seller's page/integration write.
    return null;
end;
$$;
revoke all on function private.nz_maybe_issue_seller_growth_grant(uuid)
  from public, anon, authenticated;

-- Service routes call this after an authenticated owner opens the dashboard.
-- That catches the one qualification edge the row triggers cannot observe:
-- email confirmation happening after a page and verified business identity
-- already exist. The Data API can expose only this narrow wrapper; the underlying
-- qualification function remains private.
create or replace function public.refresh_seller_growth_grant(p_owner uuid)
returns uuid
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.nz_maybe_issue_seller_growth_grant(p_owner);
$$;
revoke all on function public.refresh_seller_growth_grant(uuid)
  from public, anon, authenticated;
grant execute on function public.refresh_seller_growth_grant(uuid)
  to service_role;

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

  if tg_op = 'UPDATE' then
    -- Claims keep the invitation's existing slot, but they still require a live
    -- campaign, an unexpired link, and the exact verified invitee email.
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

    -- Expired -> pending renewals consume a slot. Other transitions (claimed ->
    -- qualified, pending -> revoked, and cron expiry) release or retain the
    -- existing slot without recounting it.
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

  -- A pass can be reassigned after expiry/revocation, but the campaign cannot be
  -- used as an unlimited outreach channel. Five recipient attempts per usable
  -- slot leaves room for typos and non-responsive addresses while bounding abuse.
  if tg_op = 'INSERT' then
    select count(*) into v_count
    from public.seller_growth_invites i
    where i.inviter_owner_id = new.inviter_owner_id
      and i.campaign_id = new.campaign_id;

    if v_count >= v_campaign.invite_slots * 5 then
      raise exception 'This account has reached the campaign invitation limit.'
        using errcode = 'check_violation';
    end if;
  end if;

  select count(*) into v_count
  from public.seller_growth_invites i
  where i.inviter_owner_id = new.inviter_owner_id
    and i.campaign_id = new.campaign_id
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

drop trigger if exists trg_enforce_seller_growth_invite on public.seller_growth_invites;
create trigger trg_enforce_seller_growth_invite
  before insert or update of status on public.seller_growth_invites
  for each row execute function private.nz_enforce_seller_growth_invite();

create or replace function private.nz_growth_page_qualification_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.owner_id is not null and new.is_published is true then
    perform private.nz_maybe_issue_seller_growth_grant(new.owner_id);
  end if;
  return new;
end;
$$;
revoke all on function private.nz_growth_page_qualification_trigger()
  from public, anon, authenticated;

drop trigger if exists trg_growth_qualification_on_page on public.pages;
create trigger trg_growth_qualification_on_page
  after insert or update of is_published, website_verified_at, custom_domain_verified
  on public.pages
  for each row execute function private.nz_growth_page_qualification_trigger();

create or replace function private.nz_growth_shopify_qualification_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.owner_id is not null and new.uninstalled_at is null then
    perform private.nz_maybe_issue_seller_growth_grant(new.owner_id);
  end if;
  return new;
end;
$$;
revoke all on function private.nz_growth_shopify_qualification_trigger()
  from public, anon, authenticated;

drop trigger if exists trg_growth_qualification_on_shopify on public.shopify_installs;
create trigger trg_growth_qualification_on_shopify
  after insert or update of owner_id, uninstalled_at
  on public.shopify_installs
  for each row execute function private.nz_growth_shopify_qualification_trigger();

create or replace function private.nz_growth_invite_claim_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'claimed' and new.accepted_by_owner_id is not null then
      perform private.nz_maybe_issue_seller_growth_grant(new.accepted_by_owner_id);
    end if;
  elsif new.status = 'claimed'
     and new.accepted_by_owner_id is not null
     and (
       old.status is distinct from new.status
       or old.accepted_by_owner_id is distinct from new.accepted_by_owner_id
     ) then
    perform private.nz_maybe_issue_seller_growth_grant(new.accepted_by_owner_id);
  end if;
  return new;
end;
$$;
revoke all on function private.nz_growth_invite_claim_trigger()
  from public, anon, authenticated;

drop trigger if exists trg_growth_qualification_on_invite_claim on public.seller_growth_invites;
create trigger trg_growth_qualification_on_invite_claim
  after insert or update of status, accepted_by_owner_id
  on public.seller_growth_invites
  for each row execute function private.nz_growth_invite_claim_trigger();

create or replace function private.nz_growth_billing_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.nz_resync_owner_public_entitlements(new.owner_id);
  -- Re-evaluate on every billing lifecycle change. Active paid/trialing rows are
  -- rejected inside the issuer; when one expires, a newly eligible Free fallback
  -- can receive its Launch grant immediately without waiting for a dashboard load.
  perform private.nz_maybe_issue_seller_growth_grant(new.owner_id);
  perform private.nz_reconcile_owner_free_fallback(new.owner_id);

  return new;
end;
$$;
revoke all on function private.nz_growth_billing_trigger()
  from public, anon, authenticated;

drop trigger if exists trg_growth_and_entitlements_on_billing on public.billing_subscriptions;
create trigger trg_growth_and_entitlements_on_billing
  after insert or update of
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
set search_path = pg_catalog, public, private
as $$
declare
  v_owner uuid;
begin
  if tg_op = 'DELETE' then
    v_owner := old.owner_id;
  else
    v_owner := new.owner_id;
  end if;

  perform private.nz_resync_owner_public_entitlements(v_owner);
  perform private.nz_reconcile_owner_free_fallback(v_owner);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function private.nz_growth_grant_entitlement_trigger()
  from public, anon, authenticated;

drop trigger if exists trg_growth_entitlements_on_grant on public.promotional_plan_grants;
create trigger trg_growth_entitlements_on_grant
  after insert or delete or update of status, starts_at, ends_at, plan_id
  on public.promotional_plan_grants
  for each row execute function private.nz_growth_grant_entitlement_trigger();

-- Apply the new Free fallback and custom-domain masking to existing projections.
do $$
declare
  v_owner uuid;
begin
  for v_owner in
    select distinct p.owner_id
    from public.pages p
    where p.owner_id is not null
  loop
    perform private.nz_resync_owner_public_entitlements(v_owner);
    perform private.nz_reconcile_owner_free_fallback(v_owner);
  end loop;
end;
$$;

comment on table public.promotional_plan_grants is
  'Server-issued, time-bounded plan entitlements. Separate from Stripe subscription truth.';
comment on table public.seller_growth_invites is
  'Email-bound seller acquisition invitations. Never grants workspace collaboration access.';
comment on table public.seller_growth_business_claims is
  'Campaign-scoped verified business identities used to prevent duplicate promotional grants.';
