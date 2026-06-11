-- Burst 3a: asynchronous negotiation decisions.
-- The LLM decision used to run inline/blocking on POST /api/negotiations
-- (~p95 5.5s). It now runs after the response (next/server `after`) with a
-- backstop cron, and agents poll /api/negotiations/status for the outcome.
--
-- These columns drive that flow:
--   decision_pending      - a buyer turn is awaiting an LLM decision
--   decision_requested_at - when the pending decision was queued (cron staleness + latency stamp)
--   decision_seq          - monotonic per-negotiation decision counter (agents detect a new turn)
-- Idempotent.

alter table public.agent_negotiations
  add column if not exists decision_pending boolean not null default false,
  add column if not exists decision_requested_at timestamptz,
  add column if not exists decision_seq integer not null default 0;

-- The backstop cron scans only in-flight rows; a partial index keeps it tiny.
create index if not exists agent_negotiations_decision_pending_idx
  on public.agent_negotiations (decision_requested_at)
  where decision_pending;
