alter table public.pages
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

create index if not exists pages_owner_created_at_idx
  on public.pages (owner_id, created_at desc);

alter table public.pages enable row level security;

drop policy if exists "Public can read published pages" on public.pages;
drop policy if exists "Public can create agent pages" on public.pages;
drop policy if exists "Public can manage MVP pages" on public.pages;
drop policy if exists "Public can delete MVP pages" on public.pages;
drop policy if exists "Owners can read own pages" on public.pages;
drop policy if exists "Owners can create pages" on public.pages;
drop policy if exists "Owners can update own pages" on public.pages;
drop policy if exists "Owners can delete own pages" on public.pages;

create policy "Public can read published pages"
  on public.pages
  for select
  to anon, authenticated
  using (is_published = true);

create policy "Owners can read own pages"
  on public.pages
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners can create pages"
  on public.pages
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Owners can update own pages"
  on public.pages
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Owners can delete own pages"
  on public.pages
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

