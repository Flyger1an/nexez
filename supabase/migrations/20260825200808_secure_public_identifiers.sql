-- Public identifier security v1.
--
-- Public listing slugs and storefront handles share one claim registry. The
-- registry makes availability checks and writes atomic, keeps renamed listing
-- aliases redirectable, and prevents deleted or renamed identities from being
-- claimed by another account. Existing identifiers remain valid until changed,
-- which safely grandfathers the live one-character storefront handle.

create schema if not exists private;

create table if not exists private.public_identifier_claims (
  namespace text not null,
  identifier text not null,
  kind text not null,
  owner_id uuid,
  subject_id uuid,
  claimed_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (namespace, identifier),
  constraint public_identifier_claims_namespace_check
    check (namespace in ('page_slug', 'storefront_handle')),
  constraint public_identifier_claims_kind_check
    check (kind in ('system', 'current', 'alias', 'reserved')),
  constraint public_identifier_claims_subject_check
    check (
      (kind in ('current', 'alias') and subject_id is not null)
      or (kind in ('system', 'reserved') and subject_id is null)
    ),
  constraint public_identifier_claims_identifier_check
    check (identifier ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(identifier) between 1 and 63)
);

alter table private.public_identifier_claims enable row level security;
revoke all on table private.public_identifier_claims from public, anon, authenticated, service_role;

comment on table private.public_identifier_claims is
  'Authoritative claim registry for public listing slugs and storefront handles. Private to database functions.';

-- Keep this seed synchronized with RESERVED_PUBLIC_IDENTIFIERS in
-- lib/public-identifier.ts. A unit test fails when either side drifts.
with reserved(identifier) as (
  select unnest(array[
    'acp', 'agent-readiness', 'agents', 'api', 'auth', 'checkout', 'compare',
    'create', 'dashboard', 'design', 'developers', 'discovery', 'enterprise',
    'examples', 'growth-control-preview', 'how-it-works', 'integrations',
    'invite', 'leaderboard', 'learn', 'login', 'mcp', 'negotiate', 'nexxi',
    'onboard', 'orders', 'pricing', 'privacy', 'scan', 'security',
    'service-agreements', 'shopify', 'simulator', 'store', 'support', 'team',
    'terms', 'tools', 'ucp', 'use-cases', 'directory', 'marketplace',
    'competitors', 'blog', 'docs', 'admin', 'settings', 'account', 'billing',
    'help', 'status', 'app', 'www', 'assets', 'static', 'well-known', 'nexez',
    'nexez-ai', 'nexezai', 'official', 'verified', 'trust', 'payments', 'legal',
    'abuse', 'notifications', 'no-reply', 'noreply', 'postmaster'
  ]::text[])
), namespaces(namespace) as (
  values ('page_slug'::text), ('storefront_handle'::text)
)
insert into private.public_identifier_claims (namespace, identifier, kind)
select namespaces.namespace, reserved.identifier, 'system'
from namespaces
cross join reserved
on conflict (namespace, identifier) do nothing;

do $$
begin
  if exists (
    select 1
    from public.pages as page
    join private.public_identifier_claims as claim
      on claim.namespace = 'page_slug'
      and claim.identifier = lower(btrim(page.slug))
      and claim.kind = 'system'
  ) then
    raise exception 'An existing listing slug conflicts with a system reservation.';
  end if;
  if exists (
    select 1
    from public.storefronts as storefront
    join private.public_identifier_claims as claim
      on claim.namespace = 'storefront_handle'
      and claim.identifier = lower(btrim(storefront.handle))
      and claim.kind = 'system'
  ) then
    raise exception 'An existing storefront handle conflicts with a system reservation.';
  end if;
end;
$$;

-- Existing rows are authoritative and were audited before this migration. They
-- are registered before enforcement so short legacy names stay owned.
insert into private.public_identifier_claims (
  namespace,
  identifier,
  kind,
  owner_id,
  subject_id,
  claimed_at,
  updated_at
)
select
  'page_slug',
  lower(btrim(page.slug)),
  'current',
  page.owner_id,
  page.id,
  coalesce(page.created_at, statement_timestamp()),
  statement_timestamp()
from public.pages as page
where page.slug is not null
on conflict (namespace, identifier) do update
set kind = excluded.kind,
    owner_id = excluded.owner_id,
    subject_id = excluded.subject_id,
    updated_at = statement_timestamp()
where private.public_identifier_claims.kind <> 'system';

insert into private.public_identifier_claims (
  namespace,
  identifier,
  kind,
  owner_id,
  subject_id,
  claimed_at,
  updated_at
)
select
  'storefront_handle',
  lower(btrim(storefront.handle)),
  'current',
  storefront.owner_id,
  storefront.id,
  coalesce(storefront.created_at, statement_timestamp()),
  statement_timestamp()
from public.storefronts as storefront
on conflict (namespace, identifier) do update
set kind = excluded.kind,
    owner_id = excluded.owner_id,
    subject_id = excluded.subject_id,
    updated_at = statement_timestamp()
where private.public_identifier_claims.kind <> 'system';

create or replace function private.nz_public_identifier_error(p_identifier text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_identifier text := coalesce(p_identifier, '');
begin
  if char_length(v_identifier) < 5 then
    return 'too_short';
  end if;
  if char_length(v_identifier) > 63 then
    return 'too_long';
  end if;
  if v_identifier !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    return 'invalid_format';
  end if;
  if v_identifier like 'xn--%'
     or v_identifier like 'nexez-%'
     or v_identifier like '%-nexez' then
    return 'reserved';
  end if;
  return null;
end;
$$;

revoke all on function private.nz_public_identifier_error(text)
  from public, anon, authenticated, service_role;

create or replace function private.nz_claim_public_identifier(
  p_namespace text,
  p_identifier text,
  p_owner_id uuid,
  p_subject_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_error text;
  v_claim private.public_identifier_claims%rowtype;
  v_inserted integer := 0;
begin
  if p_namespace not in ('page_slug', 'storefront_handle') then
    raise exception 'Unknown public identifier namespace.' using errcode = '22023';
  end if;

  v_error := private.nz_public_identifier_error(p_identifier);
  if v_error is not null then
    raise exception 'public_identifier_%', v_error using errcode = '23514';
  end if;

  insert into private.public_identifier_claims (
    namespace,
    identifier,
    kind,
    owner_id,
    subject_id
  )
  values (p_namespace, p_identifier, 'current', p_owner_id, p_subject_id)
  on conflict (namespace, identifier) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    return;
  end if;

  select claim.*
  into strict v_claim
  from private.public_identifier_claims as claim
  where claim.namespace = p_namespace
    and claim.identifier = p_identifier
  for update;

  if v_claim.kind in ('current', 'alias')
     and v_claim.owner_id is not distinct from p_owner_id
     and v_claim.subject_id = p_subject_id then
    update private.public_identifier_claims
    set kind = 'current',
        updated_at = statement_timestamp()
    where namespace = p_namespace
      and identifier = p_identifier;
    return;
  end if;

  if v_claim.kind in ('system', 'reserved') then
    raise exception 'public_identifier_reserved' using errcode = '23505';
  end if;
  raise exception 'public_identifier_taken' using errcode = '23505';
end;
$$;

revoke all on function private.nz_claim_public_identifier(text, text, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.nz_enforce_page_slug_identifier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.slug is null then
    if new.is_published is true then
      raise exception 'public_identifier_required' using errcode = '23514';
    end if;

    if tg_op = 'UPDATE' and old.slug is not null then
      update private.public_identifier_claims
      set kind = 'reserved',
          subject_id = null,
          updated_at = statement_timestamp()
      where namespace = 'page_slug'
        and owner_id is not distinct from old.owner_id
        and subject_id = old.id;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug then
    return new;
  end if;

  perform private.nz_claim_public_identifier(
    'page_slug',
    new.slug,
    new.owner_id,
    new.id
  );

  if tg_op = 'UPDATE' then
    update private.public_identifier_claims
    set kind = 'alias',
        updated_at = statement_timestamp()
    where namespace = 'page_slug'
      and identifier = old.slug
      and owner_id is not distinct from old.owner_id
      and subject_id = old.id;
  end if;
  return new;
end;
$$;

revoke all on function private.nz_enforce_page_slug_identifier()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_01_enforce_page_slug_identifier on public.pages;
create trigger trg_01_enforce_page_slug_identifier
  before insert or update of slug, is_published on public.pages
  for each row execute function private.nz_enforce_page_slug_identifier();

create or replace function private.nz_reserve_page_identifiers_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.public_identifier_claims
  set kind = 'reserved',
      subject_id = null,
      updated_at = statement_timestamp()
  where namespace = 'page_slug'
    and subject_id = old.id;
  return old;
end;
$$;

revoke all on function private.nz_reserve_page_identifiers_on_delete()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_reserve_page_identifiers_on_delete on public.pages;
create trigger trg_reserve_page_identifiers_on_delete
  after delete on public.pages
  for each row execute function private.nz_reserve_page_identifiers_on_delete();

create or replace function private.nz_enforce_storefront_handle_identifier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.handle is not distinct from old.handle then
    return new;
  end if;

  perform private.nz_claim_public_identifier(
    'storefront_handle',
    new.handle,
    new.owner_id,
    new.id
  );

  if tg_op = 'UPDATE' then
    update private.public_identifier_claims
    set kind = 'reserved',
        subject_id = null,
        updated_at = statement_timestamp()
    where namespace = 'storefront_handle'
      and identifier = old.handle
      and owner_id is not distinct from old.owner_id
      and subject_id = old.id;
  end if;
  return new;
end;
$$;

revoke all on function private.nz_enforce_storefront_handle_identifier()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_01_enforce_storefront_handle_identifier on public.storefronts;
create trigger trg_01_enforce_storefront_handle_identifier
  before insert or update of handle on public.storefronts
  for each row execute function private.nz_enforce_storefront_handle_identifier();

create or replace function private.nz_reserve_storefront_identifiers_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.public_identifier_claims
  set kind = 'reserved',
      subject_id = null,
      updated_at = statement_timestamp()
  where namespace = 'storefront_handle'
    and subject_id = old.id;
  return old;
end;
$$;

revoke all on function private.nz_reserve_storefront_identifiers_on_delete()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_reserve_storefront_identifiers_on_delete on public.storefronts;
create trigger trg_reserve_storefront_identifiers_on_delete
  after delete on public.storefronts
  for each row execute function private.nz_reserve_storefront_identifiers_on_delete();

-- Existing short identifiers remain structurally valid. The triggers above
-- apply the five-character minimum to inserts and identity changes only.
alter table public.pages drop constraint if exists pages_slug_format;
alter table public.pages
  add constraint pages_slug_format
  check (
    slug is null
    or (
      slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and char_length(slug) between 1 and 63
    )
  );

alter table public.pages drop constraint if exists pages_published_slug_required;
alter table public.pages
  add constraint pages_published_slug_required
  check (is_published is not true or slug is not null);

alter table public.storefronts drop constraint if exists storefronts_handle_format;
alter table public.storefronts
  add constraint storefronts_handle_format
  check (
    handle ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(handle) between 1 and 63
  );

-- Custom-domain listing paths use their own namespace. Keep root and one clean
-- segment only so encoded, nested, or discovery-artifact paths cannot become
-- merchant-controlled routing identities.
alter table public.pages drop constraint if exists pages_domain_path_format;
alter table public.pages
  add constraint pages_domain_path_format
  check (
    domain_path = '/'
    or (
      domain_path ~ '^/[a-z0-9]+(?:-[a-z0-9]+)*$'
      and char_length(domain_path) between 6 and 64
    )
  );

create or replace function public.nz_public_identifier_availability(
  p_namespace text,
  p_identifier text,
  p_owner_id uuid default null,
  p_subject_id uuid default null
)
returns table(available boolean, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_error text;
  v_claim private.public_identifier_claims%rowtype;
begin
  if p_namespace not in ('page_slug', 'storefront_handle') then
    return query select false, 'invalid_namespace'::text;
    return;
  end if;

  select claim.*
  into v_claim
  from private.public_identifier_claims as claim
  where claim.namespace = p_namespace
    and claim.identifier = p_identifier;

  if found
     and v_claim.kind in ('current', 'alias')
     and v_claim.owner_id is not distinct from p_owner_id
     and v_claim.subject_id is not distinct from p_subject_id then
    return query select true, 'owned'::text;
    return;
  end if;

  v_error := private.nz_public_identifier_error(p_identifier);
  if v_error is not null then
    return query select false, v_error;
    return;
  end if;

  if not found then
    return query select true, 'available'::text;
    return;
  end if;

  return query select false,
    case when v_claim.kind in ('system', 'reserved') then 'reserved' else 'taken' end;
end;
$$;

revoke all on function public.nz_public_identifier_availability(text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.nz_public_identifier_availability(text, text, uuid, uuid)
  to service_role;

create or replace function public.nz_resolve_page_slug_alias(p_slug text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select page.slug
  from private.public_identifier_claims as claim
  join public.pages as page on page.id = claim.subject_id
  where claim.namespace = 'page_slug'
    and claim.identifier = p_slug
    and claim.kind = 'alias'
    and page.is_published = true
  limit 1;
$$;

revoke all on function public.nz_resolve_page_slug_alias(text)
  from public, anon, authenticated;
grant execute on function public.nz_resolve_page_slug_alias(text)
  to service_role;

comment on function public.nz_public_identifier_availability(text, text, uuid, uuid) is
  'Service-only availability check. It reveals no owner or subject identity.';
comment on function public.nz_resolve_page_slug_alias(text) is
  'Service-only resolver for permanent redirects after a published listing rename.';
