-- Phase 3: Per-page outbound webhook endpoints for automatic firing on booking / integration events.
-- Stored as JSONB array of {url, secret?} objects. Additive only.

ALTER TABLE public.pages
ADD COLUMN IF NOT EXISTS outbound_webhooks jsonb;

NOTIFY pgrst, 'reload schema';
ANALYZE public.pages;
