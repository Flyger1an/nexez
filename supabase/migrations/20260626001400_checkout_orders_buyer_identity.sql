-- Buyer identity on direct-checkout orders.
--
-- Direct agent checkout (POST /api/checkout) carried NO buyer identity - the Stripe
-- session metadata was all page/owner/offer, so the only buyer signal was the email
-- Stripe collected on its hosted page (captured post-hoc into buyer_email). An agent
-- buying for a principal had no way to DECLARE who the buyer is, so the seller never
-- learned the buyer's name or any buyer-side reference, and a headless purchase
-- captured nothing.
--
-- Add first-class buyer-identity columns (nullable; populated from the declared
-- checkout input via session metadata, with Stripe's collected email still winning for
-- buyer_email). checkout_orders is owner-SELECT-only / service-role-write, and is NOT
-- part of pages_public, so no view/PUBLIC_PAGE_SELECT coupling. Additive - existing
-- rows keep null.
alter table public.checkout_orders
  add column if not exists buyer_name text,
  add column if not exists buyer_reference text,
  add column if not exists buyer_agent text;
