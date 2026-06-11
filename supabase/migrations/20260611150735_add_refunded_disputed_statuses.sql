alter table public.agent_negotiations drop constraint if exists agent_negotiations_status_check;

alter table public.agent_negotiations
  add constraint agent_negotiations_status_check
  check (status = any (array[
    'negotiation',
    'agreement_proposed',
    'held',
    'complete',
    'declined',
    'expired',
    'refunded',
    'disputed'
  ]));
