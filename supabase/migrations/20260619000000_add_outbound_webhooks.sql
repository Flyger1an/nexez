-- Account-level outbound webhooks (Tools → Developer platform).
-- Owners register endpoint URLs; Nexez delivers HMAC-signed events to them on
-- bookings and checkout/re-sync activity across all of the owner's pages.
-- Per-page webhooks (page_secrets.outbound_webhooks) are unchanged; these fire
-- in addition, scoped to the owner rather than a single page.
create table if not exists public.outbound_webhooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  -- Per-endpoint signing secret. Sent back as X-Nexez-Signature: t=<ts>,v1=<hmac>.
  secret text not null,
  active boolean not null default true,
  last_delivery_at timestamptz,
  last_status text,
  created_at timestamptz not null default now()
);

create index if not exists outbound_webhooks_owner_idx on public.outbound_webhooks (owner_id, created_at desc);

alter table public.outbound_webhooks enable row level security;

grant select, insert, update, delete on public.outbound_webhooks to authenticated;

drop policy if exists "owners manage own outbound webhooks" on public.outbound_webhooks;
create policy "owners manage own outbound webhooks"
  on public.outbound_webhooks
  for all
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
