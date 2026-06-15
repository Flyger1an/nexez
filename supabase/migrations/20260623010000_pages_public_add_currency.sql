-- HOTFIX: expose pages.currency on the pages_public view.
--
-- The multi-currency change (20260623000000) added `currency` to the pages table
-- AND to PUBLIC_PAGE_SELECT (lib/agent-page.ts), but the public/agent surfaces read
-- from the pages_public VIEW — which did not carry the column. Selecting a column
-- the view lacks makes PostgREST error, so every public/agent route
-- (app/[slug], agent.json, mcp, llms.txt, checkout, agent-pages.json) returned no
-- data (404 / empty). This recreates the view with `currency` appended (column
-- added at the end so CREATE OR REPLACE is valid), restoring the public surface.
-- Definition mirrors the live view exactly, including the `rules`-stripping
-- jsonb_agg on products/services (private pricing rules never leave the server).
create or replace view public.pages_public as
  select
    id, owner_id, name, slug, description, website_url, cta_url, cta_label, audience, location, contact_email, industry, prefer_original_site,
    coalesce((select jsonb_agg(arr.elem - 'rules' order by arr.ord) from jsonb_array_elements(pages.products) with ordinality arr(elem, ord)), products) as products,
    coalesce((select jsonb_agg(arr.elem - 'rules' order by arr.ord) from jsonb_array_elements(pages.services) with ordinality arr(elem, ord)), services) as services,
    faqs, is_published, custom_domain, custom_domain_verified, domain_path, branding, created_at, updated_at, mcp_enabled, verification_details, agent_memory, google_calendar_id, next_available, last_booking, llm_opt_in,
    currency
  from pages
  where is_published = true;
