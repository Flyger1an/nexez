-- Promote Shopify installs from a catalog connector to a first-class sales
-- channel and Shopify-managed billing source. These fields stay service-role
-- only with the rest of shopify_installs.

alter table public.shopify_installs
  add column if not exists shop_gid text,
  add column if not exists channel_id text,
  add column if not exists channel_handle text,
  add column if not exists channel_specification_handle text,
  add column if not exists channel_connected_at timestamptz,
  add column if not exists shopify_plan_handle text,
  add column if not exists shopify_billing_status text,
  add column if not exists shopify_billing_verified_at timestamptz;

comment on column public.shopify_installs.shop_gid is
  'Shopify Admin GraphQL Shop GID used for Partner API subscription checks.';
comment on column public.shopify_installs.channel_id is
  'Shopify Channel GID created from the deployed Nexez channel specification.';
comment on column public.shopify_installs.channel_handle is
  'Stable handle for this shop-to-Nexez sales channel connection.';
comment on column public.shopify_installs.channel_specification_handle is
  'Deployed channel specification used to create the connection.';
comment on column public.shopify_installs.channel_connected_at is
  'Last time Shopify confirmed the sales channel connection.';
comment on column public.shopify_installs.shopify_plan_handle is
  'Shopify App Pricing plan handle returned by the hosted plan approval flow.';
comment on column public.shopify_installs.shopify_billing_status is
  'Last verified Shopify App Pricing state: free, active, or attention.';
comment on column public.shopify_installs.shopify_billing_verified_at is
  'Last successful Partner API subscription verification.';

create unique index if not exists shopify_installs_channel_id_idx
  on public.shopify_installs (channel_id)
  where channel_id is not null;

revoke all on public.shopify_installs from public, anon, authenticated;
grant select, insert, update, delete on public.shopify_installs to service_role;
