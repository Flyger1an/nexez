alter table public.shopify_installs
  add column if not exists link_token_hash text,
  add column if not exists link_token_expires_at timestamptz;

create unique index if not exists shopify_installs_link_token_hash_idx
  on public.shopify_installs (link_token_hash)
  where link_token_hash is not null;

comment on column public.shopify_installs.link_token_hash is
  'SHA-256 digest of a short-lived, single-use embedded-app account-link token.';

comment on column public.shopify_installs.link_token_expires_at is
  'Expiry for the embedded Shopify account-link token. Tokens are cleared when consumed.';
