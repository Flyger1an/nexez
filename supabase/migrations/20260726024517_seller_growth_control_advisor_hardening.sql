-- Growth-ledger advisor hardening. Browser privileges are already revoked; the
-- explicit deny policies make that server-only contract visible to RLS tooling.

drop policy if exists "deny browser campaign access"
  on public.seller_growth_campaigns;
create policy "deny browser campaign access"
  on public.seller_growth_campaigns
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "deny browser growth invite access"
  on public.seller_growth_invites;
create policy "deny browser growth invite access"
  on public.seller_growth_invites
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "deny browser business claim access"
  on public.seller_growth_business_claims;
create policy "deny browser business claim access"
  on public.seller_growth_business_claims
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "deny browser growth event access"
  on public.seller_growth_events;
create policy "deny browser growth event access"
  on public.seller_growth_events
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "deny browser promotion notice access"
  on public.promotional_grant_notices;
create policy "deny browser promotion notice access"
  on public.promotional_grant_notices
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "deny browser growth admin audit access"
  on public.seller_growth_campaign_admin_events;
create policy "deny browser growth admin audit access"
  on public.seller_growth_campaign_admin_events
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Cover every growth-specific foreign key used by deletes and lifecycle joins.
create index if not exists promotional_plan_grants_fallback_page_idx
  on public.promotional_plan_grants (fallback_page_id);

create index if not exists promotional_plan_grants_source_invite_idx
  on public.promotional_plan_grants (source_invite_id);

create index if not exists seller_growth_business_claims_grant_idx
  on public.seller_growth_business_claims (grant_id);

create index if not exists seller_growth_campaign_admin_events_actor_idx
  on public.seller_growth_campaign_admin_events (actor_id);

create index if not exists seller_growth_events_invite_idx
  on public.seller_growth_events (invite_id);

create index if not exists seller_growth_events_grant_idx
  on public.seller_growth_events (grant_id);

create index if not exists seller_growth_invites_invitee_grant_idx
  on public.seller_growth_invites (invitee_grant_id);
