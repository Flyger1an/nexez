-- Rotation cursor for the Calendly availability cron. The cron processes a
-- bounded batch of connected pages per run; without an ordering it re-processed
-- the same arbitrary first N every time (Postgres LIMIT without ORDER BY),
-- permanently starving the (N+1)th+ connected seller. Order by this timestamp
-- (least-recently-synced first, NULLs first) and stamp it each run for a fair
-- round-robin. Service-role only (not added to the authenticated column grants;
-- it's internal cron bookkeeping, read via the admin client).

alter table public.page_secrets
  add column if not exists calendly_synced_at timestamptz;

comment on column public.page_secrets.calendly_synced_at is
  'Last time the calendly-availability cron processed this page (rotation cursor; NULL = never). Service-role only.';
