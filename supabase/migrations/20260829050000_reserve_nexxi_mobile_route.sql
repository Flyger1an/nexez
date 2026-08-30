-- The Nexxi mobile handoff route is platform-owned. Reserve it in both public
-- identifier namespaces so a listing or storefront can never shadow the route.
do $$
begin
  if exists (
    select 1 from public.pages where lower(btrim(slug)) = 'nexxi'
  ) then
    raise exception 'An existing listing slug conflicts with the Nexxi mobile route.';
  end if;
  if exists (
    select 1 from public.storefronts where lower(btrim(handle)) = 'nexxi'
  ) then
    raise exception 'An existing storefront handle conflicts with the Nexxi mobile route.';
  end if;
end;
$$;

insert into private.public_identifier_claims (namespace, identifier, kind)
values
  ('page_slug', 'nexxi', 'system'),
  ('storefront_handle', 'nexxi', 'system')
on conflict (namespace, identifier) do update
set kind = 'system',
    owner_id = null,
    subject_id = null,
    updated_at = statement_timestamp();
