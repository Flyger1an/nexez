-- Security: remove the direct client (anon/authenticated) write path to the negotiation tables.
--
-- Red-team finding (2026-06-20, HIGH, confirmed live): the agent_negotiations INSERT policy
-- ("public can create negotiations for published pages") only checked
-- private.nz_page_is_published(page_id), and anon held the INSERT grant. Every other column
-- (owner_id, slug, amount_cents, status_token, buyer_email, settlement_state, metadata, contact)
-- was caller-supplied, so ANY anonymous client holding the public anon key could POST directly to
-- PostgREST and forge negotiation rows into ANY seller's account: mint a chosen status_token (a
-- working /orders/<token> portal credential), set arbitrary amounts, and flood/poison the seller's
-- dashboard + trigger seller-facing emails. negotiation_messages had the analogous loose policy
-- ("public can append messages to negotiations on published pages") allowing message injection into
-- any negotiation on a published page.
--
-- The application NEVER writes these tables as anon/authenticated: createNewNegotiation() and all
-- buyer/system message writes go through the service-role admin client (lib/negotiation.service.ts),
-- which bypasses RLS. The only client-side write is the OWNER inserting a seller-authored message
-- from the dashboard (app/api/negotiations/transition/route.ts, cookie/authenticated) - preserved
-- below via the existing owner-scoped policy. So we drop the public-insert paths and the now-unused
-- write grants; the owner SELECT/UPDATE (negotiations) and owner INSERT (messages) stay intact.

-- === agent_negotiations: service-role is the only creator; owners keep read + update ===
drop policy if exists "public can create negotiations for published pages" on public.agent_negotiations;
revoke insert on public.agent_negotiations from anon;
revoke insert, delete, truncate on public.agent_negotiations from authenticated;

-- === negotiation_messages: drop the public append path; keep owner-authored inserts ===
drop policy if exists "public can append messages to negotiations on published pages" on public.negotiation_messages;
revoke insert on public.negotiation_messages from anon;
revoke delete, truncate, update on public.negotiation_messages from authenticated;
