-- C9: multiple pages under one custom domain, each at a distinct path.
alter table public.pages
  add column if not exists domain_path text not null default '/';

-- Replace single-domain uniqueness with (domain, path) uniqueness.
drop index if exists pages_custom_domain_key;
create unique index if not exists pages_custom_domain_path_key
  on public.pages (custom_domain, domain_path)
  where custom_domain is not null;

comment on column public.pages.domain_path is 'Path this page is served at on its custom_domain (e.g. "/" or "/pricing"). Enables multiple pages per domain.';
