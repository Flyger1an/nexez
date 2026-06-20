-- Verified purchase reviews.
--
-- Reviews are trust/ranking data, so writes are SERVICE-ROLE only via the
-- token-gated buyer order portal. Buyers never write to this table directly.
-- Sellers may read their own reviews; seller replies/moderation are also routed
-- through server endpoints so owners cannot edit buyer-authored ratings/text.

create table if not exists public.order_reviews (
  id uuid primary key default gen_random_uuid(),
  order_kind text not null check (order_kind in ('checkout', 'negotiation')),
  order_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid references public.pages(id) on delete set null,
  slug text,
  offer_name text,
  offer_key text,
  rating integer not null check (rating between 1 and 5),
  title text,
  body text,
  tags jsonb not null default '[]'::jsonb,
  status text not null default 'published' check (status in ('pending', 'published', 'hidden', 'disputed', 'removed')),
  buyer_email_hash text,
  seller_response text,
  seller_responded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_reviews_tags_array check (jsonb_typeof(tags) = 'array')
);

-- One lifetime review per verified order. A removed review still blocks another
-- review for that order; support/admin can edit the row if a rare reset is needed.
create unique index if not exists order_reviews_one_per_order_uidx
  on public.order_reviews (order_kind, order_id);

create index if not exists order_reviews_page_published_idx
  on public.order_reviews (page_id, published_at desc)
  where status = 'published';

create index if not exists order_reviews_slug_published_idx
  on public.order_reviews (slug, published_at desc)
  where status = 'published';

create index if not exists order_reviews_owner_created_idx
  on public.order_reviews (owner_id, created_at desc);

create or replace function public.set_order_reviews_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

alter function public.set_order_reviews_updated_at() set search_path = '';
revoke all on function public.set_order_reviews_updated_at() from public;

drop trigger if exists order_reviews_set_updated_at on public.order_reviews;
create trigger order_reviews_set_updated_at
  before update on public.order_reviews
  for each row
  execute function public.set_order_reviews_updated_at();

alter table public.order_reviews enable row level security;

-- Defense in depth: no anon/authenticated writes. Public summaries are loaded
-- server-side from published rows only.
revoke all on public.order_reviews from anon;
revoke all on public.order_reviews from authenticated;
grant select on public.order_reviews to authenticated;

drop policy if exists "Owners can read own order reviews" on public.order_reviews;
create policy "Owners can read own order reviews"
  on public.order_reviews
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);
