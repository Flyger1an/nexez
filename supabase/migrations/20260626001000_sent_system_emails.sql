-- Send-once ledger for transactional "system" emails (welcome, stripe-connected) that
-- must fire AT MOST ONCE per (owner, kind). The primary key gives an atomic, race-safe
-- guard: the sender inserts (owner_id, kind) before sending; a 23505 conflict means it
-- already went out, so the trigger no-ops (covers repeat logins + webhook redeliveries).
-- On send failure the row is deleted so a later trigger can retry. Service-role only.

create table if not exists public.sent_system_emails (
  owner_id  uuid        not null,
  kind      text        not null,
  sent_at   timestamptz not null default now(),
  primary key (owner_id, kind)
);

alter table public.sent_system_emails enable row level security;
-- No policies → no anon/authenticated access; only the service-role (which bypasses RLS)
-- reads/writes this. Revoke the PostgREST default grants to be explicit/least-privilege.
revoke all on public.sent_system_emails from anon, authenticated;
