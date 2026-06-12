-- Red-team gauntlet (low / least-privilege drift): the anon role held
-- UPDATE/DELETE/TRUNCATE on the money tables. Inert today (no permissive anon RLS
-- policy lets it through), but tighten to least privilege so these tables aren't a
-- single stray policy away from anonymous mutation. INSERT is left as-is.
REVOKE UPDATE, DELETE, TRUNCATE ON public.agent_negotiations FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.negotiation_messages FROM anon;
