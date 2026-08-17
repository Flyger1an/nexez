-- Turn the public projection from a denylist into an allowlist.
--
-- `private.nz_public_offer_array` was `elem - 'rules'`: copy the offer, minus one
-- known-bad key. That only holds while every future key added to an offer happens
-- to be public. Two keys already fail that test:
--
--   * `OfferItem.metadata` is `Record<string, any>`, populated by Stripe, Shopify
--     and Calendly sync. Whatever those integrations put there is published.
--   * `verification_details` is copied verbatim, and its `docs_provided` entries are
--     `CredentialRecord`s carrying `file_path` (a private storage path), `mime`,
--     and a `verdict` blob with issuer, holder, expiry, confidence and free-text
--     `reason` about a real person's license. Documents the owner never marked
--     public, plus pending and rejected ones, ship all of that to anon today.
--
-- After this migration both are built from explicitly named fields, so a new key is
-- private by default and becomes public only when someone adds it here on purpose.
--
-- The allowlist pattern is not new to this codebase: `nz_public_last_booking` and
-- `publicBookingConstraints` (lib/offer-rules.ts) already work this way. This applies
-- it to the two projections that were missed.
--
-- Forward-only and idempotent. No column changes; only the values written into
-- existing columns, plus a backfill of the rows already there.

-- ---------------------------------------------------------------------------
-- 1. Offer sub-objects
-- ---------------------------------------------------------------------------

-- Per-key rules allowlist. `rules` is NOT uniformly private: lib/agent-page.ts
-- documents notice/blackout/booking-cap and scope as public-safe, while minPrice,
-- maxDiscountPercent and the auto-accept bands are the seller's negotiation floor.
-- The old wholesale strip was both leaky forward and too aggressive today: it is why
-- the booking-constraint chip in app/[slug]/page.tsx renders only in owner preview.
create or replace function private.nz_public_offer_rules(input jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when input is null or jsonb_typeof(input) <> 'object' then null
    else nullif(
      jsonb_strip_nulls(jsonb_build_object(
        'minNoticeHours',     input -> 'minNoticeHours',
        'blackoutDates',      input -> 'blackoutDates',
        'maxBookingsPerWeek', input -> 'maxBookingsPerWeek',
        'includedScope',      input -> 'includedScope',
        'excludedScope',      input -> 'excludedScope',
        'maxRevisions',       input -> 'maxRevisions',
        'maxProjectWeeks',    input -> 'maxProjectWeeks'
      )),
      '{}'::jsonb
    )
  end
$$;

-- Integration metadata is an open bag fed by third-party sync. Only `service_area`
-- is read from the public projection (lib/location-filter.ts, via discovery,
-- agent-search and directory), so only `service_area` survives. Everything else
-- (Stripe/Shopify ids, Calendly event types, sync timestamps, provenance) stays
-- owner-side, where the routes that need it already read base `pages`.
create or replace function private.nz_public_offer_metadata(input jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when input is null or jsonb_typeof(input) <> 'object' then null
    else nullif(
      jsonb_strip_nulls(jsonb_build_object('service_area', input -> 'service_area')),
      '{}'::jsonb
    )
  end
$$;

create or replace function private.nz_public_offer_tiers(input jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when input is null or jsonb_typeof(input) <> 'array' then null
    else (
      select jsonb_agg(
               jsonb_strip_nulls(jsonb_build_object(
                 'name',        t.elem -> 'name',
                 'price',       t.elem -> 'price',
                 'description', t.elem -> 'description'
               ))
               order by t.ord
             )
      from jsonb_array_elements(input) with ordinality t(elem, ord)
    )
  end
$$;

-- ---------------------------------------------------------------------------
-- 2. The public offer
-- ---------------------------------------------------------------------------

create or replace function private.nz_public_offer(input jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when input is null or jsonb_typeof(input) <> 'object' then input
    else jsonb_strip_nulls(jsonb_build_object(
      'name',                     input -> 'name',
      'description',              input -> 'description',
      'price',                    input -> 'price',
      'url',                      input -> 'url',
      'duration',                 input -> 'duration',
      'serviceArea',              input -> 'serviceArea',
      'isMobile',                 input -> 'isMobile',
      'travelFee',                input -> 'travelFee',
      'confidence',               input -> 'confidence',
      'source',                   input -> 'source',
      'prefer_original_for_this', input -> 'prefer_original_for_this',
      'availability',             input -> 'availability',
      'ab_test',                  input -> 'ab_test',
      'ab_label',                 input -> 'ab_label',
      'offerType',                input -> 'offerType',
      'tiers',                    private.nz_public_offer_tiers(input -> 'tiers'),
      'metadata',                 private.nz_public_offer_metadata(input -> 'metadata'),
      'rules',                    private.nz_public_offer_rules(input -> 'rules')
    ))
  end
$$;

-- Same name and signature as before, so the sync trigger needs no change for
-- offers. Only the body flips from subtract-one-key to build-from-allowlist.
create or replace function private.nz_public_offer_array(input jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when input is null then null
    when jsonb_typeof(input) = 'array' then coalesce(
      (
        select jsonb_agg(private.nz_public_offer(arr.elem) order by arr.ord)
        from jsonb_array_elements(input) with ordinality arr(elem, ord)
      ),
      '[]'::jsonb
    )
    else input
  end
$$;

-- ---------------------------------------------------------------------------
-- 3. Verification details
-- ---------------------------------------------------------------------------

-- A credential entry is either a legacy self-reported name (a bare string, kept as
-- is) or a review record. From the record only identity and status are public.
-- Deliberately dropped: `file_path` (private bucket path), `mime`, `verdict`
-- (issuer/holder/expiry/confidence/free-text reason), `uploaded_at`, `reviewed_at`.
-- /api/credentials/view re-checks public + verified + file_path server-side against
-- base `pages`, so the public page never needed the path to render its link.
create or replace function private.nz_public_credential(input jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when input is null then null
    when jsonb_typeof(input) = 'string' then input
    when jsonb_typeof(input) <> 'object' then null
    else nullif(
      jsonb_strip_nulls(jsonb_build_object(
        'id',     input -> 'id',
        'name',   input -> 'name',
        'status', input -> 'status',
        'public', input -> 'public'
      )),
      '{}'::jsonb
    )
  end
$$;

create or replace function private.nz_public_verification(input jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when input is null or jsonb_typeof(input) <> 'object' then null
    else nullif(
      jsonb_strip_nulls(jsonb_build_object(
        'email_verified',  input -> 'email_verified',
        'domain_verified', input -> 'domain_verified',
        'completion_rate', input -> 'completion_rate',
        'last_updated',    input -> 'last_updated',
        'docs_provided',   case
          when jsonb_typeof(input -> 'docs_provided') <> 'array' then null
          else (
            select jsonb_agg(private.nz_public_credential(d.elem) order by d.ord)
            from jsonb_array_elements(input -> 'docs_provided') with ordinality d(elem, ord)
          )
        end
      )),
      '{}'::jsonb
    )
  end
$$;

revoke all on function private.nz_public_offer_rules(jsonb) from public, anon, authenticated;
revoke all on function private.nz_public_offer_metadata(jsonb) from public, anon, authenticated;
revoke all on function private.nz_public_offer_tiers(jsonb) from public, anon, authenticated;
revoke all on function private.nz_public_offer(jsonb) from public, anon, authenticated;
revoke all on function private.nz_public_credential(jsonb) from public, anon, authenticated;
revoke all on function private.nz_public_verification(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Route verification_details through the allowlist in the sync trigger
-- ---------------------------------------------------------------------------
-- Byte-for-byte the live definition, with the two `new.verification_details`
-- references wrapped. Offers already flow through the rewritten array function.

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
      new.branding, new.created_at, new.updated_at, new.mcp_enabled,
      private.nz_public_verification(new.verification_details),
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

-- ---------------------------------------------------------------------------
-- 5. Backfill rows already in the projection
-- ---------------------------------------------------------------------------

update public.pages_public pp
set products = private.nz_public_offer_array(p.products),
    services = private.nz_public_offer_array(p.services),
    verification_details = private.nz_public_verification(p.verification_details)
from public.pages p
where p.id = pp.id;
