-- Complete the scan-to-Launch funnel without changing the existing publication or
-- grant rules. The scan lead remains the attribution root, then immutable server
-- stamps record the onboarding, account, publication, and grant milestones.

alter table public.scan_leads
  add column if not exists onboarding_token_hash text,
  add column if not exists onboarding_opened_at timestamptz,
  add column if not exists converted_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists grant_activated_at timestamptz;

create unique index if not exists scan_leads_onboarding_token_hash_idx
  on public.scan_leads (onboarding_token_hash)
  where onboarding_token_hash is not null;

create index if not exists scan_leads_funnel_created_at_idx
  on public.scan_leads (created_at desc);

alter table public.scan_leads
  drop constraint if exists scan_leads_onboarding_opened_finite_check,
  add constraint scan_leads_onboarding_opened_finite_check
    check (onboarding_opened_at is null or isfinite(onboarding_opened_at)),
  drop constraint if exists scan_leads_converted_finite_check,
  add constraint scan_leads_converted_finite_check
    check (converted_at is null or isfinite(converted_at)),
  drop constraint if exists scan_leads_published_finite_check,
  add constraint scan_leads_published_finite_check
    check (published_at is null or isfinite(published_at)),
  drop constraint if exists scan_leads_grant_activated_finite_check,
  add constraint scan_leads_grant_activated_finite_check
    check (grant_activated_at is null or isfinite(grant_activated_at));

-- Publication and grant milestones are derived from authoritative owner records,
-- never from a browser event. These triggers also cover merchants who complete a
-- milestone after account conversion.
create or replace function private.nz_stamp_scan_lead_published()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.is_published is true and new.owner_id is not null then
    update public.scan_leads
    set published_at = coalesce(published_at, now())
    where converted_owner_id = new.owner_id
      and published_at is null;
  end if;
  return new;
end;
$$;

revoke all on function private.nz_stamp_scan_lead_published() from public;

drop trigger if exists trg_stamp_scan_lead_published on public.pages;
create trigger trg_stamp_scan_lead_published
  after insert or update of is_published on public.pages
  for each row execute function private.nz_stamp_scan_lead_published();

create or replace function private.nz_stamp_scan_lead_grant()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.status = 'active' and new.owner_id is not null then
    update public.scan_leads
    set grant_activated_at = coalesce(grant_activated_at, new.starts_at, now())
    where converted_owner_id = new.owner_id
      and grant_activated_at is null;
  end if;
  return new;
end;
$$;

revoke all on function private.nz_stamp_scan_lead_grant() from public;

drop trigger if exists trg_stamp_scan_lead_grant on public.promotional_plan_grants;
create trigger trg_stamp_scan_lead_grant
  after insert or update of status, starts_at on public.promotional_plan_grants
  for each row execute function private.nz_stamp_scan_lead_grant();

-- Backfill any already-converted rows so the operator funnel is correct as soon as
-- this migration lands.
update public.scan_leads lead
set converted_at = coalesce(lead.converted_at, lead.updated_at)
where lead.converted_owner_id is not null
  and lead.converted_at is null;

update public.scan_leads lead
set published_at = coalesce(lead.published_at, page.first_published_at, lead.converted_at, now())
from (
  select owner_id, min(created_at) as first_published_at
  from public.pages
  where is_published is true
  group by owner_id
) page
where lead.converted_owner_id = page.owner_id
  and lead.published_at is null;

update public.scan_leads lead
set grant_activated_at = coalesce(lead.grant_activated_at, grant_rows.first_grant_at, now())
from (
  select owner_id, min(starts_at) as first_grant_at
  from public.promotional_plan_grants
  where status = 'active'
  group by owner_id
) grant_rows
where lead.converted_owner_id = grant_rows.owner_id
  and lead.grant_activated_at is null;

-- Make the generic system-email ledger recoverable. Existing rows represented
-- completed sends under the old contract, so backfill them as delivered.
alter table public.sent_system_emails
  add column if not exists delivery_claimed_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists abandoned_at timestamptz,
  add column if not exists delivery_attempts integer not null default 0,
  add column if not exists provider_message_id text,
  add column if not exists last_error text;

update public.sent_system_emails
set delivered_at = coalesce(delivered_at, sent_at)
where delivered_at is null
  and delivery_claimed_at is null
  and delivery_attempts = 0;

alter table public.sent_system_emails
  drop constraint if exists sent_system_emails_attempts_check,
  add constraint sent_system_emails_attempts_check
    check (delivery_attempts between 0 and 3),
  drop constraint if exists sent_system_emails_delivery_claim_finite_check,
  add constraint sent_system_emails_delivery_claim_finite_check
    check (delivery_claimed_at is null or isfinite(delivery_claimed_at)),
  drop constraint if exists sent_system_emails_delivered_finite_check,
  add constraint sent_system_emails_delivered_finite_check
    check (delivered_at is null or isfinite(delivered_at));

create index if not exists sent_system_emails_pending_idx
  on public.sent_system_emails (sent_at)
  where delivered_at is null and abandoned_at is null;

-- Both ledgers stay server-only. RLS and table privileges are independent, so make
-- the exact service operations explicit for projects using opt-in Data API grants.
revoke all on public.scan_leads from anon, authenticated, service_role;
grant select, insert, update, delete on public.scan_leads to service_role;
revoke all on public.sent_system_emails from anon, authenticated, service_role;
grant select, insert, update on public.sent_system_emails to service_role;

-- One bounded operator aggregate avoids loading the full contact ledger into the
-- application just to count funnel stages. SECURITY INVOKER preserves the caller's
-- table privileges and RLS behavior.
create or replace function public.scan_growth_funnel_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $$
  select jsonb_build_object(
    'captured', count(*),
    'delivered', count(*) filter (where delivered_at is not null),
    'onboarding_opened', count(*) filter (where onboarding_opened_at is not null),
    'accounts_created', count(*) filter (where converted_at is not null),
    'published', count(*) filter (where published_at is not null),
    'launch_activated', count(*) filter (where grant_activated_at is not null),
    'pending_delivery', count(*) filter (
      where delivered_at is null
        and abandoned_at is null
        and unsubscribed_at is null
    ),
    'stale_pending', count(*) filter (
      where delivered_at is null
        and abandoned_at is null
        and unsubscribed_at is null
        and consented_at < now() - interval '2 hours'
    ),
    'stale_claims', count(*) filter (
      where delivery_claimed_at < now() - interval '15 minutes'
        and delivered_at is null
        and abandoned_at is null
    ),
    'abandoned', count(*) filter (where abandoned_at is not null),
    'abandoned_24h', count(*) filter (where abandoned_at >= now() - interval '24 hours'),
    'suppressed', count(*) filter (where unsubscribed_at is not null)
  )
  from public.scan_leads;
$$;

revoke all on function public.scan_growth_funnel_snapshot() from public, anon, authenticated;
grant execute on function public.scan_growth_funnel_snapshot() to service_role;
