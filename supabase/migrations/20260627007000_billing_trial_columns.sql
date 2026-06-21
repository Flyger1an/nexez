-- Phase 0 of the no-Free trial model (plan: remove Free → Shopify-style 7-day trial).
-- ADDITIVE ONLY: trial bookkeeping + the legacy/new marker. Zero behavior change until the
-- resolvers (Phase 2) start reading these columns — today every existing row stays
-- grandfathered ('legacy') and resolves to Free exactly as before.

alter table public.billing_subscriptions
  add column if not exists trial_ends_at timestamptz,
  add column if not exists account_origin text;

-- account_origin marks how an account entered billing:
--   'legacy' = existed before the no-Free cutover → grandfathered to today's behavior.
--   'trial'  = signed up under the new model → 7-day no-card trial, then must subscribe.
comment on column public.billing_subscriptions.trial_ends_at is
  'When a no-card trial expires (Phase 4). Null for legacy/paid rows.';
comment on column public.billing_subscriptions.account_origin is
  '''legacy'' (grandfathered, pre-cutover) or ''trial'' (new no-Free signup).';

-- Index the trial-expiry scan the reconcile cron will run (Phase 4).
create index if not exists billing_subscriptions_trial_scan_idx
  on public.billing_subscriptions (status, trial_ends_at)
  where trial_ends_at is not null;

-- Backfill: every existing billing row is legacy (grandfathered).
update public.billing_subscriptions
set account_origin = 'legacy'
where account_origin is null;

-- Seed a legacy placeholder for owners who have listings but no billing row, so the Phase 2
-- resolver classifies them as grandfathered (keep today's Free behavior) rather than as new
-- accounts (which would later pause their listings). status stays a non-live value, so this
-- is a no-op for entitlements today (resolves to Free, exactly as a missing row did).
insert into public.billing_subscriptions (owner_id, status, account_origin)
select distinct p.owner_id, 'unconfigured', 'legacy'
from public.pages p
where p.owner_id is not null
  and not exists (select 1 from public.billing_subscriptions b where b.owner_id = p.owner_id)
on conflict (owner_id) do nothing;
