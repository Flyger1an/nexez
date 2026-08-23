-- Security advisor fixes.
-- 1) Drop the vestigial empty public.page (singular) table - unused (app uses public.pages).
drop table if exists public.page;
-- 2) Pin search_path on the updated_at trigger function.
alter function public.set_pages_updated_at() set search_path = '';
