-- Immutable transaction economics for every Nexez-settled channel.
-- Existing amount/currency/application_fee_cents/commission_percent/channel fields
-- remain in place; these columns add canonical basis points, plan provenance, and
-- commission source without rewriting historical orders.

alter table public.checkout_orders
  add column if not exists commission_bps integer,
  add column if not exists plan_id_at_purchase text,
  add column if not exists commission_source text;

alter table public.checkout_orders
  add constraint checkout_orders_commission_bps_check
    check (commission_bps is null or commission_bps between 0 and 1000),
  add constraint checkout_orders_plan_id_at_purchase_check
    check (
      plan_id_at_purchase is null
      or plan_id_at_purchase in ('free', 'launch', 'pro', 'scale', 'enterprise')
    ),
  add constraint checkout_orders_commission_source_check
    check (
      commission_source is null
      or commission_source in ('plan_default', 'enterprise_override', 'promotion')
    );

alter table public.agent_negotiations
  add column if not exists commission_bps integer,
  add column if not exists plan_id_at_purchase text,
  add column if not exists commission_source text;

alter table public.agent_negotiations
  add constraint agent_negotiations_commission_bps_check
    check (commission_bps is null or commission_bps between 0 and 1000),
  add constraint agent_negotiations_plan_id_at_purchase_check
    check (
      plan_id_at_purchase is null
      or plan_id_at_purchase in ('free', 'launch', 'pro', 'scale', 'enterprise')
    ),
  add constraint agent_negotiations_commission_source_check
    check (
      commission_source is null
      or commission_source in ('plan_default', 'enterprise_override', 'promotion')
    );

comment on column public.checkout_orders.commission_bps is
  'Canonical Nexez commission basis points snapshotted at charge time.';
comment on column public.checkout_orders.plan_id_at_purchase is
  'Effective owner plan snapshotted at charge time; later plan changes do not rewrite it.';
comment on column public.checkout_orders.commission_source is
  'Rate provenance at charge time: plan_default, enterprise_override, or promotion.';

comment on column public.agent_negotiations.commission_bps is
  'Canonical Nexez commission basis points snapshotted when the agreement is funded.';
comment on column public.agent_negotiations.plan_id_at_purchase is
  'Effective owner plan snapshotted when the agreement is funded.';
comment on column public.agent_negotiations.commission_source is
  'Rate provenance when the agreement is funded.';
