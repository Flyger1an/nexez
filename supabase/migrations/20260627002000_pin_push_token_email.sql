-- HIGH (red-team gauntlet): user_push_tokens.email was attacker-spoofable.
--
-- The table is directly writable via the PostgREST Data API (authenticated holds
-- INSERT/UPDATE) and its only RLS check is auth.uid() = user_id - the `email` column was
-- free-form. The async push senders (lib/push.ts sendPushToEmail → tokensBy('email',..))
-- fan out to every token row matching a buyer_email, and the Stripe webhook +
-- negotiation engine push the buyer's ORDER/NEGOTIATION PORTAL TOKEN (the bearer secret
-- for /orders/<token>). So an attacker could INSERT { user_id: self, token: own-device,
-- email: 'victim@x.com' } (RLS passes - user_id is theirs), then receive the victim's
-- portal tokens on their own device and hijack the victim's order portal.
--
-- Fix: pin `email` to the row owner's CONFIRMED auth email with a BEFORE INSERT/UPDATE
-- trigger, so the column is non-spoofable regardless of write path, and reject tokens
-- for accounts without a confirmed email (the same confirmation gate the rest of the
-- money path enforces). Mirrors the nz_pages_pin_owner pattern.

create or replace function public.nz_pin_push_token_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  owner_email text;
begin
  select lower(email) into owner_email
  from auth.users
  where id = new.user_id and email_confirmed_at is not null;
  if owner_email is null then
    raise exception 'push token requires a confirmed account email';
  end if;
  new.email := owner_email;
  return new;
end;
$$;

-- Trigger-only function - not callable directly by clients.
revoke all on function public.nz_pin_push_token_email() from anon, authenticated, public;

drop trigger if exists nz_pin_push_token_email on public.user_push_tokens;
create trigger nz_pin_push_token_email
  before insert or update on public.user_push_tokens
  for each row execute function public.nz_pin_push_token_email();

-- Heal existing rows: re-point any drifted/spoofed email to the owner's confirmed email,
-- and drop tokens whose owner has no confirmed email (can't be a valid recipient).
delete from public.user_push_tokens t
  where not exists (
    select 1 from auth.users u where u.id = t.user_id and u.email_confirmed_at is not null
  );
update public.user_push_tokens t
  set email = lower(u.email)
  from auth.users u
  where u.id = t.user_id and t.email is distinct from lower(u.email);

-- Defense-in-depth: the new agent/push tables don't need anon DML (RLS already blocks
-- anon - no anon policy exists). Revoke the unused grant surface.
revoke all on table public.user_push_tokens from anon;
