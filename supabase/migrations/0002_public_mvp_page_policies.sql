alter table public.pages enable row level security;

drop policy if exists "Public can read published pages" on public.pages;
create policy "Public can read published pages"
  on public.pages
  for select
  to anon, authenticated
  using (is_published = true);

drop policy if exists "Public can create agent pages" on public.pages;
create policy "Public can create agent pages"
  on public.pages
  for insert
  to anon, authenticated
  with check (is_published = true);

-- MVP-only policy until Nexez has authenticated owners/admins.
drop policy if exists "Public can manage MVP pages" on public.pages;
create policy "Public can manage MVP pages"
  on public.pages
  for update
  to anon, authenticated
  using (true)
  with check (true);

-- MVP-only policy until Nexez has authenticated owners/admins.
drop policy if exists "Public can delete MVP pages" on public.pages;
create policy "Public can delete MVP pages"
  on public.pages
  for delete
  to anon, authenticated
  using (true);

