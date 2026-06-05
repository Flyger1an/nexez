-- The public/agent negotiation INSERT policy used a cross-table EXISTS(pages)
-- subquery in WITH CHECK. Under the real anon JWT context PostgREST rejected
-- valid inserts (agents could not create negotiations). Replace the check with
-- a SECURITY DEFINER helper so the published-page check is reliable and not
-- subject to nested RLS evaluation. Idempotent.

create or replace function public.nz_page_is_published(p_page_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.pages where id = p_page_id and is_published = true);
$$;

grant execute on function public.nz_page_is_published(uuid) to anon, authenticated;

drop policy if exists "public can create negotiations for published pages" on public.agent_negotiations;

create policy "public can create negotiations for published pages"
  on public.agent_negotiations
  for insert
  to anon, authenticated
  with check ( public.nz_page_is_published(page_id) );
