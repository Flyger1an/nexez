-- Stop storing buyer bearer credentials in recoverable plaintext.
--
-- `checkout_orders.access_token` and `agent_negotiations.status_token` are bearer
-- credentials: whoever holds one can open that order or negotiation. Both are high
-- entropy (two concatenated UUIDs / a UUID), so brute force is not the concern. The
-- concern is that a database dump is a set of live credentials.
--
-- WHY BOTH A HASH AND A CIPHERTEXT, rather than just hashing:
--
-- Hashing alone is the textbook answer and it does not fit these two tokens,
-- because the server has to REBUILD the buyer's link after issuance in three real
-- flows, none of which have the plaintext in scope:
--
--   1. The Stripe webhook emails a receipt with `/orders/<token>`, reading the token
--      back from the row (it is minted by a column DEFAULT, so the app never held
--      it), and must still work on a webhook redelivery.
--   2. `findOrdersByEmail` ("find my orders") returns a per-row token for every
--      order AND negotiation matching a buyer email, for a buyer with no session.
--   3. The owner dashboard deep-links to `/negotiate/{id}?token=...`.
--
-- So: a deterministic SHA-256 as a BLIND INDEX for the equality lookups that used
-- to hit the plaintext column, plus AES-256-GCM ciphertext for the cases that must
-- recover the value. The GCM payload uses a random IV and is therefore not
-- searchable, which is exactly why the separate hash column exists.
--
-- Plain SHA-256, not HMAC, on purpose: it lets this migration backfill the index in
-- SQL, so lookups can cut over without waiting on an application backfill. The
-- inputs are 128+ bits of CSPRNG output, so there is no dictionary to attack.
--
-- This migration is ADDITIVE and changes no behaviour. It adds the columns and
-- backfills the hashes. Ciphertext is written by the application (the key lives in
-- INTEGRATION_SECRET_KEY, never in the database) and the plaintext columns stay
-- until that backfill is verified. Dropping them is a separate, later migration.

alter table public.checkout_orders
  add column if not exists access_token_sha256 text,
  add column if not exists access_token_encrypted text;

alter table public.agent_negotiations
  add column if not exists status_token_sha256 text,
  add column if not exists status_token_encrypted text;

-- Backfill the blind index from the plaintext still present today.
update public.checkout_orders
   set access_token_sha256 = encode(extensions.digest(access_token, 'sha256'), 'hex')
 where access_token is not null
   and access_token_sha256 is null;

update public.agent_negotiations
   set status_token_sha256 = encode(extensions.digest(status_token, 'sha256'), 'hex')
 where status_token is not null
   and status_token_sha256 is null;

-- The hash inherits the uniqueness the plaintext column had, so a lookup by hash is
-- as unambiguous as the lookup it replaces.
create unique index if not exists checkout_orders_access_token_sha256_uidx
  on public.checkout_orders (access_token_sha256)
  where access_token_sha256 is not null;

create unique index if not exists agent_negotiations_status_token_sha256_uidx
  on public.agent_negotiations (status_token_sha256)
  where status_token_sha256 is not null;

-- Keep the blind index in lockstep with the plaintext, in the database rather than
-- in application code. This matters most for `checkout_orders.access_token`, which
-- is minted by a column DEFAULT: the application never sees that value, so it could
-- not hash it even if every writer remembered to. With the trigger, the index is
-- correct for every row from the moment it exists, which is what makes flipping the
-- lookups to it safe. When the plaintext columns are eventually dropped, these
-- triggers go with them and the application writes the hash directly.

create or replace function private.nz_sync_bearer_token_hash()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'checkout_orders' then
    new.access_token_sha256 := case
      when new.access_token is null then null
      else encode(extensions.digest(new.access_token, 'sha256'), 'hex')
    end;
  elsif tg_table_name = 'agent_negotiations' then
    new.status_token_sha256 := case
      when new.status_token is null then null
      else encode(extensions.digest(new.status_token, 'sha256'), 'hex')
    end;
  end if;
  return new;
end;
$$;

revoke all on function private.nz_sync_bearer_token_hash() from public, anon, authenticated;

drop trigger if exists trg_checkout_orders_token_hash on public.checkout_orders;
create trigger trg_checkout_orders_token_hash
  before insert or update of access_token on public.checkout_orders
  for each row execute function private.nz_sync_bearer_token_hash();

drop trigger if exists trg_agent_negotiations_token_hash on public.agent_negotiations;
create trigger trg_agent_negotiations_token_hash
  before insert or update of status_token on public.agent_negotiations
  for each row execute function private.nz_sync_bearer_token_hash();

comment on column public.checkout_orders.access_token_sha256 is
  'SHA-256 of the buyer portal bearer token, hex. Blind index: every lookup that used to match access_token matches this instead. Not a secret.';
comment on column public.checkout_orders.access_token_encrypted is
  'AES-256-GCM ciphertext of the buyer portal bearer token (v1.<iv>.<ct>.<tag>), written by the app under INTEGRATION_SECRET_KEY. Recovery only, for rebuilding receipt and portal links; never searchable (random IV).';
comment on column public.agent_negotiations.status_token_sha256 is
  'SHA-256 of the negotiation status token, hex. Blind index for lookups that used to match status_token. Not a secret.';
comment on column public.agent_negotiations.status_token_encrypted is
  'AES-256-GCM ciphertext of the negotiation status token, written by the app under INTEGRATION_SECRET_KEY. Recovery only, for find-my-orders and the owner deep link.';
