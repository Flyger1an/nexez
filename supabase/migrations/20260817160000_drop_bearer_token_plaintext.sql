-- Drop the plaintext bearer token columns. This is the step that actually makes a
-- database dump stop being a set of live credentials.
--
-- ============================================================================
-- DO NOT APPLY until PR #49 is MERGED AND DEPLOYED.
-- ============================================================================
-- The currently deployed code still reads `access_token` / `status_token` as a
-- fallback in `recoverBearerToken`. Dropping them ahead of that deploy breaks the
-- buyer order portal, the receipt links and find-my-orders, all silently: the row
-- still resolves and only the link goes dead. Verify the deployment is serving the
-- new code first.
--
-- Preconditions, all verified on 2026-08-17 before this file was written:
--   * every row carries a blind index and a ciphertext
--     (checkout_orders 3/3, agent_negotiations 51/51)
--   * every ciphertext decrypts back to exactly its plaintext (54/54, 0 mismatches)
--   * the key used for that backfill is the same one the deployment holds, proven by
--     decrypting an existing production ciphertext with it
-- Re-run `scripts/backfill-bearer-ciphertext.mjs --dry-run` immediately before
-- applying; both tables must report 0 rows needing ciphertext.

-- ---------------------------------------------------------------------------
-- 1. Preserve an already-issued token across an upsert
-- ---------------------------------------------------------------------------
-- With the plaintext column gone, the application mints the token and writes the
-- hash and ciphertext itself. All three order writers are UPSERTs, so a Stripe
-- redelivery would otherwise arrive carrying a NEWLY minted token and overwrite the
-- one already emailed to the buyer, invalidating their link.
--
-- The old column DEFAULT could not be clobbered that way, because the writers simply
-- omitted the column. This trigger restores that property explicitly: on UPDATE, an
-- existing hash/ciphertext always wins. Inserts are untouched, so a genuinely new
-- row gets the token the application minted.

create or replace function private.nz_preserve_bearer_token()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'checkout_orders' then
    new.access_token_sha256 := coalesce(old.access_token_sha256, new.access_token_sha256);
    new.access_token_encrypted := coalesce(old.access_token_encrypted, new.access_token_encrypted);
  elsif tg_table_name = 'agent_negotiations' then
    new.status_token_sha256 := coalesce(old.status_token_sha256, new.status_token_sha256);
    new.status_token_encrypted := coalesce(old.status_token_encrypted, new.status_token_encrypted);
  end if;
  return new;
end;
$$;

revoke all on function private.nz_preserve_bearer_token() from public, anon, authenticated;

drop trigger if exists trg_checkout_orders_preserve_token on public.checkout_orders;
create trigger trg_checkout_orders_preserve_token
  before update on public.checkout_orders
  for each row execute function private.nz_preserve_bearer_token();

drop trigger if exists trg_agent_negotiations_preserve_token on public.agent_negotiations;
create trigger trg_agent_negotiations_preserve_token
  before update on public.agent_negotiations
  for each row execute function private.nz_preserve_bearer_token();

-- ---------------------------------------------------------------------------
-- 2. Retire the plaintext-derived machinery
-- ---------------------------------------------------------------------------
-- These kept the blind index in step with the plaintext column. With no plaintext
-- there is nothing to derive from: the application writes the hash directly.

drop trigger if exists trg_checkout_orders_token_hash on public.checkout_orders;
drop trigger if exists trg_agent_negotiations_token_hash on public.agent_negotiations;
drop function if exists private.nz_sync_bearer_token_hash();

-- ---------------------------------------------------------------------------
-- 3. Drop the plaintext
-- ---------------------------------------------------------------------------
-- The unique index on the plaintext column goes with it; the equivalent uniqueness
-- now lives on *_sha256 (created in 20260817130715).

drop index if exists public.checkout_orders_access_token_uidx;

alter table public.checkout_orders
  alter column access_token drop default;

alter table public.checkout_orders
  drop column if exists access_token;

alter table public.agent_negotiations
  drop column if exists status_token;

comment on column public.checkout_orders.access_token_encrypted is
  'AES-256-GCM ciphertext of the buyer portal bearer token. Now the ONLY recoverable copy: the plaintext column was dropped in 20260817160000. Losing INTEGRATION_SECRET_KEY makes every buyer portal link unrecoverable.';
comment on column public.agent_negotiations.status_token_encrypted is
  'AES-256-GCM ciphertext of the negotiation status token. Now the ONLY recoverable copy. See the note on checkout_orders.access_token_encrypted.';
