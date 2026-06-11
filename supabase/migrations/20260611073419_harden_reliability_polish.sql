-- Reliability polish: keep the Stripe webhook event ledger service-role only
-- while satisfying RLS advisor checks, and pin the trigger function search path.

alter function public.nz_negotiation_money_safety()
  set search_path = public, pg_temp;

drop policy if exists "deny client access to stripe webhook events" on public.stripe_webhook_events;
create policy "deny client access to stripe webhook events"
  on public.stripe_webhook_events
  for all
  using (false)
  with check (false);
