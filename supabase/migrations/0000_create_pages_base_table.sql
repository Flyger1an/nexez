-- DR / fresh-rebuild baseline for the public.pages base table.
--
-- Every other public table has a CREATE TABLE in supabase/migrations, but `pages`
-- was bootstrapped out-of-band, so the first pages migration (0001) ALTERs a table
-- that doesn't exist on a clean database — `supabase db reset` (or a brand-new
-- project / preview branch) fails immediately on 0001. This creates ONLY the
-- original pre-migration columns; the existing `add column if not exists ...`
-- migrations (0001 onward) then reconstruct the full live schema in filename order.
--
-- Verified against the live DB (project pvsotrzgnjpqrsndhgmu) before writing:
--   * cols id/name/slug/is_published/created_at are the only ones NOT added by a
--     later migration (every other live `pages` column has an `add column` in the
--     migration set), and their types/defaults below mirror the live table exactly;
--   * there are no drop/rename/alter-column ops on `pages` in any migration, so an
--     original-columns baseline replays to the live shape with no conflict.
--
-- IF NOT EXISTS makes this a strict NO-OP on the existing prod DB (the table is
-- already present) — it only does work on a fresh database. Filename `0000_` sorts
-- before `0001_`, so it runs first on a reset. RLS + indexes + policies are added
-- by the later migrations (0001/0002/0003+), so they are intentionally NOT here.
create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  name text,
  slug text,
  is_published boolean default false,
  created_at timestamptz not null default now()
);
