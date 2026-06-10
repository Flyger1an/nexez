-- Dedicated table for full conversation history in negotiations.
-- This replaces storing history only in agent_negotiations.metadata.conversation
-- for better querying, indexing, and long-term persistence.

create table if not exists public.negotiation_messages (
  id uuid primary key default gen_random_uuid(),
  negotiation_id uuid not null references public.agent_negotiations(id) on delete cascade,
  role text not null check (role in ('buyer', 'seller_llm', 'seller_owner')),
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indexes for efficient history loading by negotiation
create index if not exists negotiation_messages_negotiation_created_idx
  on public.negotiation_messages (negotiation_id, created_at asc);

create index if not exists negotiation_messages_role_idx
  on public.negotiation_messages (role);

-- RLS: 
-- - Public/anon can insert messages for negotiations on published pages (for buyer agents submitting follow-ups)
-- - Owners can read all messages for their negotiations
-- - Owners can insert their own messages (e.g. manual overrides)
-- - No public select on messages to protect internal notes/reasoning; the /negotiate page will use service or specific policy if needed, but for now service uses authenticated or server client where appropriate. For public agent view, we can expose via status or dedicated endpoint.

alter table public.negotiation_messages enable row level security;

-- Allow anon/authenticated to insert into messages for valid published negotiations
drop policy if exists "public can append messages to negotiations on published pages" on public.negotiation_messages;
create policy "public can append messages to negotiations on published pages"
  on public.negotiation_messages
  for insert
  to anon, authenticated
  with check (
    exists (
      select 1
      from public.agent_negotiations n
      join public.pages p on p.id = n.page_id
      where n.id = negotiation_id
        and p.is_published = true
    )
  );

-- Owners can read their negotiation messages
drop policy if exists "owners can read their negotiation messages" on public.negotiation_messages;
create policy "owners can read their negotiation messages"
  on public.negotiation_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.agent_negotiations n
      where n.id = negotiation_id
        and n.owner_id = (select auth.uid())
    )
  );

-- Owners can also insert messages (e.g. manual counters)
drop policy if exists "owners can insert messages for their negotiations" on public.negotiation_messages;
create policy "owners can insert messages for their negotiations"
  on public.negotiation_messages
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.agent_negotiations n
      where n.id = negotiation_id
        and n.owner_id = (select auth.uid())
    )
  );

-- Grant
grant insert, select on public.negotiation_messages to anon, authenticated;

-- Optional: backfill note (existing history in metadata can stay for compatibility; new code uses table)
comment on table public.negotiation_messages is 'Stores full turn-by-turn history for persistent, resumable negotiations. Each row is one message/decision with full context for LLM memory.';
