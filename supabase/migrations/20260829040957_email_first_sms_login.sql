-- Keep the email-to-phone binding used by text login server-only. The browser
-- submits an account email, but it never receives the verified phone number.
-- A trigger mirrors only users whose email and phone are both confirmed.

create table public.sms_login_identifiers (
  user_id          uuid        primary key references auth.users(id) on delete cascade,
  email_normalized text        not null unique,
  phone_e164       text        not null unique,
  verified_at      timestamptz not null,
  updated_at       timestamptz not null default now(),

  constraint sms_login_identifiers_email_normalized_check
    check (email_normalized = lower(btrim(email_normalized))),
  constraint sms_login_identifiers_email_shape_check
    check (char_length(email_normalized) <= 254 and email_normalized ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint sms_login_identifiers_phone_e164_check
    check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint sms_login_identifiers_verified_at_finite_check
    check (isfinite(verified_at))
);

comment on table public.sms_login_identifiers is
  'Server-only lookup for email-first SMS login. Contains only confirmed auth user email and phone bindings.';

alter table public.sms_login_identifiers enable row level security;
revoke all on public.sms_login_identifiers from anon, authenticated, service_role;
grant select on public.sms_login_identifiers to service_role;

create or replace function private.nz_sync_sms_login_identifier()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_email text;
  v_phone text;
begin
  if new.email is null
    or new.email_confirmed_at is null
    or new.phone is null
    or new.phone_confirmed_at is null then
    delete from public.sms_login_identifiers where user_id = new.id;
    return new;
  end if;

  v_email := lower(btrim(new.email));
  v_phone := btrim(new.phone);
  if left(v_phone, 1) <> '+' then
    v_phone := '+' || v_phone;
  end if;

  if char_length(v_email) > 254
    or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    delete from public.sms_login_identifiers where user_id = new.id;
    return new;
  end if;

  insert into public.sms_login_identifiers (
    user_id,
    email_normalized,
    phone_e164,
    verified_at,
    updated_at
  ) values (
    new.id,
    v_email,
    v_phone,
    greatest(new.email_confirmed_at, new.phone_confirmed_at),
    now()
  )
  on conflict (user_id) do update
  set email_normalized = excluded.email_normalized,
      phone_e164 = excluded.phone_e164,
      verified_at = excluded.verified_at,
      updated_at = excluded.updated_at;

  return new;
end;
$$;

revoke all on function private.nz_sync_sms_login_identifier()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_sync_sms_login_identifier on auth.users;
create trigger trg_sync_sms_login_identifier
  after insert or update of email, email_confirmed_at, phone, phone_confirmed_at
  on auth.users
  for each row execute function private.nz_sync_sms_login_identifier();

insert into public.sms_login_identifiers (
  user_id,
  email_normalized,
  phone_e164,
  verified_at,
  updated_at
)
select
  auth_user.id,
  lower(btrim(auth_user.email)),
  case
    when left(btrim(auth_user.phone), 1) = '+' then btrim(auth_user.phone)
    else '+' || btrim(auth_user.phone)
  end,
  greatest(auth_user.email_confirmed_at, auth_user.phone_confirmed_at),
  now()
from auth.users auth_user
where auth_user.email is not null
  and auth_user.email_confirmed_at is not null
  and auth_user.phone is not null
  and auth_user.phone_confirmed_at is not null
  and char_length(lower(btrim(auth_user.email))) <= 254
  and lower(btrim(auth_user.email)) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  and (
    case
      when left(btrim(auth_user.phone), 1) = '+' then btrim(auth_user.phone)
      else '+' || btrim(auth_user.phone)
    end
  ) ~ '^\+[1-9][0-9]{7,14}$'
on conflict (user_id) do update
set email_normalized = excluded.email_normalized,
    phone_e164 = excluded.phone_e164,
    verified_at = excluded.verified_at,
    updated_at = excluded.updated_at;
