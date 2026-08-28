-- Calendly requires OAuth for public applications that connect multiple
-- merchant accounts. Keep legacy personal tokens readable during migration,
-- while storing new Calendly OAuth credentials in the service-role-only table.

alter table public.merchant_connector_connections
  drop constraint merchant_connector_provider_check;

alter table public.merchant_connector_connections
  add constraint merchant_connector_provider_check check (
    provider in ('calendly', 'square', 'acuity', 'google_calendar', 'woocommerce', 'servicem8')
  );
