-- Track public discovery clicks and agent page views as first-class analytics signals.
-- These are not conversions, but they prove the discovery surface is driving traffic.

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
      'agent_page_view'
    )
  );
