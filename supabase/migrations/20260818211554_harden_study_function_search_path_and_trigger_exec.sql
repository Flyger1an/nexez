alter function public.claim_study_targets(integer, text)
  set search_path = pg_catalog, public;

alter function public.study_drive(text, text)
  set search_path = pg_catalog, public, net;

revoke execute on function public.nz_negotiation_money_safety() from public, anon, authenticated;
revoke execute on function public.nz_pages_guard_domain_verification() from public, anon, authenticated;
revoke execute on function public.nz_touch_intake_sessions_updated_at() from public, anon, authenticated;
revoke execute on function public.set_billing_subscriptions_updated_at() from public, anon, authenticated;
revoke execute on function public.set_checkout_sessions_updated_at() from public, anon, authenticated;
revoke execute on function public.set_order_requests_updated_at() from public, anon, authenticated;
revoke execute on function public.set_order_reviews_updated_at() from public, anon, authenticated;
revoke execute on function public.set_pages_updated_at() from public, anon, authenticated;
revoke execute on function public.set_support_tickets_updated_at() from public, anon, authenticated;
