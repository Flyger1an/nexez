-- Security/RLS hardening per Supabase advisors. Idempotent.
-- (0025) logos bucket allowed listing; (0028/0029) nz_page_is_published exposed
-- as a PostgREST RPC; (0001) unindexed support_tickets FK.

-- 1) logos: drop the broad public-read SELECT policy so anon/authenticated can no
--    longer LIST bucket contents. Public object URLs (getPublicUrl) keep working
--    because the bucket is public — object serving bypasses RLS. The owner
--    insert/update/delete policies are unchanged.
drop policy if exists "logos public read" on storage.objects;

-- 2) Move the published-page helper out of the PostgREST-exposed `public` schema
--    into `private` so it is no longer callable via /rest/v1/rpc, while the
--    negotiation INSERT policy keeps working (anon/auth keep USAGE + EXECUTE).
create schema if not exists private;
grant usage on schema private to anon, authenticated;

create or replace function private.nz_page_is_published(p_page_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.pages where id = p_page_id and is_published = true);
$$;

grant execute on function private.nz_page_is_published(uuid) to anon, authenticated;

drop policy if exists "public can create negotiations for published pages" on public.agent_negotiations;
create policy "public can create negotiations for published pages"
  on public.agent_negotiations
  for insert
  to anon, authenticated
  with check ( private.nz_page_is_published(page_id) );

-- Remove the RPC-exposed copy now that the policy references the private one.
drop function if exists public.nz_page_is_published(uuid);

-- 3) Index the support_tickets -> pages foreign key.
create index if not exists support_tickets_page_id_idx on public.support_tickets(page_id);
