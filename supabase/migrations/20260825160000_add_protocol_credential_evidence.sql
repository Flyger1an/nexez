-- Record non-secret delegated-payment evidence on the append-only order timeline.
-- The credential token is never stored. Existing rows remain valid.

alter table public.checkout_order_events
  drop constraint if exists checkout_order_events_event_type_check;

alter table public.checkout_order_events
  add constraint checkout_order_events_event_type_check check (event_type in (
    'order_recorded',
    'payment_confirmed',
    'fulfillment_updated',
    'refund_recorded',
    'dispute_opened',
    'dispute_resolved',
    'buyer_request_received',
    'buyer_request_updated',
    'review_received',
    'resource_reserved',
    'resource_fulfilled',
    'protocol_credential_confirmed'
  ));

comment on table public.checkout_order_events is
  'Append-only merchant audit trail for order operations, externally proven money changes, and token-free protocol credential evidence.';
