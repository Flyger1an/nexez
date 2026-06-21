-- Phase 3 of the no-Free trial model: reversible storefront PAUSE. When a trial expires
-- without payment, the seller's public listings go offline (agent.json / [slug] /
-- agent-pages.json) but is_published is NEVER touched, so reactivation is a flip, not a
-- republish. Enforced at the public read model: pages_public gains a `serving` flag and the
-- anon RLS requires it. The flag is derived from the owner's billing state (the projection
-- deliberately has no owner_id, so the gate lives in the sync, not in a joinable column).

-- Is this owner's storefront paused (listings should be offline)? Only a NEW (trial-origin)
-- account whose trial expired or was paused. Legacy accounts never pause; admins never pause.
-- Mirrors lib/server/plan.ts getOwnerBillingState().isPaused.
create or replace function private.nz_owner_is_paused(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select case
    when p_owner is null then false
    when exists (select 1 from public.platform_admins a where a.user_id = p_owner) then false
    else coalesce((
      select s.account_origin = 'trial'
         and (s.status = 'paused'
              or (s.status = 'trialing' and s.trial_ends_at is not null and s.trial_ends_at < now()))
      from public.billing_subscriptions s
      where s.owner_id = p_owner
    ), false)  -- no row → not paused (legacy / fail-open)
  end;
$$;
revoke all on function private.nz_owner_is_paused(uuid) from public, anon, authenticated;

-- The gate column. Default true so every existing + future published row serves unless a
-- paused owner sets it false. NOT NULL keeps the RLS predicate simple.
alter table public.pages_public add column if not exists serving boolean not null default true;

-- Backfill from current billing state (nobody is paused at cutover → all stay true).
update public.pages_public pp
set serving = not private.nz_owner_is_paused(p.owner_id)
from public.pages p
where p.id = pp.id;

-- Tighten the anon read: a paused owner's rows (serving=false) stop serving entirely.
drop policy if exists "Public can read published projection" on public.pages_public;
create policy "Public can read published projection"
  on public.pages_public
  for select
  to anon, authenticated
  using (is_published = true and serving = true);

-- Re-sync the projection (incl. serving) from a pages write. Same body as
-- 20260627001000 with `serving` added in the three places.
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
$$;
revoke all on function private.nz_sync_pages_public() from public, anon, authenticated;

-- Reverse the pause: when an owner's billing status/trial flips, re-sync the serving flag
-- on all their pages_public rows. This is what takes listings offline at pause and brings
-- them back at reactivation — is_published never changes.
create or replace function private.nz_resync_serving_for_owner()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.trial_ends_at is not distinct from old.trial_ends_at
     and new.account_origin is not distinct from old.account_origin then
    return new;  -- nothing pause-relevant changed
  end if;
  update public.pages_public pp
  set serving = not private.nz_owner_is_paused(new.owner_id)
  from public.pages p
  where p.id = pp.id and p.owner_id = new.owner_id;
  return new;
end;
$$;
revoke all on function private.nz_resync_serving_for_owner() from public, anon, authenticated;

drop trigger if exists trg_resync_serving_on_billing on public.billing_subscriptions;
create trigger trg_resync_serving_on_billing
  after insert or update on public.billing_subscriptions
  for each row execute function private.nz_resync_serving_for_owner();
