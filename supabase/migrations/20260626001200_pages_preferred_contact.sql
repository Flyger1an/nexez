-- Page-level "preferred contact channel" so agents don't have to GUESS which channel
-- to use to reach a human (email vs the primary CTA/booking link vs website). Nullable;
-- null = "auto" (the agent manifest derives email -> cta -> website from the channels the
-- page actually has). Constrained to the channels the page model supports.
alter table public.pages
  add column if not exists preferred_contact text;

alter table public.pages
  drop constraint if exists pages_preferred_contact_check;
alter table public.pages
  add constraint pages_preferred_contact_check
  check (preferred_contact is null or preferred_contact in ('email', 'cta', 'website'));

-- pages_public must expose every PUBLIC_PAGE_SELECT column or PostgREST errors and the
-- ENTIRE public/agent surface 404s (the `currency` SEV1, 20260623010000). Recreate the
-- view mirroring the live definition exactly (rules-stripping jsonb_agg preserved) with
-- `preferred_contact` appended at the END so CREATE OR REPLACE stays valid. Table-level
-- grants cover the new column automatically (as `currency` proved).
create or replace view public.pages_public as
  select
    id, owner_id, name, slug, description, website_url, cta_url, cta_label, audience, location, contact_email, industry, prefer_original_site,
    coalesce((select jsonb_agg(arr.elem - 'rules' order by arr.ord) from jsonb_array_elements(pages.products) with ordinality arr(elem, ord)), products) as products,
    coalesce((select jsonb_agg(arr.elem - 'rules' order by arr.ord) from jsonb_array_elements(pages.services) with ordinality arr(elem, ord)), services) as services,
    faqs, is_published, custom_domain, custom_domain_verified, domain_path, branding, created_at, updated_at, mcp_enabled, verification_details, agent_memory, google_calendar_id, next_available, last_booking, llm_opt_in,
    currency, preferred_contact
  from pages
  where is_published = true;
