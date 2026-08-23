-- Cancel-on-refund linkage for Calendly bookings.
--
-- When a negotiation surfaces a Calendly scheduling link, the link is tagged with
-- `utm_content=nz_neg_<id>`. Calendly echoes that tracking value back on the
-- invitee.created webhook, which lets us record the exact scheduled-event URI on
-- THIS negotiation (calendly_event_uri) - an exact link, not a fuzzy email match.
-- On a full refund / lost dispute the Stripe webhook then cancels that Calendly
-- event via the seller's stored PAT and stamps calendly_cancelled_at (idempotency
-- marker so the booking is cancelled at most once).
--
-- Both columns are internal write-side bookkeeping: written by the service-role
-- webhooks only, never exposed to agents (agent.json / pages_public omit them).

alter table public.agent_negotiations
  add column if not exists calendly_event_uri text,
  add column if not exists calendly_cancelled_at timestamptz;

comment on column public.agent_negotiations.calendly_event_uri is
  'Calendly scheduled-event URI linked to this negotiation via the invitee webhook tracking param (nz_neg_<id>). Service-role only; used for cancel-on-refund.';
comment on column public.agent_negotiations.calendly_cancelled_at is
  'When the linked Calendly event was cancelled after a refund/lost-dispute (idempotency marker; NULL = not cancelled). Service-role only.';
