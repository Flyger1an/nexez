create table if not exists public.checkout_events (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  slug text not null,
  offer_key text not null,
  offer_name text not null,
  offer_kind text not null check (offer_kind in ('services', 'products')),
  event_type text not null check (
    event_type in (
      'checkout_view',
      'checkout_attempt',
      'provider_redirect',
      'stripe_session_created',
      'stripe_missing_config',
      'stripe_error'
    )
  ),
  agent_user_agent text,
  referrer text,
  query text,
  checkout_url text,
  provider_url text,
  stripe_session_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists checkout_events_owner_created_at_idx
  on public.checkout_events (owner_id, created_at desc);

create index if not exists checkout_events_page_created_at_idx
  on public.checkout_events (page_id, created_at desc);

create index if not exists checkout_events_type_created_at_idx
  on public.checkout_events (event_type, created_at desc);

alter table public.checkout_events enable row level security;

grant select, insert on public.checkout_events to anon, authenticated;

drop policy if exists "Public can create checkout events for published pages" on public.checkout_events;
drop policy if exists "Owners can read own checkout events" on public.checkout_events;

create policy "Public can create checkout events for published pages"
  on public.checkout_events
  for insert
  to anon, authenticated
  with check (
    exists (
      select 1
      from public.pages
      where pages.id = checkout_events.page_id
        and pages.is_published = true
        and pages.slug = checkout_events.slug
        and pages.owner_id is not distinct from checkout_events.owner_id
    )
  );

create policy "Owners can read own checkout events"
  on public.checkout_events
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);
