-- REVERT of 20260810012119 (drop_agent_memory_from_pages_public). That migration's
-- premise was wrong: lib/agent-page.ts PUBLIC_PAGE_SELECT reads agent_memory from
-- pages_public on every public page render, so dropping the column 42703'd every
-- storefront + per-page artifact (site-wide public 404s, caught by release
-- certification). agent_memory is a deliberate manifest feature (owner-authored
-- context for agents). Restore column + trigger + data; revisit exposure as a
-- product decision with a paired code change.

-- 1) Re-add the column.
ALTER TABLE public.pages_public ADD COLUMN IF NOT EXISTS agent_memory jsonb;

-- 2) Restore the sync trigger function to write it again (identical to the
--    pre-drop definition: agent_memory in insert cols, values, and conflict set).
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
      mcp_enabled, verification_details, agent_memory, next_available, last_booking,
      llm_opt_in, currency, preferred_contact, serving
    )
    values (
      new.id, new.name, new.slug, new.description, new.website_url, new.cta_url, new.cta_label,
      new.audience, new.location, new.contact_email, new.industry, new.prefer_original_site,
      private.nz_public_offer_array(new.products), private.nz_public_offer_array(new.services),
      new.faqs, new.is_published, new.custom_domain, new.custom_domain_verified, new.domain_path,
      new.branding, new.created_at, new.updated_at, new.mcp_enabled, new.verification_details,
      new.agent_memory, new.next_available, private.nz_public_last_booking(new.last_booking),
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
      agent_memory = excluded.agent_memory, next_available = excluded.next_available,
      last_booking = excluded.last_booking, llm_opt_in = excluded.llm_opt_in,
      currency = excluded.currency, preferred_contact = excluded.preferred_contact,
      serving = excluded.serving;
  else
    delete from public.pages_public where id = new.id;
  end if;
  return new;
end;
$function$;

-- 3) Backfill the restored column for currently published rows.
UPDATE public.pages_public pp
SET agent_memory = p.agent_memory
FROM public.pages p
WHERE pp.id = p.id;
