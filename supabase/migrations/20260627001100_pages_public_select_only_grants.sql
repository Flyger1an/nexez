-- The project default privileges grant broad table permissions to anon/authenticated.
-- pages_public is intentionally a read-only public projection: RLS already has no
-- write policies, but keep the table-level grant surface select-only too.
revoke all on public.pages_public from anon, authenticated;
grant select on public.pages_public to anon, authenticated;

