-- Overpass load-sheds (429/504) under load; make seeding self-healing. Cells
-- whose seed call returned non-200 are requeued after a cooldown, capped at 4
-- attempts, and the pace drops to 2 seed calls per minute. This is the driver
-- version that ran cohort readiness-2026-08.

alter table public.study_seed_queue add column if not exists attempts integer not null default 0;

create or replace function public.study_drive(bearer text, cohort_label text)
returns void
language plpgsql
as $$
declare
  cell record;
  fired integer := 0;
begin
  -- Requeue failed seed calls (non-200 response, seen after a 3 minute
  -- cooldown, under the attempt cap). Missing response rows are treated as
  -- in-flight and left alone.
  update public.study_seed_queue q
  set request_id = null, requested_at = null
  from net._http_response r
  where q.cohort = cohort_label
    and q.request_id = r.id
    and r.status_code is distinct from 200
    and q.requested_at < now() - interval '3 minutes'
    and q.attempts < 4;

  for cell in
    select id, metro_key, vertical
    from public.study_seed_queue
    where cohort = cohort_label and request_id is null and attempts < 4
    order by attempts, metro_key, vertical
    limit 2
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
        requested_at = now(),
        attempts = attempts + 1
    where id = cell.id;
    fired := fired + 1;
  end loop;

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

-- Backfill attempts for cells already fired once.
update public.study_seed_queue set attempts = 1 where request_id is not null and attempts = 0;
