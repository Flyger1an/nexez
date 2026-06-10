-- Allow public/anon read access to negotiation_messages for published negotiations.
-- This is required so that the persistent /negotiate/{id} page (used by AI agents)
-- can display the full conversation history without requiring authentication.
-- Security: only for negotiations linked to published pages; no sensitive owner-only fields are in the messages table (internal_notes stay in decision for owner inbox).

drop policy if exists "public can read messages for published negotiations" on public.negotiation_messages;
create policy "public can read messages for published negotiations"
  on public.negotiation_messages
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.agent_negotiations n
      join public.pages p on p.id = n.page_id
      where n.id = negotiation_id
        and p.is_published = true
    )
  );

-- Re-grant select (already granted in previous migration)
grant select on public.negotiation_messages to anon, authenticated;