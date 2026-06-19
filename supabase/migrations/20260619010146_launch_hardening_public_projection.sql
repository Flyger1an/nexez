-- Launch hardening: replace the public SECURITY DEFINER view with a
-- trigger-maintained projection table. Public agent surfaces keep their fast
-- `pages_public` read model, but owner-only fields (owner_id, calendar ids) no
-- longer travel through anonymous PostgREST reads.

create or replace function private.nz_public_offer_array(input jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when input is null then null
    when jsonb_typeof(input) = 'array' then coalesce(
      (
        select jsonb_agg(arr.elem - 'rules' order by arr.ord)
        from jsonb_array_elements(input) with ordinality arr(elem, ord)
      ),
      '[]'::jsonb
    )
    else input
  end
$$;

revoke all on function private.nz_public_offer_array(jsonb) from public, anon, authenticated;

create or replace function private.nz_public_last_booking(input jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when input is null then null
    when jsonb_typeof(input) <> 'object' then null
    else jsonb_strip_nulls(jsonb_build_object(
      'event_name', input ->> 'event_name',
      'at', input ->> 'at'
    ))
  end
$$;

revoke all on function private.nz_public_last_booking(jsonb) from public, anon, authenticated;

drop view if exists public.pages_public;
drop table if exists public.pages_public;

create table public.pages_public as
select
  p.id,
  p.name,
  p.slug,
  p.description,
  p.website_url,
  p.cta_url,
  p.cta_label,
  p.audience,
  p.location,
  p.contact_email,
  p.industry,
  p.prefer_original_site,
  private.nz_public_offer_array(p.products) as products,
  private.nz_public_offer_array(p.services) as services,
  p.faqs,
  p.is_published,
  p.custom_domain,
  p.custom_domain_verified,
  p.domain_path,
  p.branding,
  p.created_at,
  p.updated_at,
  p.mcp_enabled,
  p.verification_details,
  p.agent_memory,
  p.next_available,
  private.nz_public_last_booking(p.last_booking) as last_booking,
  p.llm_opt_in,
  p.currency,
  p.preferred_contact
from public.pages p
where false;

alter table public.pages_public
  add primary key (id);

create unique index pages_public_slug_idx
  on public.pages_public (slug);

create index pages_public_created_idx
  on public.pages_public (created_at desc);

create index pages_public_custom_domain_idx
  on public.pages_public (lower(btrim(custom_domain)), domain_path)
  where custom_domain is not null
    and btrim(custom_domain) <> ''
    and custom_domain_verified is not null;

alter table public.pages_public enable row level security;

revoke all on public.pages_public from anon, authenticated;
grant select on public.pages_public to anon, authenticated;

drop policy if exists "Public can read published projection" on public.pages_public;
create policy "Public can read published projection"
  on public.pages_public
  for select
  to anon, authenticated
  using (is_published = true);

create or replace function private.nz_sync_pages_public()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.pages_public where id = old.id;
    return old;
  end if;

  if new.is_published is true then
    insert into public.pages_public (
      id,
      name,
      slug,
      description,
      website_url,
      cta_url,
      cta_label,
      audience,
      location,
      contact_email,
      industry,
      prefer_original_site,
      products,
      services,
      faqs,
      is_published,
      custom_domain,
      custom_domain_verified,
      domain_path,
      branding,
      created_at,
      updated_at,
      mcp_enabled,
      verification_details,
      agent_memory,
      next_available,
      last_booking,
      llm_opt_in,
      currency,
      preferred_contact
    )
    values (
      new.id,
      new.name,
      new.slug,
      new.description,
      new.website_url,
      new.cta_url,
      new.cta_label,
      new.audience,
      new.location,
      new.contact_email,
      new.industry,
      new.prefer_original_site,
      private.nz_public_offer_array(new.products),
      private.nz_public_offer_array(new.services),
      new.faqs,
      new.is_published,
      new.custom_domain,
      new.custom_domain_verified,
      new.domain_path,
      new.branding,
      new.created_at,
      new.updated_at,
      new.mcp_enabled,
      new.verification_details,
      new.agent_memory,
      new.next_available,
      private.nz_public_last_booking(new.last_booking),
      new.llm_opt_in,
      new.currency,
      new.preferred_contact
    )
    on conflict (id) do update set
      name = excluded.name,
      slug = excluded.slug,
      description = excluded.description,
      website_url = excluded.website_url,
      cta_url = excluded.cta_url,
      cta_label = excluded.cta_label,
      audience = excluded.audience,
      location = excluded.location,
      contact_email = excluded.contact_email,
      industry = excluded.industry,
      prefer_original_site = excluded.prefer_original_site,
      products = excluded.products,
      services = excluded.services,
      faqs = excluded.faqs,
      is_published = excluded.is_published,
      custom_domain = excluded.custom_domain,
      custom_domain_verified = excluded.custom_domain_verified,
      domain_path = excluded.domain_path,
      branding = excluded.branding,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      mcp_enabled = excluded.mcp_enabled,
      verification_details = excluded.verification_details,
      agent_memory = excluded.agent_memory,
      next_available = excluded.next_available,
      last_booking = excluded.last_booking,
      llm_opt_in = excluded.llm_opt_in,
      currency = excluded.currency,
      preferred_contact = excluded.preferred_contact;
  else
    delete from public.pages_public where id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.nz_sync_pages_public() from public, anon, authenticated;

drop trigger if exists trg_sync_pages_public on public.pages;
create trigger trg_sync_pages_public
  after insert or update or delete on public.pages
  for each row
  execute function private.nz_sync_pages_public();

insert into public.pages_public (
  id,
  name,
  slug,
  description,
  website_url,
  cta_url,
  cta_label,
  audience,
  location,
  contact_email,
  industry,
  prefer_original_site,
  products,
  services,
  faqs,
  is_published,
  custom_domain,
  custom_domain_verified,
  domain_path,
  branding,
  created_at,
  updated_at,
  mcp_enabled,
  verification_details,
  agent_memory,
  next_available,
  last_booking,
  llm_opt_in,
  currency,
  preferred_contact
)
select
  p.id,
  p.name,
  p.slug,
  p.description,
  p.website_url,
  p.cta_url,
  p.cta_label,
  p.audience,
  p.location,
  p.contact_email,
  p.industry,
  p.prefer_original_site,
  private.nz_public_offer_array(p.products),
  private.nz_public_offer_array(p.services),
  p.faqs,
  p.is_published,
  p.custom_domain,
  p.custom_domain_verified,
  p.domain_path,
  p.branding,
  p.created_at,
  p.updated_at,
  p.mcp_enabled,
  p.verification_details,
  p.agent_memory,
  p.next_available,
  private.nz_public_last_booking(p.last_booking),
  p.llm_opt_in,
  p.currency,
  p.preferred_contact
from public.pages p
where p.is_published is true;

-- Advisor cleanup: this trigger function is invoked by the pages trigger only.
revoke execute on function public.nz_enforce_custom_domain_single_owner() from public, anon, authenticated;

-- Advisor cleanup: missing foreign-key indexes on owner-facing order tables.
create index if not exists checkout_orders_page_id_idx
  on public.checkout_orders (page_id);

create index if not exists order_requests_page_id_idx
  on public.order_requests (page_id);

-- Advisor cleanup: one service-role idempotency table intentionally has no owner
-- read surface. State that explicitly so the RLS-no-policy advisory clears.
drop policy if exists "No client access to system email ledger" on public.sent_system_emails;
create policy "No client access to system email ledger"
  on public.sent_system_emails
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Advisor cleanup: keep the accepted-invite semantics while using the initplan
-- shape Supabase recognizes.
drop policy if exists "Invitees can read their own invites" on public.team_invites;
create policy "Invitees can read their own invites"
  on public.team_invites
  for select
  to authenticated
  using (lower(email) = lower(coalesce(((select auth.jwt()) ->> 'email'), '')));

drop policy if exists "collaborators read shared pages" on public.pages;
create policy "collaborators read shared pages"
  on public.pages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.team_invites ti
      where ti.owner_id = pages.owner_id
        and lower(ti.email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
        and ti.status = 'accepted'
    )
  );

drop policy if exists "editor collaborators update shared pages" on public.pages;
create policy "editor collaborators update shared pages"
  on public.pages
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.team_invites ti
      where ti.owner_id = pages.owner_id
        and lower(ti.email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
        and ti.status = 'accepted'
        and ti.role = 'editor'
    )
  )
  with check (
    exists (
      select 1
      from public.team_invites ti
      where ti.owner_id = pages.owner_id
        and lower(ti.email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
        and ti.status = 'accepted'
        and ti.role = 'editor'
    )
  );
