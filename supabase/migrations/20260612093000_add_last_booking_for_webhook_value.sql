-- Phase 3: Add last_booking JSONB for durable Calendly (and future integration) booking summaries persisted on the page.
-- This makes webhook-delivered "last booking" survive refreshes and appear in editor + public agent page.
-- Additive only. Safe to re-run.

ALTER TABLE public.pages
ADD COLUMN IF NOT EXISTS last_booking jsonb;

-- Refresh PostgREST schema cache immediately (critical after prior column additions)
NOTIFY pgrst, 'reload schema';

-- Update planner statistics
ANALYZE public.pages;
