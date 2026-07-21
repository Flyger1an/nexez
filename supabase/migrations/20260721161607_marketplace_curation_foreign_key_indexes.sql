-- Cover reviewer foreign keys so auth.users updates/deletes and reviewer-history
-- queries do not scan the curation ledgers as marketplace inventory grows.
create index marketplace_curations_reviewed_by_idx
  on public.marketplace_curations (reviewed_by);

create index marketplace_curation_events_actor_id_idx
  on public.marketplace_curation_events (actor_id);
