-- Keep page-level operational secrets out of the public, crawlable pages row.
-- Public pages remain agent-readable; secrets are owner-only in page_secrets.

create table if not exists public.page_secrets (
  page_id uuid primary key references public.pages(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  calendly_webhook_secret text,
  outbound_webhooks jsonb not null default '[]'::jsonb,
  domain_verification_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists page_secrets_owner_idx
  on public.page_secrets (owner_id);

alter table public.page_secrets enable row level security;

grant select, insert, update, delete on public.page_secrets to authenticated;

drop policy if exists "Owners can read own page secrets" on public.page_secrets;
drop policy if exists "Owners can create own page secrets" on public.page_secrets;
drop policy if exists "Owners can update own page secrets" on public.page_secrets;
drop policy if exists "Owners can delete own page secrets" on public.page_secrets;

create policy "Owners can read own page secrets"
  on public.page_secrets
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners can create own page secrets"
  on public.page_secrets
  for insert
  to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1
      from public.pages
      where pages.id = page_secrets.page_id
        and pages.owner_id = (select auth.uid())
    )
  );

create policy "Owners can update own page secrets"
  on public.page_secrets
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Owners can delete own page secrets"
  on public.page_secrets
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

insert into public.page_secrets (
  page_id,
  owner_id,
  calendly_webhook_secret,
  outbound_webhooks,
  domain_verification_token
)
select
  id,
  owner_id,
  calendly_webhook_secret,
  coalesce(outbound_webhooks, '[]'::jsonb),
  domain_verification_token
from public.pages
where owner_id is not null
  and (
    calendly_webhook_secret is not null
    or outbound_webhooks is not null
    or domain_verification_token is not null
  )
on conflict (page_id) do update
set
  calendly_webhook_secret = excluded.calendly_webhook_secret,
  outbound_webhooks = excluded.outbound_webhooks,
  domain_verification_token = excluded.domain_verification_token,
  updated_at = now();

update public.pages
set
  calendly_webhook_secret = null,
  outbound_webhooks = null,
  domain_verification_token = null
where calendly_webhook_secret is not null
  or outbound_webhooks is not null
  or domain_verification_token is not null;

revoke select (calendly_webhook_secret, outbound_webhooks, domain_verification_token)
  on public.pages
  from anon, authenticated;
