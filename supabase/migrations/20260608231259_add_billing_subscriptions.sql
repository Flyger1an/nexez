create table if not exists public.billing_subscriptions (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  plan_id text check (plan_id is null or plan_id in ('launch', 'pro', 'scale')),
  status text not null default 'unconfigured',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  checkout_session_id text,
  latest_invoice_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists billing_subscriptions_customer_uidx
  on public.billing_subscriptions (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists billing_subscriptions_subscription_uidx
  on public.billing_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

create index if not exists billing_subscriptions_status_idx
  on public.billing_subscriptions (status, updated_at desc);

create or replace function public.set_billing_subscriptions_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

alter function public.set_billing_subscriptions_updated_at() set search_path = '';

drop trigger if exists billing_subscriptions_set_updated_at on public.billing_subscriptions;
create trigger billing_subscriptions_set_updated_at
  before update on public.billing_subscriptions
  for each row
  execute function public.set_billing_subscriptions_updated_at();

alter table public.billing_subscriptions enable row level security;

grant select on public.billing_subscriptions to authenticated;

drop policy if exists "owners read own billing subscription" on public.billing_subscriptions;
create policy "owners read own billing subscription"
  on public.billing_subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);
