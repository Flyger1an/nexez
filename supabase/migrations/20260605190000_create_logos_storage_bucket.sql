-- Public 'logos' storage bucket for page branding logos (one-click detect + upload).
-- Backs the logo upload in app/dashboard/[id]/settings. Idempotent.
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set public = true;

-- Anyone can read logos (public branding assets).
drop policy if exists "logos public read" on storage.objects;
create policy "logos public read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'logos');

-- Authenticated users can write only under logos/<their uid>/...
-- (object name is logos/<uid>/<file>; foldername(name) = {logos,<uid>})
drop policy if exists "logos owner insert" on storage.objects;
create policy "logos owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[2] = auth.uid()::text);

drop policy if exists "logos owner update" on storage.objects;
create policy "logos owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[2] = auth.uid()::text);

drop policy if exists "logos owner delete" on storage.objects;
create policy "logos owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[2] = auth.uid()::text);
