-- Recurring service commerce is distinct from Nexez SaaS billing. A merchant
-- service agreement owns the buyer-approved recurring contract; each paid
-- service period is still a normal checkout_order linked back to that agreement.

create table if not exists public.service_agreements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid references public.pages(id) on delete set null,
  slug text,
  offer_key text not null check (char_length(offer_key) between 1 and 160),
  offer_name text not null check (char_length(offer_name) between 1 and 240),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'past_due', 'canceling', 'canceled')),
  contract_snapshot jsonb not null
    check (jsonb_typeof(contract_snapshot) = 'object' and octet_length(contract_snapshot::text) <= 131072),
  contract_fingerprint text not null check (contract_fingerprint ~ '^[a-f0-9]{64}$'),
  amount_per_period_cents bigint not null check (amount_per_period_cents > 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  stripe_connect_account_id text not null,
  stripe_checkout_session_id text unique,
  stripe_subscription_id text unique,
  stripe_livemode boolean,
  commission_bps integer check (commission_bps is null or commission_bps between 0 and 1000),
  plan_id_at_purchase text check (plan_id_at_purchase is null or plan_id_at_purchase in ('free', 'launch', 'pro', 'scale', 'enterprise')),
  commission_source text check (commission_source is null or commission_source in ('plan_default', 'enterprise_override', 'promotion')),
  buyer_email text,
  buyer_name text,
  buyer_reference text,
  buyer_agent text,
  access_token_sha256 text not null check (access_token_sha256 ~ '^[a-f0-9]{64}$'),
  access_token_encrypted text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  started_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_period_end is null or current_period_start is null or current_period_end > current_period_start)
);

create unique index if not exists service_agreements_access_token_sha256_uidx
  on public.service_agreements (access_token_sha256);
create index if not exists service_agreements_owner_created_idx
  on public.service_agreements (owner_id, created_at desc);
create index if not exists service_agreements_pending_created_idx
  on public.service_agreements (created_at)
  where status = 'pending';

comment on table public.service_agreements is
  'Merchant recurring-service agreements. Distinct from billing_subscriptions, which is Nexez SaaS plan billing.';
comment on column public.service_agreements.contract_snapshot is
  'Exact buyer-approved recurring contract: merchant terms, resolved cadence, normalized buyer configuration, and per-period pricing provenance.';
comment on column public.service_agreements.contract_fingerprint is
  'SHA-256 action hash of the exact recurring contract snapshot bound into buyer approval and Stripe metadata.';

alter table public.service_agreements enable row level security;
revoke all on public.service_agreements from anon;
revoke all on public.service_agreements from authenticated;
grant select on public.service_agreements to authenticated;
grant select, insert, update, delete on public.service_agreements to service_role;

drop policy if exists service_agreements_owner_select on public.service_agreements;
create policy service_agreements_owner_select
  on public.service_agreements
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

-- A paid subscription invoice is still a Nexez commerce order. Extend the order
-- ledger with immutable Stripe invoice + service-period lineage rather than
-- creating a second money ledger that would bypass refunds/disputes/economics.
alter table public.checkout_orders
  add column if not exists service_agreement_id uuid references public.service_agreements(id) on delete set null,
  add column if not exists stripe_invoice_id text,
  add column if not exists service_period_start timestamptz,
  add column if not exists service_period_end timestamptz;

create unique index if not exists checkout_orders_stripe_invoice_uidx
  on public.checkout_orders (stripe_invoice_id)
  where stripe_invoice_id is not null;
create index if not exists checkout_orders_service_agreement_idx
  on public.checkout_orders (service_agreement_id, service_period_start desc)
  where service_agreement_id is not null;

alter table public.checkout_orders
  drop constraint if exists checkout_orders_service_period_check,
  add constraint checkout_orders_service_period_check
    check (
      service_period_end is null
      or service_period_start is null
      or service_period_end > service_period_start
    ),
  drop constraint if exists checkout_orders_channel_check,
  add constraint checkout_orders_channel_check
    check (
      channel is null
      or channel in ('agent_checkout', 'acp', 'ucp', 'negotiation', 'nexie', 'recurring_service')
    );

comment on column public.checkout_orders.service_agreement_id is
  'Recurring service agreement that obligated this paid service period, when channel=recurring_service.';
comment on column public.checkout_orders.stripe_invoice_id is
  'Stripe subscription invoice that funded this recurring service occurrence.';
comment on column public.checkout_orders.service_period_start is
  'Inclusive start of the paid recurring service obligation window.';
comment on column public.checkout_orders.service_period_end is
  'Exclusive end of the paid recurring service obligation window.';

-- Abandoned Checkout sessions never become agreements. Keep failed/pending drafts
-- from accumulating forever without touching active commerce records.
do $cleanup_schedule$
declare
  existing_job bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for existing_job in
      select jobid from cron.job where jobname = 'nexez_cleanup_pending_service_agreements'
    loop
      perform cron.unschedule(existing_job);
    end loop;

    perform cron.schedule(
      'nexez_cleanup_pending_service_agreements',
      '29 * * * *',
      $$delete from public.service_agreements where status = 'pending' and created_at <= now() - interval '48 hours'$$
    );
  end if;
end
$cleanup_schedule$;
