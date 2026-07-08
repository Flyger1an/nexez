-- Stale-page re-interview nudge ledger. The freshness cron (read-only telemetry
-- today) becomes an actual owner-facing nudge: when a published, site-imported
-- listing goes stale (DEFAULT_STALE_DAYS), the seller gets ONE email inviting a
-- quick re-interview - closing the loop with the re-interview feature.
--
-- This table is the per-page cooldown ledger so the daily cron nudges each page
-- at most once per cooldown window (not every run). SELLER-FACET, service-role
-- only: it's ops metadata about the seller's own pages, never buyer data, so it
-- must NOT go through the buyer `notifications` feed. Cascades from pages, so a
-- deleted page (incl. via seller-facet account deletion) cleans up automatically.

create table if not exists public.page_freshness_nudges (
  page_id        uuid        primary key references public.pages(id) on delete cascade,
  owner_id       uuid        not null,
  last_nudged_at timestamptz not null default now(),
  nudge_count    integer     not null default 1
);

create index if not exists page_freshness_nudges_owner_idx on public.page_freshness_nudges (owner_id);

alter table public.page_freshness_nudges enable row level security;
-- No policies → only the service-role (cron) reads/writes. Revoke the default
-- PostgREST grants to be explicit/least-privilege.
revoke all on public.page_freshness_nudges from anon, authenticated;

comment on table public.page_freshness_nudges is
  'Per-page cooldown ledger for the stale-listing re-interview nudge (seller facet, service-role only). Cascades from pages.';
