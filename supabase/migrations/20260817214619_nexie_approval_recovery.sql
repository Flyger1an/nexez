-- Make an APPROVED Nexie action recoverable after a crash.
--
-- `approveAction` claims an approval with a compare-and-swap (PENDING -> APPROVED),
-- then executes the money action in-process, then writes EXECUTED or FAILED. The CAS
-- is correct and stops two concurrent requests from both executing.
--
-- What it cannot survive is the process dying between the claim and the terminal
-- write. The row is left APPROVED with `completed_at` null, and because the CAS
-- requires `status = 'PENDING'`, nothing can ever reclaim it. The action is wedged
-- permanently, and the buyer is told nothing.
--
-- A sweep can finish the job because the action is replay-safe: the idempotency key
-- is deterministic (`nexie:<approval id>:approved-action`) and is sent as an
-- `idempotency-key` header, so re-invoking returns the ORIGINAL negotiation or
-- booking rather than creating a second one. That is why the recovery retries rather
-- than marking the row FAILED: if the crash happened AFTER the action succeeded,
-- FAILED would be a lie, and a buyer acting on it could double-book.
--
-- `recovery_attempted_at` is the sweep's lease. Claiming a row stamps it, so a
-- concurrent or immediately-following run skips it, and an action that fails
-- repeatedly is not retried forever.

alter table public.agent_action_approvals
  add column if not exists recovery_attempted_at timestamptz,
  add column if not exists recovery_attempts integer not null default 0;

comment on column public.agent_action_approvals.recovery_attempted_at is
  'When the recovery sweep last claimed this row. Doubles as a lease: a row claimed recently is skipped by the next run. Null means never swept.';
comment on column public.agent_action_approvals.recovery_attempts is
  'How many times the sweep has tried to finish this action. Capped so a permanently failing action stops being retried and is marked FAILED instead.';

-- The sweep looks for APPROVED rows that never reached a terminal state. Partial, so
-- it stays small: the vast majority of rows are EXECUTED and never match.
create index if not exists agent_action_approvals_stuck_idx
  on public.agent_action_approvals (decided_at)
  where status = 'APPROVED' and completed_at is null;
