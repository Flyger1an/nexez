-- Add missing columns that the application code expects on the pages table
-- These were added in the TypeScript types but never migrated to the database.

alter table public.pages
  add column if not exists industry text,
  add column if not exists prefer_original_site boolean not null default false;

-- Optional: backfill default values if needed (safe)
update public.pages
set prefer_original_site = coalesce(prefer_original_site, false)
where prefer_original_site is null;

-- Refresh PostgREST schema cache (important for "schema cache" errors)
notify pgrst, 'reload schema';