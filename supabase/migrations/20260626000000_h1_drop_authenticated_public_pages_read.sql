-- H1 (launch-readiness audit): cross-tenant leak of owner-private offer `rules`.
--
-- The policy "Public can read published pages" on public.pages (USING
-- is_published = true, NOT owner-scoped) applied to BOTH `anon` AND `authenticated`.
-- anon's base-`pages` SELECT grant was already revoked (20260617010000) so anon must
-- read the rules-stripped `pages_public` view - but `authenticated` still held the
-- SELECT grant. So ANY signed-up user could query
--   GET /rest/v1/pages?is_published=eq.true&select=products,services
-- and read every published page's owner-private offer `rules` (e.g. minPrice, the
-- negotiation floor) that pages_public is designed to strip. Open signup + the
-- public anon key make this trivially exploitable; it defeats the pages_public
-- privacy boundary for the entire authenticated population.
--
-- Fix: drop the broad published-read policy entirely.
--   * anon never used it (no SELECT grant; reads base pages via the SECURITY DEFINER
--     pages_public view, which is unaffected by base-table RLS policies).
--   * authenticated keeps reading its OWN pages ("Owners can read own pages") and
--     shared pages ("collaborators read shared pages") - those policies remain.
--   * service-role bypasses RLS.
-- The one authenticated, by-slug (non-owner-scoped) base-pages reader - the
-- competitor analyzer - was repointed to pages_public in the same change.
-- Side benefit: clears the `pages` multiple-permissive-SELECT-policy advisor WARN.
-- Idempotent (IF EXISTS) and reversible (re-create the policy to restore prior state).

drop policy if exists "Public can read published pages" on public.pages;

-- Defensive / documents intent: the anon-facing redacted projection must stay
-- readable by both web roles (anon for public pages; authenticated for by-slug
-- cross-owner lookups like the competitor analyzer). Already granted; idempotent.
grant select on public.pages_public to anon, authenticated;
