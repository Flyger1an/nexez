-- Smart Rules Phase 1: per-negotiation status token so the submitting agent can
-- poll GET /api/negotiations/status?id=..&token=.. without owner auth. The token
-- is generated server-side at insert and returned exactly once in the POST
-- response; lookups go through the service-role client (owner-only RLS stands).
-- Idempotent.
alter table public.agent_negotiations
  add column if not exists status_token text;

create unique index if not exists agent_negotiations_status_token_uidx
  on public.agent_negotiations (status_token)
  where status_token is not null;
