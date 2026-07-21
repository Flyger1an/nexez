-- Application roles already have SELECT-only access to the event ledger. A BEFORE
-- UPDATE/DELETE trigger is unnecessarily stronger: it also intercepts FK cascades
-- when a seller deletes a page and ON DELETE SET NULL when a reviewer deletes their
-- account. Keep append-only semantics at the ACL boundary and preserve data lifecycle.
drop trigger if exists trg_marketplace_events_append_only
  on public.marketplace_curation_events;

drop function if exists private.nz_reject_marketplace_event_mutation();

comment on table public.marketplace_curation_events is
  'Append-only to application roles through SELECT-only ACLs; rows follow page deletion by foreign-key cascade.';
