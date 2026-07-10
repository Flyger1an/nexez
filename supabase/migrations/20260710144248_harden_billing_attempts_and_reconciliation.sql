-- One active checkout attempt per owner prevents concurrent tabs/retries from
-- creating multiple Stripe subscriptions or hosted Checkout Sessions. The table
-- is an internal service-role coordination primitive: clients receive no grants
-- and no RLS policies.
create table if not exists public.billing_checkout_attempts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  attempt_key uuid not null,
  plan_id text not null check (plan_id in ('launch', 'pro', 'scale')),
  flow text not null check (flow in ('embedded', 'hosted')),
  state text not null default 'initializing' check (state in ('initializing', 'ready')),
  stripe_object_id text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.billing_checkout_attempts enable row level security;

revoke all on table public.billing_checkout_attempts from anon, authenticated;
grant select, insert, update, delete on table public.billing_checkout_attempts to service_role;

drop policy if exists "billing checkout attempts are server only"
  on public.billing_checkout_attempts;
create policy "billing checkout attempts are server only"
  on public.billing_checkout_attempts
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.billing_checkout_attempts is
  'Server-only, per-owner claim used to serialize Stripe subscription checkout creation.';

-- Fair reconciliation cursor. Ordering oldest/null first and stamping every
-- scanned row rotates the bounded hourly batch through the entire customer set.
alter table public.billing_subscriptions
  add column if not exists last_reconciled_at timestamptz;

create index if not exists billing_subscriptions_reconcile_cursor_idx
  on public.billing_subscriptions (last_reconciled_at asc nulls first, owner_id)
  where stripe_customer_id is not null;

comment on column public.billing_subscriptions.last_reconciled_at is
  'Last time the Stripe reconciliation cron inspected this owner; drives fair keyset-like rotation.';
