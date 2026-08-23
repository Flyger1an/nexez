-- Defense in depth for private plan catalogs. These tables have no Data API
-- grants and are read through tightly scoped SECURITY DEFINER functions, but
-- enabling RLS prevents a future grant from silently exposing catalog rows.
alter table private.plan_catalog enable row level security;
alter table private.plan_feature_catalog enable row level security;
revoke all on table private.plan_catalog from public, anon, authenticated;
revoke all on table private.plan_feature_catalog from public, anon, authenticated;

-- One-off pre-migration function snapshots were retained after the 2026-08-16
-- growth repair. Production verification found only the table's own row type
-- dependencies; the canonical functions are versioned in migrations now.
drop table if exists private.zz_growth_fn_backup_20260816;

-- PostgreSQL does not automatically index the referencing side of a foreign
-- key. These indexes keep parent deletes/updates and the associated ownership
-- lookups bounded as the platform tables grow.
create index if not exists agent_lab_research_runs_compared_page_id_idx
  on public.agent_lab_research_runs (compared_page_id);
create index if not exists agent_lab_simulation_runs_page_id_idx
  on public.agent_lab_simulation_runs (page_id);
create index if not exists checkout_configuration_handoffs_page_id_idx
  on public.checkout_configuration_handoffs (page_id);
create index if not exists commerce_supply_campaign_events_actor_id_idx
  on public.commerce_supply_campaign_events (actor_id);
create index if not exists commerce_supply_campaigns_created_by_idx
  on public.commerce_supply_campaigns (created_by);
create index if not exists commerce_supply_campaigns_updated_by_idx
  on public.commerce_supply_campaigns (updated_by);
create index if not exists resource_hold_allocations_window_id_idx
  on public.resource_hold_allocations (window_id);
create index if not exists resource_pools_owner_id_idx
  on public.resource_pools (owner_id);
create index if not exists resource_reservations_owner_id_idx
  on public.resource_reservations (owner_id);
create index if not exists resource_reservations_page_id_idx
  on public.resource_reservations (page_id);
create index if not exists service_agreements_page_id_idx
  on public.service_agreements (page_id);
create index if not exists staged_settlement_agreements_page_id_idx
  on public.staged_settlement_agreements (page_id);
