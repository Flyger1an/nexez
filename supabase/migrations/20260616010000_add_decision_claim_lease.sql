-- Burst 3a fix: claim the async decision with a LEASE, not by clearing
-- decision_pending early.
--
-- Originally runDecision() flipped decision_pending=false at claim time to win
-- the exactly-once race. But the LLM then runs for several seconds, so an agent
-- polling /api/negotiations/status in that window saw decision_pending=false with
-- no decision yet (a confusing "limbo"). Instead the claim now stamps
-- decision_claimed_at (a short lease); decision_pending stays true — and visible
-- as "responding" — until the decision is actually persisted. A concurrent
-- after()/cron loses the lease (claimed within the window); a crashed worker's
-- lease expires so the backstop cron re-drives it. Idempotent.

alter table public.agent_negotiations
  add column if not exists decision_claimed_at timestamptz;
