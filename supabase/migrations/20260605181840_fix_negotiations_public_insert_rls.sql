create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.published_page_allows_negotiation(
  p_page_id uuid,
  p_slug text,
  p_owner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pages p
    where p.id = p_page_id
      and p.slug = p_slug
      and p.is_published = true
      and p.owner_id is not distinct from p_owner_id
  );
$$;

revoke all on function private.published_page_allows_negotiation(uuid, text, uuid) from public;
grant execute on function private.published_page_allows_negotiation(uuid, text, uuid) to anon, authenticated;

drop policy if exists "public can create negotiations for published pages" on public.agent_negotiations;
create policy "public can create negotiations for published pages"
  on public.agent_negotiations
  for insert
  to anon, authenticated
  with check (
    status = 'negotiation'
    and stripe_payment_intent_id is null
    and private.published_page_allows_negotiation(page_id, slug, owner_id)
  );
