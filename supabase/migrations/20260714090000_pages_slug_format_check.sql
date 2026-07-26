-- Structural slug hygiene: pages.slug gets the same format guarantee
-- storefronts.handle has had since 20260627006000. The unique index
-- (pages_slug_key) is case-SENSITIVE btree, so without this CHECK a
-- service-role writer could insert 'Acme' alongside 'acme' — an unreachable/
-- spoofable near-duplicate. App code always writes normalizeSlug() output
-- (lowercase kebab); this makes that a constraint instead of a convention.
-- Verified before applying: all existing rows conform (49/49, max length 47).
--
-- Reserved-word slugs (platform route names like 'learn', 'store') are
-- deliberately NOT enforced here — that list changes with app routes and lives
-- in lib/agent-page.ts RESERVED_SLUGS, enforced by every slug-minting path +
-- a route-sync test.
ALTER TABLE public.pages
  ADD CONSTRAINT pages_slug_format
  CHECK (slug ~ '^[a-z0-9-]+$' AND char_length(slug) BETWEEN 1 AND 80);
