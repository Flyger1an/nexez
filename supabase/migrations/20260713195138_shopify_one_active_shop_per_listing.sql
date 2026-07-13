-- A public listing is the catalog boundary served by the Shopify app proxy.
-- Two active stores on one listing would expose a combined catalog to both
-- storefronts, so enforce the same one-store-per-listing invariant as the app.
create unique index if not exists shopify_installs_one_active_shop_per_listing
  on public.shopify_installs (page_id)
  where page_id is not null and uninstalled_at is null;

comment on index public.shopify_installs_one_active_shop_per_listing is
  'A Nexez listing can receive catalog data from only one active Shopify installation.';
