-- Per-page Square + Acuity credential storage - same encrypted, service-role-only
-- model as Calendly/Shopify, completing "connect once → stored → re-sync without
-- re-pasting the token" for every per-seller token provider. Each is ONE AES-GCM
-- encrypted JSON blob: Square {accessToken}, Acuity {userId, apiKey}.

alter table public.page_secrets
  add column if not exists square_credentials_encrypted text,
  add column if not exists acuity_credentials_encrypted text;

-- page_secrets uses COLUMN-level SELECT grants for `authenticated`; a new column
-- gets NO grant by default (already carved out). Make it explicit.
revoke select (square_credentials_encrypted, acuity_credentials_encrypted) on public.page_secrets from authenticated;

comment on column public.page_secrets.square_credentials_encrypted is
  'AES-256-GCM encrypted JSON {accessToken} for the per-page Square connection. Service-role read only; never returned to clients.';
comment on column public.page_secrets.acuity_credentials_encrypted is
  'AES-256-GCM encrypted JSON {userId, apiKey} for the per-page Acuity connection. Service-role read only; never returned to clients.';
