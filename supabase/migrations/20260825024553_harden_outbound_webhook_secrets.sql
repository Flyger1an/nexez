-- Account webhook secrets were historically owner-RLS-readable. The API now
-- encrypts them and returns only a presence bit, so browser roles must not be
-- able to bypass that boundary with a direct Data API query or write.

revoke all on table public.outbound_webhooks from anon, authenticated;
grant select, insert, update, delete on table public.outbound_webhooks to service_role;

comment on column public.outbound_webhooks.secret is
  'AES-256-GCM encrypted webhook signing secret. Service-role only. Legacy plaintext is upgraded by the authenticated server route.';
