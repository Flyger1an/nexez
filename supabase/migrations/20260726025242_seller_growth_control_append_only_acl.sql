-- Supabase grants broad service_role privileges to new public tables by
-- default. Narrow the operator ledger after creation so application code can
-- append and read audit evidence, but cannot rewrite or delete it.

revoke all on table public.seller_growth_campaign_admin_events
  from anon, authenticated, service_role;
grant select, insert on table public.seller_growth_campaign_admin_events
  to service_role;

revoke all on sequence public.seller_growth_campaign_admin_events_id_seq
  from anon, authenticated, service_role;
grant usage, select on sequence public.seller_growth_campaign_admin_events_id_seq
  to service_role;
