-- Security (part 2 of 2): revoke anon's direct SELECT on the base `pages` table.
--
-- APPLY ONLY AFTER the repointed code is deployed and verified: every anon-context
-- read now goes through public.pages_public (rules-stripped) or the service-role
-- client (the negotiation/checkout paths that legitimately need the private rules),
-- and the anon analytics INSERT policies use private.nz_page_visit_allowed (no
-- direct anon pages read). This closes the REST hole - GET /rest/v1/pages now
-- returns permission-denied for anon, while /rest/v1/pages_public serves the
-- redacted projection.
--
-- `authenticated` keeps its SELECT grant + the owner/published policies (dashboards
-- and authed reads are unaffected); service_role bypasses RLS. Reversible: re-grant
-- with `grant select on public.pages to anon;`.

revoke select on public.pages from anon;
