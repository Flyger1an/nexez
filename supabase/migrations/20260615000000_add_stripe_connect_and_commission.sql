-- Extend billing_subscriptions for Stripe Connect (for transaction payments on all plans)
-- and commission config. Free plan has no subscription but commission on txns.

alter table public.billing_subscriptions 
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_status text default 'pending',
  add column if not exists stripe_connect_details_submitted boolean default false,
  add column if not exists stripe_connect_charges_enabled boolean default false,
  add column if not exists stripe_connect_payouts_enabled boolean default false;

-- Update plan check to include free and enterprise (additive)
alter table public.billing_subscriptions 
  drop constraint if exists billing_subscriptions_plan_id_check;

alter table public.billing_subscriptions 
  add constraint billing_subscriptions_plan_id_check 
  check (plan_id is null or plan_id in ('free', 'launch', 'pro', 'scale', 'enterprise'));

-- Add index for connect lookups
create index if not exists billing_subscriptions_connect_account_idx 
  on public.billing_subscriptions (stripe_connect_account_id) 
  where stripe_connect_account_id is not null;

-- Note: commission % is now in lib/billing.ts per plan and looked up at payment time.
-- For historical, default 15% on free, lower on paid. Can add column later if needed.

comment on column public.billing_subscriptions.stripe_connect_account_id is 'Stripe Connect Express account ID for the business owner (MoR for transactions). Used for Checkout/PaymentIntent on their account with platform application fee.';
comment on column public.billing_subscriptions.stripe_connect_status is 'Onboarding status from Stripe (pending, active, etc.).';