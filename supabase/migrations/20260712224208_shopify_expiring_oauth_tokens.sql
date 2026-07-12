-- Shopify requires new public apps to use expiring offline access tokens. Keep
-- both rotating credentials encrypted at rest and record the lifecycle fields
-- needed to refresh safely without merchant interaction.

alter table public.shopify_installs
  add column if not exists refresh_token_encrypted text,
  add column if not exists access_token_expires_at timestamptz,
  add column if not exists refresh_token_expires_at timestamptz,
  add column if not exists linked_at timestamptz,
  add column if not exists last_synced_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

comment on column public.shopify_installs.refresh_token_encrypted is
  'AES-256-GCM encrypted rotating Shopify offline refresh token.';
comment on column public.shopify_installs.access_token_expires_at is
  'Expiry of the encrypted Shopify offline access token.';
comment on column public.shopify_installs.refresh_token_expires_at is
  'Expiry of the encrypted rotating Shopify refresh token.';
comment on column public.shopify_installs.linked_at is
  'When this installation was explicitly linked to a Nexez listing.';
comment on column public.shopify_installs.last_synced_at is
  'Last successful OAuth-backed Shopify catalog sync.';

-- OAuth sync resolves the newest active install for a listing. A partial index
-- keeps that service-role lookup cheap without indexing unlinked/uninstalled rows.
create index if not exists shopify_installs_active_page_idx
  on public.shopify_installs (page_id, linked_at desc)
  where page_id is not null and uninstalled_at is null;

-- The table remains service-role only. New columns inherit no browser grants,
-- and these revokes preserve the existing defense-in-depth posture.
revoke all on public.shopify_installs from anon, authenticated;
