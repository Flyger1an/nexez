-- Security: stop anon from reading owner-private data off the public `pages` table.
--
-- The "Public can read published pages" RLS policy grants anon SELECT on the WHOLE
-- row, so anyone with the (public) anon key can read, via the raw REST API, fields
-- the app deliberately withholds: the per-offer pricing `rules` (incl. minPrice -
-- the negotiation floor), and any owner-private columns. This migration is the
-- ADDITIVE half of the fix (safe to apply before the code deploy): it creates a
-- redacted public view + moves the two anon analytics INSERT policies that read
-- `pages` directly off that dependency. The base-table anon SELECT is revoked in a
-- SECOND migration (20260617010000) only AFTER the repointed code is live.
-- Idempotent.

-- 1) Security-definer check for the anon analytics INSERT policies. They currently
--    do `EXISTS (SELECT 1 FROM pages WHERE ...)` evaluated as the inserting (anon)
--    role - which breaks the moment anon loses SELECT on pages. Route the lookup
--    through a definer function (same pattern as private.nz_page_is_published) so
--    anon visit/checkout logging keeps working post-revoke.
create or replace function private.nz_page_visit_allowed(p_page_id uuid, p_slug text, p_owner_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.pages p
    where p.id = p_page_id
      and p.is_published = true
      and p.slug = p_slug
      and p.owner_id is not distinct from p_owner_id
  );
$$;
revoke all on function private.nz_page_visit_allowed(uuid, text, uuid) from public;
grant execute on function private.nz_page_visit_allowed(uuid, text, uuid) to anon, authenticated;

drop policy if exists "Public can create agent visits for published pages" on public.agent_visits;
create policy "Public can create agent visits for published pages"
  on public.agent_visits for insert to anon, authenticated
  with check (private.nz_page_visit_allowed(page_id, slug, owner_id));

drop policy if exists "Public can create checkout events for published pages" on public.checkout_events;
create policy "Public can create checkout events for published pages"
  on public.checkout_events for insert to anon, authenticated
  with check (private.nz_page_visit_allowed(page_id, slug, owner_id));

-- 2) The redacted public projection. Runs as the view owner (NOT security_invoker),
--    so anon needs SELECT on the view only - not the base table. The `is_published`
--    filter is the row scope; per-offer `rules` are stripped from services/products;
--    only the PUBLIC_PAGE_SELECT columns are exposed (owner-private columns like
--    calendly_webhook_secret / outbound_webhooks / draft are simply not selected).
create or replace view public.pages_public as
select
  id,
  owner_id,
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
  coalesce(
    (select jsonb_agg(elem - 'rules' order by ord)
     from jsonb_array_elements(products) with ordinality as arr(elem, ord)),
    products
  ) as products,
  coalesce(
    (select jsonb_agg(elem - 'rules' order by ord)
     from jsonb_array_elements(services) with ordinality as arr(elem, ord)),
    services
  ) as services,
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
  google_calendar_id,
  next_available,
  last_booking,
  llm_opt_in
from public.pages
where is_published = true;

grant select on public.pages_public to anon, authenticated;
