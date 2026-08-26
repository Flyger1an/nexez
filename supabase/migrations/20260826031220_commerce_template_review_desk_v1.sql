-- Human Commerce Template reviews stay attached to the exact code-owned guide
-- version and the evidence an operator saw. The event stream records review
-- work only. It cannot edit the guide registry, merchant listings, or commerce.
create table public.commerce_template_review_events (
  id uuid primary key default gen_random_uuid(),
  schema_version smallint not null default 1 check (schema_version = 1),
  review_id uuid not null,
  idempotency_key uuid not null unique,
  template_id text not null check (
    char_length(template_id) between 3 and 160
    and template_id ~ '^[a-z0-9]+([.-][a-z0-9]+)+$'
  ),
  template_version integer not null check (template_version > 0),
  review_reason text not null check (
    review_reason in ('performance', 'catalog_overlap', 'replacement', 'manual')
  ),
  event_type text not null check (event_type in ('opened', 'decided')),
  decision text check (decision in ('keep', 'revise', 'recommend_retirement')),
  rationale text not null check (char_length(rationale) between 10 and 2000),
  operator_id uuid not null,
  snapshot_generated_at timestamptz not null,
  evidence_snapshot jsonb not null check (
    jsonb_typeof(evidence_snapshot) = 'object'
    and octet_length(evidence_snapshot::text) <= 32768
  ),
  created_at timestamptz not null default now(),
  constraint commerce_template_review_event_shape check (
    (event_type = 'opened' and decision is null)
    or (event_type = 'decided' and decision is not null)
  ),
  constraint commerce_template_review_snapshot_time check (
    snapshot_generated_at <= created_at + interval '1 minute'
  ),
  constraint commerce_template_review_event_once unique (review_id, event_type)
);

create index commerce_template_review_events_template_created_idx
  on public.commerce_template_review_events (template_id, template_version, created_at desc);

create index commerce_template_review_events_review_created_idx
  on public.commerce_template_review_events (review_id, created_at asc);

alter table public.commerce_template_review_events enable row level security;

revoke all on table public.commerce_template_review_events
  from public, anon, authenticated, service_role;
grant select, insert on table public.commerce_template_review_events to service_role;

create policy "commerce template reviews are server only"
  on public.commerce_template_review_events
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create function private.nz_validate_commerce_template_review_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_opened public.commerce_template_review_events%rowtype;
begin
  -- Serialize work on one exact guide version so two operators cannot open
  -- parallel reviews during the same race window.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.template_id || '@' || new.template_version::text, 0)
  );

  if new.event_type = 'opened' then
    if exists (
      select 1
      from public.commerce_template_review_events existing
      where existing.template_id = new.template_id
        and existing.template_version = new.template_version
        and existing.event_type = 'opened'
        and not exists (
          select 1
          from public.commerce_template_review_events decision_event
          where decision_event.review_id = existing.review_id
            and decision_event.event_type = 'decided'
        )
    ) then
      raise exception 'an open review already exists for this guide version'
        using errcode = '23505';
    end if;

    return new;
  end if;

  select *
  into v_opened
  from public.commerce_template_review_events
  where review_id = new.review_id
    and event_type = 'opened';

  if not found then
    raise exception 'review decision requires an open review'
      using errcode = '23514';
  end if;

  if new.template_id is distinct from v_opened.template_id
    or new.template_version is distinct from v_opened.template_version
    or new.review_reason is distinct from v_opened.review_reason
  then
    raise exception 'review decision identity must match the open review'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.nz_validate_commerce_template_review_event()
  from public, anon, authenticated, service_role;

create trigger nz_validate_commerce_template_review_event
  before insert on public.commerce_template_review_events
  for each row execute function private.nz_validate_commerce_template_review_event();

create function private.nz_reject_commerce_template_review_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'commerce template reviews are append-only'
    using errcode = '55000';
end;
$$;

revoke all on function private.nz_reject_commerce_template_review_mutation()
  from public, anon, authenticated, service_role;

create trigger nz_reject_commerce_template_review_mutation
  before update or delete on public.commerce_template_review_events
  for each row execute function private.nz_reject_commerce_template_review_mutation();

comment on table public.commerce_template_review_events is
  'Append-only human review events for exact code-owned Commerce Template versions.';

comment on column public.commerce_template_review_events.evidence_snapshot is
  'Privacy-minimized server-derived evidence preserved at the time of the event.';

comment on column public.commerce_template_review_events.operator_id is
  'Immutable platform-admin auth identifier captured at event time.';
