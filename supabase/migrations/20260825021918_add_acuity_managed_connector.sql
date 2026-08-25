-- Acuity recommends OAuth for applications that connect many merchant
-- accounts. Extend the encrypted, service-role-only connector store so Acuity
-- can use the same state-bound OAuth flow as the other managed providers.

alter table public.merchant_connector_connections
  drop constraint merchant_connector_provider_check;

alter table public.merchant_connector_connections
  add constraint merchant_connector_provider_check check (
    provider in ('square', 'acuity', 'google_calendar', 'woocommerce', 'servicem8')
  );
