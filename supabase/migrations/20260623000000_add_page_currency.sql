-- Multi-currency: a page-level settlement currency for offer checkout. Defaults
-- to 'usd' so every existing page keeps its current (USD) behavior. The page
-- currency is the source of truth for what a buyer is charged; offer price
-- strings remain plain amounts. Stripe wants lowercase ISO 4217 codes.
alter table public.pages
  add column if not exists currency text not null default 'usd';
