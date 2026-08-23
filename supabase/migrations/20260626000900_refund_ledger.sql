-- In-app PARTIAL refunds need a cumulative-refunded ledger to be safe: without a
-- running total, two equal-amount partials collide on the Stripe idempotency key
-- (Stripe returns the cached first refund → the buyer is silently under-refunded).
--
-- refunded_cents is the cumulative amount refunded so far, in Stripe smallest-unit
-- (matching session.amount_total / charge.amount_refunded, what formatCurrencyAmount
-- expects - NOT the app's major×100 minor convention used by agent_negotiations.amount_cents).
-- The refund routes cap each refund on (captured − refunded_cents) and key idempotency
-- on the new running total; the charge.refunded webhook reconciles it to Stripe's
-- authoritative amount_refunded. Idempotent + additive (existing code ignores it).

alter table public.agent_negotiations add column if not exists refunded_cents integer not null default 0;
alter table public.checkout_orders   add column if not exists refunded_cents integer not null default 0;

alter table public.agent_negotiations drop constraint if exists agent_negotiations_refunded_cents_nonneg;
alter table public.agent_negotiations add constraint agent_negotiations_refunded_cents_nonneg check (refunded_cents >= 0);
alter table public.checkout_orders   drop constraint if exists checkout_orders_refunded_cents_nonneg;
alter table public.checkout_orders   add constraint checkout_orders_refunded_cents_nonneg check (refunded_cents >= 0);

-- Backfill already-reversed rows from the metadata the webhook/route already wrote,
-- so the ledger is accurate from day one (refund = full; partial_refund = cumulative).
update public.agent_negotiations
set refunded_cents = coalesce(
  nullif(metadata->'refund'->>'amount_cents','')::int,
  nullif(metadata->'partial_refund'->>'amount_cents','')::int,
  0)
where refunded_cents = 0 and (metadata ? 'refund' or metadata ? 'partial_refund');

update public.checkout_orders
set refunded_cents = coalesce(
  nullif(metadata->'refund'->>'amount_cents','')::int,
  nullif(metadata->'partial_refund'->>'amount_cents','')::int,
  0)
where refunded_cents = 0 and (metadata ? 'refund' or metadata ? 'partial_refund');
