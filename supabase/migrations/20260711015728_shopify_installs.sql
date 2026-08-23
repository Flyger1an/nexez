-- Shopify app installs: bridges a Shopify shop domain (OAuth grant per store) to
-- a Nexez owner/listing. Dormant until the Shopify app is wired (SHOPIFY_API_KEY);
-- the offline access token is encrypted at rest (INTEGRATION_SECRET_KEY) and the
-- table is SERVICE-ROLE ONLY - RLS on with no policies + grants revoked from the
-- browser roles, so a token can never reach an anon/authenticated client (mirrors
-- the page_secrets posture).

create table if not exists public.shopify_installs (
  shop_domain             text primary key,
  owner_id                uuid references auth.users (id) on delete cascade,
  page_id                 uuid references public.pages (id) on delete set null,
  offline_token_encrypted text,
  scope                   text,
  installed_at            timestamptz not null default now(),
  uninstalled_at          timestamptz
);

comment on table public.shopify_installs is
  'Shopify shop -> Nexez owner/listing map + encrypted offline token. Service-role only.';

create index if not exists shopify_installs_owner_idx on public.shopify_installs (owner_id);
create index if not exists shopify_installs_page_idx on public.shopify_installs (page_id);

alter table public.shopify_installs enable row level security;

-- No RLS policies are created: with RLS enabled and no policy, anon/authenticated
-- get zero rows even if a grant slipped through. Belt-and-suspenders: revoke the
-- table grants from the browser roles so only the service role touches it.
revoke all on public.shopify_installs from anon, authenticated;
