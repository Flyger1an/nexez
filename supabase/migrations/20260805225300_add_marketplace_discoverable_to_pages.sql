-- Hotfix (applied to prod 2026-08-05 22:53 UTC via MCP; this file mirrors it so
-- local/CI schema stays in sync).
--
-- Why: OWNER_PAGE_SELECT (via PUBLIC_PAGE_COLUMNS in lib/agent-page.ts) selects
-- marketplace_discoverable against the base pages table, but migration
-- 20260721160006_marketplace_curation.sql only added the column to pages_public.
-- Every owner read of pages using the rich select failed with 42703
-- ("column pages.marketplace_discoverable does not exist"); dashboard/settings
-- had no BASIC_OWNER_PAGE_SELECT fallback and rendered empty.
--
-- Write-path safety: private.nz_sync_pages_public does NOT copy this column into
-- the projection, and pages_public's BEFORE trigger
-- (trg_derive_marketplace_discoverable) re-derives the authoritative value from
-- marketplace_curations on every write. The pages copy is an inert default-true
-- placeholder that only exists so owner selects are schema-valid. Never read it
-- from pages for visibility decisions.
alter table public.pages
  add column if not exists marketplace_discoverable boolean not null default true;
