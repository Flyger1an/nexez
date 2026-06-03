create table if not exists public.agent_negotiations (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  owner_id uuid,
  slug text not null,
  offer_key text not null,
  offer_name text not null,
  offer_kind text not null check (offer_kind in ('services', 'products')),
  buyer_agent text,
  buyer_query text,
  requested_terms jsonb not null default '{}'::jsonb,
  budget_text text,
  timeline_text text,
  contact text,
  status text not null default 'negotiation' check (
    status in ('negotiation', 'agreement_proposed', 'held', 'complete', 'declined', 'expired')
  ),
  escrow_mode text not null default 'not_configured' check (
    escrow_mode in ('not_configured', 'manual_capture_ready', 'manual_capture_created')
  ),
  amount_cents integer,
  currency text not null default 'usd',
  stripe_payment_intent_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_negotiations_page_created_idx
  on public.agent_negotiations (page_id, created_at desc);

create index if not exists agent_negotiations_owner_status_idx
  on public.agent_negotiations (owner_id, status, created_at desc);

create index if not exists agent_negotiations_slug_offer_idx
  on public.agent_negotiations (slug, offer_key);

alter table public.agent_negotiations enable row level security;

grant insert on public.agent_negotiations to anon, authenticated;
grant select, update on public.agent_negotiations to authenticated;

drop policy if exists "public can create negotiations for published pages" on public.agent_negotiations;
create policy "public can create negotiations for published pages"
  on public.agent_negotiations
  for insert
  to anon, authenticated
  with check (
    exists (
      select 1
      from public.pages p
      where p.id = page_id
        and p.slug = slug
        and p.is_published = true
        and p.owner_id is not distinct from owner_id
    )
  );

drop policy if exists "owners can read negotiations" on public.agent_negotiations;
create policy "owners can read negotiations"
  on public.agent_negotiations
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "owners can update negotiations" on public.agent_negotiations;
create policy "owners can update negotiations"
  on public.agent_negotiations
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
