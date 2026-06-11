-- Burst 1: hybrid settlement fields on agent_negotiations.
--   settlement_state: 'auto' (low value, buyer self-serve immediate capture)
--                   | 'awaiting_approval' (high value, parked for owner)
--                   | 'approved' (owner approved -> buyer pay link active)
--   stripe_checkout_session_id: cached buyer Checkout session for idempotent pay links.
-- Both nullable; existing rows + old code are unaffected. Idempotent.

alter table public.agent_negotiations
  add column if not exists settlement_state text,
  add column if not exists stripe_checkout_session_id text;
