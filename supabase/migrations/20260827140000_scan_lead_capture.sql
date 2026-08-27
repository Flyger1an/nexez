-- Capture for the public readability scan: a visitor runs the scan on the marketing
-- site, asks for the result by email, and has no account yet. That request is the
-- whole basis for writing to them, so the consent that authorises the send is stored
-- on the same row as the address and travels with it.
--
-- This is the ONLY table in the schema holding an address for someone who is not a
-- user, so it carries the obligations that come with that: an explicit consent stamp,
-- a hashed unsubscribe token, an unsubscribe stamp that suppresses future sends, and
-- no free-text notes. Service-role only, like sent_system_emails.
--
-- Delivery state lives here rather than in sent_system_emails because that ledger is
-- keyed on owner_id, and by definition these people have no owner_id yet.

create table if not exists public.scan_leads (
  id                     uuid        primary key default gen_random_uuid(),
  email                  text        not null,
  domain                 text        not null,
  scan_result_id         uuid        references public.scan_results(id) on delete set null,
  score                  integer,
  findings               jsonb       not null default '[]'::jsonb,

  -- Consent. consented_at is when they asked for the result; source records where the
  -- ask happened so a disputed send can be traced to a surface, not just a timestamp.
  consented_at           timestamptz not null default now(),
  consent_source         text        not null default 'scan_page',

  -- Only the hash is stored, so a database read cannot mint a working unsubscribe URL
  -- for someone else's address. Same treatment as seller_growth_invites.token_hash.
  unsubscribe_token_hash text        not null,
  unsubscribed_at        timestamptz,

  -- Delivery. attempts is bounded by the sender so a permanently failing address stops
  -- being retried instead of being hammered every hour forever.
  delivery_claimed_at    timestamptz,
  delivered_at           timestamptz,
  abandoned_at           timestamptz,
  delivery_attempts      integer     not null default 0,
  provider_message_id    text,
  last_error             text,

  -- Set when the address later signs up, which is the only conversion figure that
  -- matters for deciding whether the scan page earns its place.
  converted_owner_id     uuid        references auth.users(id) on delete set null,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint scan_leads_email_normalised_check check (email = lower(btrim(email))),
  constraint scan_leads_email_shape_check       check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint scan_leads_domain_normalised_check check (domain = lower(btrim(domain))),
  constraint scan_leads_domain_present_check    check (char_length(domain) between 3 and 253),
  constraint scan_leads_score_range_check       check (score is null or (score between 0 and 100)),
  constraint scan_leads_findings_shape_check    check (jsonb_typeof(findings) = 'array'),
  constraint scan_leads_consent_finite_check    check (isfinite(consented_at)),
  constraint scan_leads_attempts_check          check (delivery_attempts between 0 and 3),
  constraint scan_leads_consent_source_check    check (consent_source in ('scan_page', 'embed', 'import')),

  -- One result per address per site. A second scan of the same site updates the row
  -- rather than queueing a duplicate email.
  constraint scan_leads_email_domain_key unique (email, domain),
  constraint scan_leads_unsubscribe_token_hash_key unique (unsubscribe_token_hash)
);

-- The send queue: rows that still need delivering. Partial, so the index stays the
-- size of the backlog rather than the size of the table.
create index if not exists scan_leads_pending_delivery_idx
  on public.scan_leads (consented_at)
  where delivered_at is null and abandoned_at is null and unsubscribed_at is null;

create index if not exists scan_leads_email_idx on public.scan_leads (email);

-- Suppression is address-wide, not tied to one requested domain. A recipient who
-- opts out must not receive another scan result because a second row happened to
-- describe a different site.
create table if not exists public.scan_lead_suppressions (
  email          text primary key,
  source_lead_id uuid references public.scan_leads(id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint scan_lead_suppressions_email_normalised_check check (email = lower(btrim(email))),
  constraint scan_lead_suppressions_email_shape_check check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

create or replace function private.nz_reject_suppressed_scan_lead()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if exists (
    select 1 from public.scan_lead_suppressions suppression
    where suppression.email = new.email
  ) then
    raise exception 'scan lead address is suppressed'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_scan_leads_reject_suppressed on public.scan_leads;
create trigger trg_scan_leads_reject_suppressed
  before insert on public.scan_leads
  for each row execute function private.nz_reject_suppressed_scan_lead();

create or replace function private.nz_apply_scan_lead_suppression()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.scan_leads
  set unsubscribed_at = coalesce(unsubscribed_at, new.created_at),
      delivery_claimed_at = null
  where email = new.email
    and unsubscribed_at is null;
  return new;
end;
$$;

drop trigger if exists trg_apply_scan_lead_suppression on public.scan_lead_suppressions;
create trigger trg_apply_scan_lead_suppression
  after insert on public.scan_lead_suppressions
  for each row execute function private.nz_apply_scan_lead_suppression();

create or replace function private.nz_touch_scan_leads_updated_at()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_scan_leads_updated_at on public.scan_leads;
create trigger trg_scan_leads_updated_at
  before update on public.scan_leads
  for each row execute function private.nz_touch_scan_leads_updated_at();

-- An unsubscribe is final. Clearing the stamp would let a later write quietly put a
-- suppressed address back into the send queue, so the database refuses it outright
-- rather than trusting every future call site to remember.
create or replace function private.nz_scan_lead_unsubscribe_is_final()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if old.unsubscribed_at is not null and new.unsubscribed_at is null then
    raise exception 'scan lead unsubscribe cannot be reversed'
      using errcode = 'check_violation';
  end if;
  if old.email is distinct from new.email then
    raise exception 'scan lead email is immutable'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_scan_leads_unsubscribe_final on public.scan_leads;
create trigger trg_scan_leads_unsubscribe_final
  before update on public.scan_leads
  for each row execute function private.nz_scan_lead_unsubscribe_is_final();

alter table public.scan_leads enable row level security;
alter table public.scan_lead_suppressions enable row level security;
-- No policies. Revoke the broad Supabase defaults, then grant the server role
-- only the operations used by the capture, delivery, and unsubscribe routes.
revoke all on public.scan_leads from anon, authenticated, service_role;
grant select, insert, update on public.scan_leads to service_role;
revoke all on public.scan_lead_suppressions from anon, authenticated, service_role;
grant select, insert on public.scan_lead_suppressions to service_role;
