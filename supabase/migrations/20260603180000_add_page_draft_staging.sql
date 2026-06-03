-- D12: staging — edit a draft, preview it, then publish to live.
alter table public.pages
  add column if not exists draft jsonb,
  add column if not exists draft_updated_at timestamptz;

comment on column public.pages.draft is 'Unpublished staged content (name, description, services, products, faqs, industry, prefer_original_site). Promoted to live columns on publish; previewed owner-only via ?preview=1.';
