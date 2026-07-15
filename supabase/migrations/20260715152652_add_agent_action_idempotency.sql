-- Public agent clients may retry after losing a response. Store only a scoped
-- SHA-256 digest of their high-entropy Idempotency-Key, never the raw credential.
-- The partial unique indexes make fresh proposals and follow-up turns race-safe.

alter table public.agent_negotiations
  add column if not exists idempotency_key_hash text,
  add column if not exists idempotency_request_hash text;

alter table public.agent_negotiations
  drop constraint if exists agent_negotiations_idempotency_hash_format;

alter table public.agent_negotiations
  add constraint agent_negotiations_idempotency_hash_format
  check (
    (idempotency_key_hash is null or idempotency_key_hash ~ '^[0-9a-f]{64}$')
    and (idempotency_request_hash is null or idempotency_request_hash ~ '^[0-9a-f]{64}$')
  );

create unique index if not exists agent_negotiations_idempotency_hash_uidx
  on public.agent_negotiations (idempotency_key_hash)
  where idempotency_key_hash is not null;

comment on column public.agent_negotiations.idempotency_key_hash is
  'Scoped SHA-256 digest of a public agent Idempotency-Key. Service-role only; raw keys are never stored.';
comment on column public.agent_negotiations.idempotency_request_hash is
  'SHA-256 digest of the request payload used to reject same-key, different-action replays.';

alter table public.negotiation_messages
  add column if not exists idempotency_key_hash text,
  add column if not exists idempotency_request_hash text;

alter table public.negotiation_messages
  drop constraint if exists negotiation_messages_idempotency_hash_format;

alter table public.negotiation_messages
  add constraint negotiation_messages_idempotency_hash_format
  check (
    (idempotency_key_hash is null or idempotency_key_hash ~ '^[0-9a-f]{64}$')
    and (idempotency_request_hash is null or idempotency_request_hash ~ '^[0-9a-f]{64}$')
  );

create unique index if not exists negotiation_messages_idempotency_hash_uidx
  on public.negotiation_messages (idempotency_key_hash)
  where idempotency_key_hash is not null;

comment on column public.negotiation_messages.idempotency_key_hash is
  'Scoped SHA-256 digest used to collapse retried buyer turns. Service-role only; raw keys are never stored.';
comment on column public.negotiation_messages.idempotency_request_hash is
  'SHA-256 digest of the buyer-turn request used to reject same-key, different-action replays.';
