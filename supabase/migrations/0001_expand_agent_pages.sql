alter table public.pages
  add column if not exists description text,
  add column if not exists website_url text,
  add column if not exists cta_url text,
  add column if not exists cta_label text default 'Visit website',
  add column if not exists audience text,
  add column if not exists location text,
  add column if not exists contact_email text,
  add column if not exists products jsonb not null default '[]'::jsonb,
  add column if not exists services jsonb not null default '[]'::jsonb,
  add column if not exists faqs jsonb not null default '[]'::jsonb;

create unique index if not exists pages_slug_key on public.pages (slug);

create index if not exists pages_published_created_at_idx
  on public.pages (is_published, created_at desc);

