-- C10: per-page branding / white-label for custom-domain agent pages.
alter table public.pages
  add column if not exists branding jsonb not null default '{}'::jsonb;

comment on column public.pages.branding is 'White-label branding for the public page: { accent_color, logo_url, brand_name, hide_nexez_badge }. Applied especially when served on a custom domain.';
