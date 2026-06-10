-- Extend billing_subscriptions for Stripe Connect (owner accounts for transactions)
-- and commission tracking. This supports the dual revenue model:
-- - Subscriptions: Nexez Billing (only paid plans)
-- - Transactions: Owner's Connect account + Nexez Application Fee (ALL plans incl. Free)

ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_connect_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS commission_percent numeric DEFAULT 15;  -- effective % at time of sub / can be updated

-- Update the plan_id check to support all plans including free and enterprise
ALTER TABLE public.billing_subscriptions
  DROP CONSTRAINT IF EXISTS billing_subscriptions_plan_id_check;

ALTER TABLE public.billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_plan_id_check
  CHECK (plan_id IS NULL OR plan_id IN ('free', 'launch', 'pro', 'scale', 'enterprise'));

-- Indexes for Connect lookups and commission queries
CREATE INDEX IF NOT EXISTS billing_subscriptions_connect_account_idx
  ON public.billing_subscriptions (stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS billing_subscriptions_commission_idx
  ON public.billing_subscriptions (commission_percent);

-- Note: commission_percent should be set on insert/update based on the plan's rate from lib/billing.ts
-- (Free=15%, Launch/Pro=8%, Scale=6%, Enterprise=custom). You can backfill existing rows.