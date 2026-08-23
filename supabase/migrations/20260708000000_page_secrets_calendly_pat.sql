-- Per-page Calendly credential storage - the persistent secret the future
-- write-side calendar blocking needs (server creates scheduled events / queries
-- slot inventory with the seller's own Calendly PAT).
--
-- Stored AES-256-GCM ENCRYPTED (lib/server/secret-crypto.ts) so a DB dump can't
-- yield a usable token; the key lives only in the deployment env. Owner SELECT
-- is REVOKED on this column (unlike calendly_webhook_secret, which owners can
-- read) so the ciphertext is service-role-only - the app never returns it to a
-- client; the seller sees a "connected" boolean, and can overwrite or clear it.

alter table public.page_secrets
  add column if not exists calendly_pat_encrypted text;

-- Carve this column out of authenticated reads. A plain column-level REVOKE is a
-- no-op while a TABLE-level SELECT grant exists (the table grant supersedes it),
-- so switch page_secrets to COLUMN-level SELECT grants: authenticated may read
-- every column EXCEPT calendly_pat_encrypted. Owners still read their own safe
-- columns via RLS; only the service role (bypasses grants) reads the ciphertext.
revoke select on public.page_secrets from authenticated;
grant select (
  page_id, owner_id, calendly_webhook_secret, outbound_webhooks,
  domain_verification_token, created_at, updated_at
) on public.page_secrets to authenticated;

comment on column public.page_secrets.calendly_pat_encrypted is
  'AES-256-GCM encrypted Calendly Personal Access Token (per-page). Service-role read only; decrypt via lib/server/secret-crypto. Never returned to clients.';
