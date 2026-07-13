-- Durable, debounced catalog-sync state for Shopify app webhooks. The install
-- table is already service-role only (RLS enabled, no browser policies); these
-- operational columns inherit the same boundary.

alter table public.shopify_installs
  add column if not exists catalog_sync_pending_at timestamptz,
  add column if not exists catalog_sync_attempted_at timestamptz,
  add column if not exists catalog_sync_attempts integer not null default 0 check (catalog_sync_attempts >= 0),
  add column if not exists catalog_sync_error text,
  add column if not exists catalog_sync_topic text;

comment on column public.shopify_installs.catalog_sync_pending_at is
  'Latest Shopify catalog webhook waiting for the background sync worker.';
comment on column public.shopify_installs.catalog_sync_attempted_at is
  'Most recent worker claim; cleared for retries and by newer catalog webhooks.';
comment on column public.shopify_installs.catalog_sync_attempts is
  'Consecutive failed background catalog sync attempts; reset by a new webhook or success.';
comment on column public.shopify_installs.catalog_sync_error is
  'Sanitized operator-facing error from the latest background catalog sync.';
comment on column public.shopify_installs.catalog_sync_topic is
  'Latest Shopify webhook topic that requested catalog reconciliation.';

create index if not exists shopify_installs_catalog_sync_pending_idx
  on public.shopify_installs (catalog_sync_pending_at)
  where catalog_sync_pending_at is not null
    and page_id is not null
    and uninstalled_at is null;

revoke all on public.shopify_installs from anon, authenticated;
