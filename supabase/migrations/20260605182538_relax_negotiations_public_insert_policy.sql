drop policy if exists "public can create negotiations for published pages" on public.agent_negotiations;
create policy "public can create negotiations for published pages"
  on public.agent_negotiations
  for insert
  to anon, authenticated
  with check (
    private.published_page_allows_negotiation(page_id, slug, owner_id)
  );
