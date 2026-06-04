-- Phase 6 A/B variant serving: record one `ab_impression` per served variant on
-- a public page view, so the analytics A/B panel can compute a true conversion
-- rate (conversions / impressions) for each variant. Idempotent.

alter table public.checkout_events
  drop constraint if exists checkout_events_event_type_check;

alter table public.checkout_events
  add constraint checkout_events_event_type_check
  check (
    event_type in (
      'checkout_view',
      'checkout_attempt',
      'provider_redirect',
      'stripe_session_created',
      'stripe_missing_config',
      'stripe_error',
      'stripe_price_sync',
      'directory_click',
      'agent_page_view',
      'ab_impression'
    )
  );
