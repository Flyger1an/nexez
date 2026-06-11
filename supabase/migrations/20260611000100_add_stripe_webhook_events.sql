-- Burst 1: webhook idempotency ledger. The Stripe webhook inserts each event id
-- on receipt; a conflict means it was already processed, so the handler no-ops.
-- Prevents double-applying escrow/billing state on Stripe retries or redelivery.
-- Service-role only (the webhook uses the admin client); no anon grants.

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  type text,
  account text,
  received_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
-- No policies: only the service-role key (which bypasses RLS) reads/writes this.
