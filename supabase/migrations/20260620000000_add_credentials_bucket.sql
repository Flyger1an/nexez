-- Private storage bucket for owner-uploaded, LLM-reviewed credential documents.
-- Files are never public by default; the public agent page serves only the ones
-- the owner explicitly marked public, via a short-lived signed URL minted by the
-- service role (see /api/credentials/view). Owners can only read/write within
-- their own folder ({uid}/{pageId}/{file}); the service role (review + signed
-- URLs) bypasses RLS.
insert into storage.buckets (id, name, public)
values ('credentials', 'credentials', false)
on conflict (id) do nothing;

drop policy if exists "owners manage own credentials" on storage.objects;
create policy "owners manage own credentials"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'credentials' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'credentials' and (storage.foldername(name))[1] = (select auth.uid())::text);
