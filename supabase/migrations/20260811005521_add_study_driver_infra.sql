-- In-database driver for the agent-readiness study run. pg_cron invokes
-- study_drive once a minute; it first works through the seed queue (Overpass
-- seed calls, polite and under the runner route's 6/min limit), then fires one
-- scan batch per minute until the cohort is exhausted. The runner bearer token
-- is passed as an argument by the scheduled command (per the study runbook);
-- nothing here stores it.
-- NOTE: superseded in part by 20260811010057_study_driver_seed_retry.sql,
-- which adds attempt-capped retry for Overpass load-shedding and is the
-- version that ran cohort readiness-2026-08.

create extension if not exists pg_cron;

create table if not exists public.study_seed_queue (
  id uuid primary key default gen_random_uuid(),
  cohort text not null,
  metro_key text not null,
  vertical text not null,
  request_id bigint,
  requested_at timestamptz,
  unique (cohort, metro_key, vertical)
);

alter table public.study_seed_queue enable row level security;
-- No policies: operational scaffolding, service-role/postgres only.
revoke all privileges on table public.study_seed_queue from anon, authenticated;

create or replace function public.study_drive(bearer text, cohort_label text)
returns void
language plpgsql
as $$
declare
  cell record;
  fired integer := 0;
begin
  for cell in
    select id, metro_key, vertical
    from public.study_seed_queue
    where cohort = cohort_label and request_id is null
    order by metro_key, vertical
    limit 3
  loop
    update public.study_seed_queue
    set request_id = net.http_post(
          url := 'https://app.nexez.ai/api/internal/agent-readiness-study',
          body := jsonb_build_object(
            'action', 'seed',
            'cohort', cohort_label,
            'metroKey', cell.metro_key,
            'vertical', cell.vertical,
            'cap', 14
          ),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || bearer
          ),
          timeout_milliseconds := 55000
        ),
        requested_at = now()
    where id = cell.id;
    fired := fired + 1;
  end loop;

  -- Seeding done: drive one polite scan batch per minute. Firing on an empty
  -- claim set is a harmless no-op; the job is unscheduled when the run ends.
  if fired = 0 then
    perform net.http_post(
      url := 'https://app.nexez.ai/api/internal/agent-readiness-study',
      body := jsonb_build_object('action', 'scan', 'cohort', cohort_label, 'batchSize', 6),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || bearer
      ),
      timeout_milliseconds := 58000
    );
  end if;
end
$$;

revoke all on function public.study_drive(text, text) from public, anon, authenticated;
