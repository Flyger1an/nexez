-- AI Agent Detection & Analytics foundation.
-- Dedicated visit table for public page traffic classification.
-- Stores privacy-safe IP hashes only; never raw visitor IPs.

create table if not exists public.agent_visits (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  slug text not null,
  path text not null,
  referrer text,
  query text,
  user_agent text,
  ip_hash text,
  is_ai_agent boolean not null default false,
  agent_type text not null default 'Human/Unknown',
  confidence_score numeric(5,2) not null default 0
    check (confidence_score >= 0 and confidence_score <= 100),
  detection_signals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_visits_owner_created_at_idx
  on public.agent_visits (owner_id, created_at desc);

create index if not exists agent_visits_page_created_at_idx
  on public.agent_visits (page_id, created_at desc);

create index if not exists agent_visits_slug_created_at_idx
  on public.agent_visits (slug, created_at desc);

create index if not exists agent_visits_ai_created_at_idx
  on public.agent_visits (is_ai_agent, created_at desc);

create index if not exists agent_visits_agent_type_idx
  on public.agent_visits (agent_type);

alter table public.agent_visits enable row level security;

grant insert on public.agent_visits to anon, authenticated;
grant select on public.agent_visits to authenticated;

drop policy if exists "Public can create agent visits for published pages" on public.agent_visits;
drop policy if exists "Owners can read own agent visits" on public.agent_visits;

create policy "Public can create agent visits for published pages"
  on public.agent_visits
  for insert
  to anon, authenticated
  with check (
    exists (
      select 1
      from public.pages
      where pages.id = agent_visits.page_id
        and pages.is_published = true
        and pages.slug = agent_visits.slug
        and pages.owner_id is not distinct from agent_visits.owner_id
    )
  );

create policy "Owners can read own agent visits"
  on public.agent_visits
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);
