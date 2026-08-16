-- Bug #2 hardening: remove anonymous read access to negotiation_messages.
--
-- RENUMBERED from 20260610210000. Contents unchanged; only the version prefix
-- moved, to just after 20260614120000_add_negotiation_messages. Every statement
-- here targets public.negotiation_messages, which that migration creates, so at
-- the original version a from-scratch replay failed with 42P01. The note below
-- already pointed at a later version than the file's own, which is the tell.
--
-- The earlier migration (20260614120100) granted anon SELECT so the persistent
-- /negotiate/{id} page could show history without auth. But seller_llm turns embed
-- owner-private data (the offer's private pricing rules and the LLM's internal
-- notes), so anon SELECT let any caller read them straight off the REST API
-- (the "no sensitive fields" claim in that migration was incorrect).
--
-- History is now read server-side: the /negotiate page authorizes the viewer
-- (status token for agents, owner RLS for the dashboard) and reads with the
-- service-role key; the negotiation service also reads/writes with service-role.
-- So anonymous direct read is no longer needed by the app and is dropped.
--
-- Owners keep read access via the existing "owners can read their negotiation
-- messages" policy. The anon INSERT path is unaffected (writes can't read).
-- Idempotent.

drop policy if exists "public can read messages for published negotiations" on public.negotiation_messages;

revoke select on public.negotiation_messages from anon;
