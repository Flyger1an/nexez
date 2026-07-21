-- Marketplace launch curation is intentionally separate from storefront publication.
-- A seller can keep a directly reachable public page while platform operators exclude
-- an internal, duplicate, or low-quality listing from discovery surfaces. Review notes
-- stay server-only; the public projection exposes only the resulting boolean gate.

create table public.marketplace_curations (
  page_id uuid primary key references public.pages(id) on delete cascade,
  status text not null default 'unreviewed'
    check (status in ('unreviewed', 'candidate', 'certified', 'excluded')),
  decision_reason text,
  notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  certified_at timestamptz,
  quality_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_curations_exclusion_reason_check
    check (status <> 'excluded' or nullif(btrim(decision_reason), '') is not null)
);

create index marketplace_curations_status_updated_idx
  on public.marketplace_curations (status, updated_at desc);

create table public.marketplace_curation_events (
  id bigint generated always as identity primary key,
  page_id uuid not null references public.pages(id) on delete cascade,
  from_status text
    check (from_status is null or from_status in ('unreviewed', 'candidate', 'certified', 'excluded')),
  to_status text not null
    check (to_status in ('unreviewed', 'candidate', 'certified', 'excluded')),
  reason text,
  actor_id uuid references auth.users(id) on delete set null,
  quality_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index marketplace_curation_events_page_created_idx
  on public.marketplace_curation_events (page_id, created_at desc);

alter table public.marketplace_curations enable row level security;
alter table public.marketplace_curation_events enable row level security;

revoke all on table public.marketplace_curations from public, anon, authenticated, service_role;
revoke all on table public.marketplace_curation_events from public, anon, authenticated, service_role;
revoke all on sequence public.marketplace_curation_events_id_seq from public, anon, authenticated, service_role;

grant select, insert, update on table public.marketplace_curations to service_role;
grant select on table public.marketplace_curation_events to service_role;

-- Explicit deny policies document that these are service-only operational ledgers and
-- keep the RLS advisor quiet. The service role bypasses RLS but still needs the ACLs above.
create policy "No client access to marketplace curations"
  on public.marketplace_curations
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "No client access to marketplace curation events"
  on public.marketplace_curation_events
  for all
  to anon, authenticated
  using (false)
  with check (false);

create or replace function private.nz_touch_marketplace_curation()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.nz_touch_marketplace_curation() from public, anon, authenticated, service_role;

create trigger trg_touch_marketplace_curation
  before update on public.marketplace_curations
  for each row execute function private.nz_touch_marketplace_curation();

create or replace function private.nz_audit_marketplace_curation()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if tg_op = 'INSERT'
     or new.status is distinct from old.status
     or new.decision_reason is distinct from old.decision_reason
     or new.notes is distinct from old.notes
     or new.quality_snapshot is distinct from old.quality_snapshot then
    insert into public.marketplace_curation_events (
      page_id,
      from_status,
      to_status,
      reason,
      actor_id,
      quality_snapshot
    ) values (
      new.page_id,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status,
      new.decision_reason,
      new.reviewed_by,
      new.quality_snapshot
    );
  end if;
  return new;
end;
$$;
revoke all on function private.nz_audit_marketplace_curation() from public, anon, authenticated, service_role;

create trigger trg_audit_marketplace_curation
  after insert or update on public.marketplace_curations
  for each row execute function private.nz_audit_marketplace_curation();

create or replace function private.nz_reject_marketplace_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  raise exception 'marketplace curation events are append-only';
end;
$$;
revoke all on function private.nz_reject_marketplace_event_mutation() from public, anon, authenticated, service_role;

create trigger trg_marketplace_events_append_only
  before update or delete on public.marketplace_curation_events
  for each row execute function private.nz_reject_marketplace_event_mutation();

alter table public.pages_public
  add column if not exists marketplace_discoverable boolean not null default true;

create or replace function private.nz_marketplace_page_discoverable(p_page_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce((
    select c.status <> 'excluded'
    from public.marketplace_curations c
    where c.page_id = p_page_id
  ), true);
$$;
revoke all on function private.nz_marketplace_page_discoverable(uuid) from public, anon, authenticated, service_role;

-- This trigger makes the existing pages -> pages_public projection sync forward-compatible:
-- new rows derive the curation gate even though the older sync function does not name it.
create or replace function private.nz_derive_marketplace_discoverable()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  new.marketplace_discoverable = private.nz_marketplace_page_discoverable(new.id);
  return new;
end;
$$;
revoke all on function private.nz_derive_marketplace_discoverable() from public, anon, authenticated, service_role;

create trigger trg_derive_marketplace_discoverable
  before insert or update on public.pages_public
  for each row execute function private.nz_derive_marketplace_discoverable();

create or replace function private.nz_sync_marketplace_discoverable()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  update public.pages_public
  set marketplace_discoverable = (new.status <> 'excluded')
  where id = new.page_id;
  return new;
end;
$$;
revoke all on function private.nz_sync_marketplace_discoverable() from public, anon, authenticated, service_role;

create trigger trg_sync_marketplace_discoverable
  after insert or update of status on public.marketplace_curations
  for each row execute function private.nz_sync_marketplace_discoverable();

update public.pages_public
set marketplace_discoverable = private.nz_marketplace_page_discoverable(id);

-- Exclude only unmistakable internal fixtures at cutover. Their direct storefront and
-- certification URLs remain live; customer-looking rows are left for human review.
insert into public.marketplace_curations (
  page_id,
  status,
  decision_reason,
  notes,
  reviewed_at,
  quality_snapshot
)
select
  p.id,
  'excluded',
  'Internal QA or certification listing; direct access retained.',
  'Automatically classified during marketplace curation rollout.',
  now(),
  jsonb_build_object('source', 'marketplace_curation_rollout', 'slug', p.slug)
from public.pages p
where p.is_published is true
  and (
    p.slug ~* '^qa[0-9]{1,4}[-_][0-9]{1,4}$'
    or p.slug ~* '^(qa|test|seed|gauntlet|red[-_]?team|adversarial)([-_]|$)'
    or p.slug in ('nexez-agent-negotiation-lab', 'shopify-review-catalog')
  )
on conflict (page_id) do nothing;
