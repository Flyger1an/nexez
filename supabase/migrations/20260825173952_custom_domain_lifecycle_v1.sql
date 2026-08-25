-- Custom-domain lifecycle v1
--
-- The previous reclaim trigger immediately superseded every unverified claim.
-- That kept unverified hosts off the public router, but it gave a merchant no
-- protected DNS setup window and rewrote another merchant's page rows inside
-- the claimant's transaction. This migration replaces that behavior with one
-- canonical, domain-wide claim record:
--
--   * a new unverified claim is reserved for 14 days;
--   * the same owner may use that domain on several listing paths without
--     extending the reservation;
--   * an expired unverified claim may be reclaimed atomically;
--   * a verified claim never expires and always blocks another owner;
--   * stale page rows remain unverified and cannot detach or verify a claim
--     now owned by somebody else;
--   * removing the last page on the canonical owner releases the claim.
--
-- Claim state is private. Trusted server routes receive only the status for a
-- specific page through a service-role-only function.

create schema if not exists private;

create table if not exists private.custom_domain_claims (
  domain text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  claimed_at timestamptz not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  constraint custom_domain_claims_normalized_domain_check
    check (domain = lower(btrim(domain)) and domain <> ''),
  constraint custom_domain_claims_expiry_check
    check (expires_at > claimed_at)
);

comment on table private.custom_domain_claims is
  'Canonical owner and protected setup window for each normalized custom domain.';
comment on column private.custom_domain_claims.expires_at is
  'Reclaim eligibility for an unverified claim. Verified claims never expire.';

alter table private.custom_domain_claims enable row level security;
revoke all on table private.custom_domain_claims from public, anon, authenticated, service_role;

create index if not exists custom_domain_claims_owner_idx
  on private.custom_domain_claims (owner_id);
create index if not exists custom_domain_claims_unverified_expiry_idx
  on private.custom_domain_claims (expires_at)
  where verified_at is null;

-- The old global (domain, path) key cannot coexist with an expired page row
-- retained for honest merchant history after the canonical claim is reclaimed.
-- Canonical ownership now lives in private.custom_domain_claims, while this key
-- continues to prevent one owner from mapping two pages to the same host path.
drop index if exists public.pages_custom_domain_path_key;
create unique index if not exists pages_owner_custom_domain_path_key
  on public.pages (owner_id, lower(btrim(custom_domain)), domain_path)
  where custom_domain is not null and btrim(custom_domain) <> '';

-- Existing verified ownership is already authoritative. Existing unverified
-- claims receive a full setup window from rollout so this migration never
-- converts a deployment into an immediate, surprising loss of reservation.
do $$
begin
  if exists (
    select 1
    from public.pages p
    where nullif(btrim(p.custom_domain), '') is not null
    group by lower(btrim(p.custom_domain))
    having count(distinct p.owner_id) > 1
  ) then
    raise exception 'Cannot backfill custom-domain claims while one domain has multiple owners.';
  end if;
end;
$$;

insert into private.custom_domain_claims (
  domain,
  owner_id,
  claimed_at,
  expires_at,
  verified_at,
  updated_at
)
select
  lower(btrim(p.custom_domain)) as domain,
  p.owner_id,
  statement_timestamp(),
  statement_timestamp() + interval '14 days',
  max(p.custom_domain_verified),
  statement_timestamp()
from public.pages p
where nullif(btrim(p.custom_domain), '') is not null
  and p.owner_id is not null
group by lower(btrim(p.custom_domain)), p.owner_id
on conflict (domain) do nothing;

-- Replace the legacy public trigger function. Trigger functions do not need to
-- be callable through the Data API, so the replacement lives in private and has
-- no role grants.
drop trigger if exists trg_custom_domain_single_owner on public.pages;
drop function if exists public.nz_enforce_custom_domain_single_owner();

create or replace function private.nz_enforce_custom_domain_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_jwt_role text := '';
  v_domain text := lower(nullif(btrim(new.custom_domain), ''));
  v_old_domain text;
  v_now timestamptz := statement_timestamp();
  v_claim private.custom_domain_claims%rowtype;
begin
  if v_claims is not null then
    begin
      v_jwt_role := coalesce(v_claims::json ->> 'role', '');
    exception when others then
      v_jwt_role := '';
    end;
  end if;

  if tg_op = 'UPDATE' then
    v_old_domain := lower(nullif(btrim(old.custom_domain), ''));

    -- A DNS proof belongs to one exact hostname.
    if v_domain is distinct from v_old_domain then
      new.custom_domain_verified := null;
    elsif new.custom_domain_verified is distinct from old.custom_domain_verified
      and new.custom_domain_verified is not null
      and v_jwt_role = 'authenticated' then
      raise exception 'Custom-domain verification must be completed through the DNS verification flow.'
        using errcode = 'insufficient_privilege';
    end if;
  elsif new.custom_domain_verified is not null and v_jwt_role = 'authenticated' then
    new.custom_domain_verified := null;
  end if;

  if v_domain is null then
    new.custom_domain := null;
    new.custom_domain_verified := null;
    return new;
  end if;

  if new.owner_id is null then
    raise exception 'A custom domain requires a listing owner.'
      using errcode = 'not_null_violation';
  end if;

  new.custom_domain := v_domain;

  -- A retained stale page can outlive the canonical claimant who later
  -- releases the domain. Reclaiming that newly available domain is a fresh
  -- allocation, so a below-Launch owner cannot regain it through a no-op page
  -- update that the earlier plan trigger correctly treats as retained config.
  if not exists (
    select 1
    from private.custom_domain_claims c
    where c.domain = v_domain
  ) and not private.nz_owner_feature_allowed(new.owner_id, 'customDomain') then
    raise exception 'Custom domains are a Launch plan feature.'
      using errcode = 'check_violation';
  end if;

  insert into private.custom_domain_claims (
    domain,
    owner_id,
    claimed_at,
    expires_at,
    verified_at,
    updated_at
  ) values (
    v_domain,
    new.owner_id,
    v_now,
    v_now + interval '14 days',
    null,
    v_now
  )
  on conflict (domain) do nothing;

  select c.*
  into strict v_claim
  from private.custom_domain_claims c
  where c.domain = v_domain
  for update;

  if v_claim.owner_id is distinct from new.owner_id then
    if v_claim.verified_at is not null then
      raise exception 'This custom domain is already connected to another Nexez account.'
        using errcode = 'unique_violation';
    end if;

    if v_claim.expires_at > v_now then
      raise exception 'This custom domain is temporarily reserved while another Nexez account finishes setup.'
        using errcode = 'unique_violation';
    end if;

    update private.custom_domain_claims
    set owner_id = new.owner_id,
        claimed_at = v_now,
        expires_at = v_now + interval '14 days',
        verified_at = null,
        updated_at = v_now
    where domain = v_domain;

    v_claim.owner_id := new.owner_id;
    v_claim.claimed_at := v_now;
    v_claim.expires_at := v_now + interval '14 days';
    v_claim.verified_at := null;
  end if;

  if new.custom_domain_verified is not null then
    if v_claim.owner_id is distinct from new.owner_id then
      raise exception 'This listing no longer owns the custom-domain claim.'
        using errcode = 'unique_violation';
    end if;

    update private.custom_domain_claims
    set verified_at = coalesce(verified_at, new.custom_domain_verified),
        updated_at = v_now
    where domain = v_domain
      and owner_id = new.owner_id;
  end if;

  return new;
end;
$$;

revoke all on function private.nz_enforce_custom_domain_claim()
  from public, anon, authenticated, service_role;

create trigger trg_custom_domain_single_owner
  before insert or update of owner_id, custom_domain, custom_domain_verified
  on public.pages
  for each row execute function private.nz_enforce_custom_domain_claim();

-- Reconcile release and proof removal after the page write is visible. The
-- claim is deleted only when the canonical owner has no page left on the
-- domain. Clearing the last verified page starts a fresh protected window for
-- the retained, now-unverified claim.
create or replace function private.nz_reconcile_custom_domain_claim_after_page_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_domain text;
  v_new_domain text;
  v_now timestamptz := statement_timestamp();
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_domain := lower(nullif(btrim(old.custom_domain), ''));
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_domain := lower(nullif(btrim(new.custom_domain), ''));
  end if;

  if v_old_domain is not null
     and (tg_op = 'DELETE' or v_old_domain is distinct from v_new_domain) then
    if not exists (
      select 1
      from public.pages p
      where p.owner_id = old.owner_id
        and lower(nullif(btrim(p.custom_domain), '')) = v_old_domain
    ) then
      delete from private.custom_domain_claims c
      where c.domain = v_old_domain
        and c.owner_id = old.owner_id;
    elsif not exists (
      select 1
      from public.pages p
      where p.owner_id = old.owner_id
        and lower(nullif(btrim(p.custom_domain), '')) = v_old_domain
        and p.custom_domain_verified is not null
    ) then
      update private.custom_domain_claims c
      set verified_at = null,
          claimed_at = case when c.verified_at is not null then v_now else c.claimed_at end,
          expires_at = case when c.verified_at is not null then v_now + interval '14 days' else c.expires_at end,
          updated_at = case when c.verified_at is not null then v_now else c.updated_at end
      where c.domain = v_old_domain
        and c.owner_id = old.owner_id
        and c.verified_at is not null;
    end if;
  end if;

  if v_new_domain is not null
     and (tg_op = 'INSERT'
       or v_old_domain is distinct from v_new_domain
       or new.custom_domain_verified is distinct from old.custom_domain_verified) then
    if not exists (
      select 1
      from public.pages p
      where p.owner_id = new.owner_id
        and lower(nullif(btrim(p.custom_domain), '')) = v_new_domain
        and p.custom_domain_verified is not null
    ) then
      update private.custom_domain_claims c
      set verified_at = null,
          claimed_at = case when c.verified_at is not null then v_now else c.claimed_at end,
          expires_at = case when c.verified_at is not null then v_now + interval '14 days' else c.expires_at end,
          updated_at = case when c.verified_at is not null then v_now else c.updated_at end
      where c.domain = v_new_domain
        and c.owner_id = new.owner_id
        and c.verified_at is not null;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.nz_reconcile_custom_domain_claim_after_page_write()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_custom_domain_claim_reconcile on public.pages;
create trigger trg_custom_domain_claim_reconcile
  after insert or delete or update
  on public.pages
  for each row execute function private.nz_reconcile_custom_domain_claim_after_page_write();

create or replace function public.nz_custom_domain_claim_status(p_page_id uuid)
returns table (
  domain text,
  claimed_at timestamptz,
  expires_at timestamptz,
  verified_at timestamptz,
  owned boolean,
  available boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    lower(nullif(btrim(p.custom_domain), '')),
    c.claimed_at,
    c.expires_at,
    c.verified_at,
    c.owner_id is not distinct from p.owner_id,
    c.domain is null
  from public.pages p
  left join private.custom_domain_claims c
    on c.domain = lower(nullif(btrim(p.custom_domain), ''))
  where p.id = p_page_id;
$$;

revoke all on function public.nz_custom_domain_claim_status(uuid)
  from public, anon, authenticated;
grant execute on function public.nz_custom_domain_claim_status(uuid)
  to service_role;

comment on function public.nz_custom_domain_claim_status(uuid) is
  'Service-role-only claim status for one page. Does not expose another owner identity.';
