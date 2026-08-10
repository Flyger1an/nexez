-- Owner-authored `agent_memory` (free-text notes) was mirrored onto the
-- anon-readable `pages_public` projection by the sync trigger. It is not read by
-- any code off the public view (the MCP discovery select never included it; it
-- appears only as a static capability label), so it was a latent owner-note leak
-- to buyers. Remove it from the public projection.
--
-- APPLIED to production via MCP ahead of this commit (Supabase migration
-- drop_agent_memory_from_pages_public); this file mirrors it into source so the
-- schema history does not drift.
--
-- Order matters: the sync trigger function is rewritten to stop referencing the
-- column BEFORE the column is dropped, otherwise the next published-page write
-- would error on an unknown column.

-- 1) Rewrite the sync trigger function without agent_memory (removed from the
--    insert column list, the values list, and the ON CONFLICT update set).
--    Otherwise byte-for-byte the prior definition.
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
