-- Burst 2: first-class post-settlement reversal statuses.
--   refunded  — owner refunded a captured payment, or Stripe charge.refunded fired
--   disputed  — buyer chargeback (charge.dispute.created)
-- Widen the status CHECK to include them. Idempotent.

alter table public.agent_negotiations drop constraint if exists agent_negotiations_status_check;
alter table public.agent_negotiations
  add constraint agent_negotiations_status_check
  check (status = any (array[
    'negotiation','agreement_proposed','held','complete','declined','expired','refunded','disputed'
  ]));
