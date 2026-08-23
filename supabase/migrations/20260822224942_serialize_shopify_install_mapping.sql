-- Installed Shopify imports perform network I/O outside Postgres. A durable
-- mapping generation plus a short-lived transition lease makes every eventual
-- catalog write prove it still targets the exact shop -> owner -> listing map.
-- Existing application lifecycle code retains responsibility for credential
-- revocation, exact-source cleanup, and final mapping writes.

alter table public.shopify_installs
  add column if not exists mapping_generation bigint not null default 1
    check (mapping_generation > 0),
  add column if not exists catalog_generation bigint
    check (catalog_generation is null or catalog_generation > 0),
  add column if not exists mapping_transition_token uuid,
  add column if not exists mapping_transition_kind text
    check (mapping_transition_kind is null or mapping_transition_kind in ('relink', 'owner_transfer', 'uninstall', 'redact')),
  add column if not exists mapping_transition_started_at timestamptz,
  add column if not exists mapping_transition_owner_id uuid,
  add column if not exists mapping_transition_page_id uuid;

comment on column public.shopify_installs.mapping_generation is
  'Monotonic shop-to-owner-to-page generation. Installed catalog commits must match it atomically.';
comment on column public.shopify_installs.catalog_generation is
  'Generation stamped on the currently imported installed-app offers; null identifies legacy untagged catalog data.';
comment on column public.shopify_installs.mapping_transition_token is
  'Service-only lease that blocks installed catalog commits while lifecycle code changes a mapping.';

create index if not exists shopify_installs_mapping_transition_page_idx
  on public.shopify_installs (mapping_transition_page_id)
  where mapping_transition_page_id is not null;

create or replace function public.nz_begin_shopify_mapping_change(
  p_shop text,
  p_lease uuid,
  p_kind text,
  p_target_owner_id uuid,
  p_target_page_id uuid,
  p_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_install public.shopify_installs%rowtype;
  v_page_owner uuid;
  v_now timestamptz := coalesce(p_at, statement_timestamp());
begin
  if p_lease is null or p_kind not in ('relink', 'owner_transfer', 'uninstall', 'redact') then
    raise exception 'Invalid Shopify mapping transition.' using errcode = '22023';
  end if;

  select install.* into v_install
  from public.shopify_installs as install
  where install.shop_domain = p_shop
  for update;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;
  if v_install.mapping_transition_token = p_lease then
    return jsonb_build_object('status', 'begun', 'generation', v_install.mapping_generation,
      'catalogGeneration', v_install.catalog_generation,
      'ownerId', v_install.owner_id, 'pageId', v_install.page_id);
  end if;
  if v_install.mapping_transition_token is not null then
    -- Redaction is terminal and retains priority until its row is deleted; a
    -- reconnect must never resurrect a shop while mandatory deletion is pending.
    if v_install.mapping_transition_kind = 'redact' and p_kind <> 'redact' then
      return jsonb_build_object('status', 'busy');
    end if;
    -- Uninstall/redact may preempt an active relink or owner transfer
    -- immediately. They take the same row lock and advance the generation, so
    -- the old token cannot finish. Generation-scoped cleanup fences any old
    -- in-flight page update. A reinstall may likewise adopt a revoked uninstall
    -- immediately, while ordinary mapping changes retain the 10-minute lease.
    if p_kind not in ('uninstall', 'redact')
       and not (
         p_kind = 'owner_transfer'
         and v_install.uninstalled_at is not null
         and v_install.mapping_transition_kind = 'uninstall'
       )
       and v_install.mapping_transition_started_at > v_now - interval '10 minutes' then
      return jsonb_build_object('status', 'busy');
    end if;
  end if;

  if p_kind = 'relink' then
    if v_install.uninstalled_at is not null or p_target_owner_id is null or p_target_page_id is null then
      return jsonb_build_object('status', 'invalid');
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('shopify-page:' || p_target_page_id::text, 0)
    );
    select page.owner_id into v_page_owner from public.pages as page where page.id = p_target_page_id;
    if v_page_owner is null or v_page_owner is distinct from p_target_owner_id then
      return jsonb_build_object('status', 'owner_mismatch');
    end if;
    if exists (
      select 1 from public.shopify_installs as other
      where other.shop_domain <> p_shop
        and (
          (other.uninstalled_at is null and other.page_id = p_target_page_id)
          or (
            other.mapping_transition_page_id = p_target_page_id
            and other.mapping_transition_started_at > v_now - interval '10 minutes'
          )
        )
    ) then
      return jsonb_build_object('status', 'target_conflict');
    end if;
  elsif p_target_page_id is not null then
    raise exception 'Only a Shopify relink may reserve a target page.' using errcode = '22023';
  end if;

  update public.shopify_installs
  set
    mapping_generation = mapping_generation + 1,
    mapping_transition_token = p_lease,
    mapping_transition_kind = p_kind,
    mapping_transition_started_at = v_now,
    mapping_transition_owner_id = p_target_owner_id,
    mapping_transition_page_id = p_target_page_id,
    catalog_sync_pending_at = null,
    catalog_sync_attempted_at = null,
    catalog_sync_attempts = 0,
    catalog_sync_error = null,
    catalog_sync_topic = null,
    updated_at = v_now
  where shop_domain = p_shop
  returning * into v_install;

  return jsonb_build_object('status', 'begun', 'generation', v_install.mapping_generation,
    'catalogGeneration', v_install.catalog_generation,
    'ownerId', v_install.owner_id, 'pageId', v_install.page_id);
end;
$function$;

create or replace function public.nz_abort_shopify_mapping_change(
  p_shop text,
  p_lease uuid,
  p_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_changed boolean;
begin
  update public.shopify_installs
  set
    mapping_generation = mapping_generation + 1,
    mapping_transition_token = null,
    mapping_transition_kind = null,
    mapping_transition_started_at = null,
    mapping_transition_owner_id = null,
    mapping_transition_page_id = null,
    updated_at = coalesce(p_at, statement_timestamp())
  where shop_domain = p_shop and mapping_transition_token = p_lease;
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$function$;

revoke all on function public.nz_begin_shopify_mapping_change(text, uuid, text, uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.nz_abort_shopify_mapping_change(text, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.nz_begin_shopify_mapping_change(text, uuid, text, uuid, uuid, timestamptz)
  to service_role;
grant execute on function public.nz_abort_shopify_mapping_change(text, uuid, timestamptz)
  to service_role;

create or replace function public.nz_commit_shopify_catalog_sync(
  p_shop text,
  p_owner_id uuid,
  p_page_id uuid,
  p_mapping_generation bigint,
  p_expected_page_updated_at timestamptz,
  p_services jsonb,
  p_products jsonb,
  p_synced_at timestamptz,
  p_clear_catalog_sync_state boolean
)
returns text
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_install public.shopify_installs%rowtype;
  v_page_owner uuid;
  v_page_updated_at timestamptz;
begin
  if jsonb_typeof(coalesce(p_services, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_products, '[]'::jsonb)) <> 'array' then
    raise exception 'Shopify catalog payloads must be JSON arrays.' using errcode = '22023';
  end if;

  -- The lifecycle begin RPC takes this same row lock before bumping the
  -- generation. Therefore either this exact write commits first (and subsequent
  -- application cleanup removes it) or the lifecycle transition commits first
  -- and this write returns mapping_stale without touching a page.
  select install.* into v_install
  from public.shopify_installs as install
  where install.shop_domain = p_shop
  for update;
  if not found
     or v_install.uninstalled_at is not null
     or v_install.mapping_transition_token is not null
     or v_install.owner_id is distinct from p_owner_id
     or v_install.page_id is distinct from p_page_id
     or v_install.mapping_generation <> p_mapping_generation then
    return 'mapping_stale';
  end if;

  select page.owner_id, page.updated_at
  into v_page_owner, v_page_updated_at
  from public.pages as page
  where page.id = p_page_id
  for update;
  if not found or v_page_owner is distinct from p_owner_id then
    return 'mapping_stale';
  end if;
  if v_page_updated_at is distinct from p_expected_page_updated_at then
    return 'page_conflict';
  end if;

  update public.pages
  set services = coalesce(p_services, '[]'::jsonb), products = coalesce(p_products, '[]'::jsonb)
  where id = p_page_id;

  update public.shopify_installs
  set
    catalog_generation = p_mapping_generation,
    last_synced_at = coalesce(p_synced_at, statement_timestamp()),
    catalog_sync_pending_at = case when p_clear_catalog_sync_state then null else catalog_sync_pending_at end,
    catalog_sync_attempted_at = case when p_clear_catalog_sync_state then null else catalog_sync_attempted_at end,
    catalog_sync_attempts = case when p_clear_catalog_sync_state then 0 else catalog_sync_attempts end,
    catalog_sync_error = case when p_clear_catalog_sync_state then null else catalog_sync_error end,
    updated_at = coalesce(p_synced_at, statement_timestamp())
  where shop_domain = p_shop;
  return 'written';
end;
$function$;

comment on function public.nz_commit_shopify_catalog_sync(
  text, uuid, uuid, bigint, timestamptz, jsonb, jsonb, timestamptz, boolean
) is 'Service-only catalog commit guarded by the exact active Shopify mapping generation.';

revoke all on function public.nz_commit_shopify_catalog_sync(
  text, uuid, uuid, bigint, timestamptz, jsonb, jsonb, timestamptz, boolean
) from public, anon, authenticated;
grant execute on function public.nz_commit_shopify_catalog_sync(
  text, uuid, uuid, bigint, timestamptz, jsonb, jsonb, timestamptz, boolean
) to service_role;

revoke all on public.shopify_installs from public, anon, authenticated;
grant select, insert, update, delete on public.shopify_installs to service_role;
