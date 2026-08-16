-- C9: multiple pages under one custom domain, each at a distinct path.
--
-- RENUMBERED from 20260603160000. The contents are unchanged; only the version
-- prefix moved, from before 20260610000000_add_custom_domain to just after it.
-- This migration reads `custom_domain` and drops `pages_custom_domain_key`, both
-- of which that migration creates, so at the original version a from-scratch
-- replay failed with 42703 on the index below and never got past June.
-- Production was applied out of band in the correct order and is unaffected.
alter table public.pages
  add column if not exists domain_path text not null default '/';

-- Replace single-domain uniqueness with (domain, path) uniqueness.
drop index if exists pages_custom_domain_key;
create unique index if not exists pages_custom_domain_path_key
  on public.pages (custom_domain, domain_path)
  where custom_domain is not null;

comment on column public.pages.domain_path is 'Path this page is served at on its custom_domain (e.g. "/" or "/pricing"). Enables multiple pages per domain.';
