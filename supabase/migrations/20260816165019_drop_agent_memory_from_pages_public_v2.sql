-- Re-drop of owner-authored `agent_memory` from the anon-readable pages_public
-- projection. This repeats 20260810012119, which was reverted the next day by
-- 20260810171807 because PUBLIC_PAGE_SELECT still named the column and every
-- public read 42703'd site-wide.
--
-- That precondition is now resolved. The code half shipped first, in PR #41
-- (merge 73ff969, production deployment dpl_3BAJP9z7BzdRhNJd3XVK7MBXJARX,
-- readyState READY), and the live manifest was confirmed to no longer emit
-- memory_context before this ran. Owner notes stay on public.pages and are
-- served to owners through OWNER_PAGE_SELECT against the base table under RLS.
--
-- APPLIED to production via MCP as migration 20260816165019 ahead of this
-- commit; this file mirrors it into source so the schema history does not drift.
--
-- Order matters: the sync trigger function must stop referencing the column
-- BEFORE the column is dropped, or the next published-page write errors.

-- 1) Rewrite the sync trigger function without agent_memory (insert cols,
--    values, and the ON CONFLICT update set). Otherwise byte-for-byte the
--    current live definition.
CREATE OR REPLACE FUNCTION private.nz_sync_pages_public()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
begin
  if tg_op = 'DELETE' then
    delete from public.pages_public where id = old.id;
    return old;
  end if;
  if new.is_published is true then
    insert into public.pages_public (
      id, name, slug, description, website_url, cta_url, cta_label, audience, location,
      contact_email, industry, prefer_original_site, products, services, faqs, is_published,
      custom_domain, custom_domain_verified, domain_path, branding, created_at, updated_at,
      mcp_enabled, verification_details, next_available, last_booking,
      llm_opt_in, currency, preferred_contact, serving
    )
    values (
      new.id, new.name, new.slug, new.description, new.website_url, new.cta_url, new.cta_label,
      new.audience, new.location, new.contact_email, new.industry, new.prefer_original_site,
      private.nz_public_offer_array(new.products), private.nz_public_offer_array(new.services),
      new.faqs, new.is_published, new.custom_domain, new.custom_domain_verified, new.domain_path,
      new.branding, new.created_at, new.updated_at, new.mcp_enabled, new.verification_details,
      new.next_available, private.nz_public_last_booking(new.last_booking),
      new.llm_opt_in, new.currency, new.preferred_contact,
      not private.nz_owner_is_paused(new.owner_id)
    )
    on conflict (id) do update set
      name = excluded.name, slug = excluded.slug, description = excluded.description,
      website_url = excluded.website_url, cta_url = excluded.cta_url, cta_label = excluded.cta_label,
      audience = excluded.audience, location = excluded.location, contact_email = excluded.contact_email,
      industry = excluded.industry, prefer_original_site = excluded.prefer_original_site,
      products = excluded.products, services = excluded.services, faqs = excluded.faqs,
      is_published = excluded.is_published, custom_domain = excluded.custom_domain,
      custom_domain_verified = excluded.custom_domain_verified, domain_path = excluded.domain_path,
      branding = excluded.branding, created_at = excluded.created_at, updated_at = excluded.updated_at,
      mcp_enabled = excluded.mcp_enabled, verification_details = excluded.verification_details,
      next_available = excluded.next_available,
      last_booking = excluded.last_booking, llm_opt_in = excluded.llm_opt_in,
      currency = excluded.currency, preferred_contact = excluded.preferred_contact,
      serving = excluded.serving;
  else
    delete from public.pages_public where id = new.id;
  end if;
  return new;
end;
$function$;

-- 2) Drop the now-unwritten, unread column from the public projection. The base
--    public.pages.agent_memory column is untouched, so owners keep their notes.
ALTER TABLE public.pages_public DROP COLUMN IF EXISTS agent_memory;
