-- Burst 1: the autonomous ('auto') settlement path captures immediately, so the
-- escrow_mode reaches a 'captured' terminal value. Widen the CHECK to allow it.
-- Idempotent.

alter table public.agent_negotiations drop constraint if exists agent_negotiations_escrow_mode_check;
alter table public.agent_negotiations
  add constraint agent_negotiations_escrow_mode_check
  check (escrow_mode = any (array['not_configured','manual_capture_ready','manual_capture_created','captured']));
