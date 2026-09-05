-- Credential verdicts and storage identities are server authority. RLS on the
-- surrounding page does not make owner-supplied verification JSON trustworthy.
create or replace function private.nz_guard_credential_authority()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if coalesce(new.verification_details, '{}'::jsonb) <> '{}'::jsonb then
        raise exception 'Credential verification is managed by the server.' using errcode = '42501';
      end if;
    elsif new.verification_details is distinct from old.verification_details then
      raise exception 'Credential verification is managed by the server.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.nz_guard_credential_authority() from public, anon, authenticated;
create trigger nz_guard_credential_authority
  before insert or update of verification_details on public.pages
  for each row execute function private.nz_guard_credential_authority();
