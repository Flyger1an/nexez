-- Add custom_domain support for agent pages (lean MVP step 4)
-- Run this in Supabase SQL editor or via CLI if you want custom domain UI to persist.

alter table public.pages
  add column if not exists custom_domain text;

create unique index if not exists pages_custom_domain_key on public.pages (custom_domain) where custom_domain is not null;

comment on column public.pages.custom_domain is 'Optional custom domain (e.g. agents.yourcompany.com). DNS/CNAME setup required. See Page Settings for instructions.';
