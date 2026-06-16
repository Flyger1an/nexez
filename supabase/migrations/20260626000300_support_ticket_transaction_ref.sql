-- Support tickets: let a seller file an issue tied to a specific transaction
-- (a negotiation/order id or Stripe session) so money issues become trackable cases
-- instead of generic tickets. Adds a 'transaction' category + a free-text reference.
-- Idempotent + additive.

alter table public.support_tickets drop constraint if exists support_tickets_category_check;
alter table public.support_tickets add constraint support_tickets_category_check
  check (category in ('general', 'page_setup', 'agent_visibility', 'integrations', 'billing', 'bug', 'feature_request', 'transaction'));

alter table public.support_tickets add column if not exists reference text;
