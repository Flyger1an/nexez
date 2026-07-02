-- Nexxi BUYER FACET: referral / invite. Each buyer gets a stable share CODE; when a NEW buyer claims
-- a code we record the attribution (one referrer per referred user). No reward/credit is granted yet
-- (that needs a credits system) — this captures the code + the graph so rewards can be layered on later.
-- Codes + attribution rows are written by the SERVICE ROLE (endpoints) to guarantee uniqueness + block
-- forgery; owner-scoped reads. Cleaned on buyer-account deletion.

create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

alter table public.referral_codes enable row level security;
grant select on public.referral_codes to authenticated;

drop policy if exists "Users read own referral code" on public.referral_codes;
create policy "Users read own referral code"
  on public.referral_codes for select to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null references auth.users(id) on delete cascade unique, -- one referrer per referred user
  code text not null,
  created_at timestamptz not null default now(),
  constraint referrals_no_self check (referrer_user_id <> referred_user_id)
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_user_id);

alter table public.referrals enable row level security;
grant select on public.referrals to authenticated;

-- A referrer can read the rows they generated (to count their invites). Referred users don't need read.
drop policy if exists "Users read own referrals made" on public.referrals;
create policy "Users read own referrals made"
  on public.referrals for select to authenticated
  using ((select auth.uid()) = referrer_user_id);

comment on table public.referral_codes is 'Buyer-facet: one stable invite code per buyer. Service-role writes; owner-scoped reads.';
comment on table public.referrals is 'Buyer-facet: referral attribution (referrer → referred, one per referred user). Service-role writes; referrer-scoped reads.';
