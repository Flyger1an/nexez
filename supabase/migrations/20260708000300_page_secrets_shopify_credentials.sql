-- Per-page Shopify credential storage - the "connect once, re-sync without
-- re-pasting the token" model, mirroring calendly_pat_encrypted. Stores the
-- seller's Shopify {shop domain + Admin API access token} as ONE AES-256-GCM
-- encrypted JSON blob (lib/server/secret-crypto) so a DB dump can't yield a
-- usable token. Service-role read only - the app never returns it to a client;
-- the seller sees a "connected" boolean and can overwrite or disconnect it.

alter table public.page_secrets
  add column if not exists shopify_credentials_encrypted text;

-- page_secrets uses COLUMN-level SELECT grants for `authenticated` (see
-- 20260708000000): a new column gets NO grant by default, so it's already
-- carved out of authenticated reads. Make that explicit + intent-documenting.
revoke select (shopify_credentials_encrypted) on public.page_secrets from authenticated;

comment on column public.page_secrets.shopify_credentials_encrypted is
  'AES-256-GCM encrypted JSON {shop, token} for the per-page Shopify connection. Service-role read only; decrypt via lib/server/secret-crypto. Never returned to clients.';
