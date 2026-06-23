-- Nexxi BUYER FACET: businesses (page slugs) a buyer saved for later. Owner-scoped via RLS for the
-- app/Data API; cleaned on buyer-account deletion (see lib/server/delete-account.ts BUYER_USER_ID_TABLES).
-- We store the slug only (no FK to pages) — a saved business that later unpublishes is tolerated and
-- simply filtered out client-side against the public catalog.

create table if not exists public.saved_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);

create index if not exists saved_pages_user_idx on public.saved_pages (user_id, created_at desc);

alter table public.saved_pages enable row level security;
grant select, insert, delete on public.saved_pages to authenticated;

drop policy if exists "Users manage own saved pages" on public.saved_pages;
create policy "Users manage own saved pages"
  on public.saved_pages
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.saved_pages is 'Buyer-facet: businesses (page slugs) a Nexxi buyer saved for later. Owner-scoped via RLS.';
