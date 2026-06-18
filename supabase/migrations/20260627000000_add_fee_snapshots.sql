-- Finance fee historical snapshot (red-team follow-up).
-- Commission and application_fee can change over time (plan changes, refunds).
-- Snapshot the *effective* values at charge time so historical rollups in finance
-- dashboard and analytics are accurate instead of always deriving from current plan.

alter table public.checkout_orders
  add column if not exists commission_percent numeric;

alter table public.agent_negotiations
  add column if not exists commission_percent numeric,
  add column if not exists application_fee_cents integer;

-- Backfill not required (historical will use current-plan derivation as before until new charges).
-- New charges will populate via the pay/checkout paths + webhook.

comment on column public.checkout_orders.commission_percent is 'Plan commission % snapshot at charge time for accurate historical fees';
comment on column public.checkout_orders.application_fee_cents is 'Actual application fee snapshot (already present; commission added for parity)';
comment on column public.agent_negotiations.commission_percent is 'Plan commission % snapshot at agreement/charge for historical accuracy';
comment on column public.agent_negotiations.application_fee_cents is 'Application fee cents snapshot at pay time';