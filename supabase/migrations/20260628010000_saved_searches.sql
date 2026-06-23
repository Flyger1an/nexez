-- Nexxi BUYER FACET: standing searches a buyer wants alerts for ("plumber under $300 in Austin").
-- Owner-scoped via RLS; cleaned on buyer-account deletion (see delete-account BUYER_USER_ID_TABLES).
-- The saved-search-alerts cron diffs newly-published catalog entries against these and pushes matches.
-- query/category default to '' so the unique(user_id,query,category) dedupe works (a category-only or
-- query-only search is allowed; the endpoint requires at least one to be non-empty).

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null default '',
  category text not null default '',
  -- Only alert on pages published AFTER this; advanced each time we notify (no backfill spam).
  last_notified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, query, category)
);

create index if not exists saved_searches_user_idx on public.saved_searches (user_id, created_at desc);

alter table public.saved_searches enable row level security;
grant select, insert, delete on public.saved_searches to authenticated;

drop policy if exists "Users manage own saved searches" on public.saved_searches;
create policy "Users manage own saved searches"
  on public.saved_searches
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.saved_searches is 'Buyer-facet: standing searches a Nexxi buyer wants alerts for. Owner-scoped via RLS.';
