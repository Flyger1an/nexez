-- Commerce Template lineage v1.
--
-- A merchant may deliberately start a new intake interview from a versioned
-- Commerce Template. The template supplies question context, never merchant
-- facts. These owner-only columns preserve that adoption after the interview
-- creates a listing, without adding the lineage to pages_public or allowing it
-- to mutate alongside merchant-authored listing content.

alter table public.pages
  add column if not exists commerce_template_id text,
  add column if not exists commerce_template_version integer,
  add column if not exists commerce_template_adopted_at timestamptz,
  add column if not exists commerce_template_source text;

do $$
begin
  alter table public.pages
    add constraint pages_commerce_template_lineage_complete_check
    check (
      (
        commerce_template_id is null
        and commerce_template_version is null
        and commerce_template_adopted_at is null
        and commerce_template_source is null
      )
      or
      (
        commerce_template_id is not null
        and commerce_template_version is not null
        and commerce_template_adopted_at is not null
        and commerce_template_source is not null
      )
    );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.pages
    add constraint pages_commerce_template_id_format_check
    check (
      commerce_template_id is null
      or commerce_template_id ~ '^[a-z][a-z0-9-]*([.][a-z][a-z0-9-]*)+$'
    );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.pages
    add constraint pages_commerce_template_version_check
    check (
      commerce_template_version is null
      or commerce_template_version between 1 and 1000000
    );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.pages
    add constraint pages_commerce_template_source_check
    check (
      commerce_template_source is null
      or commerce_template_source = 'owner_selected_intake'
    );
exception when duplicate_object then null;
end;
$$;

comment on column public.pages.commerce_template_id is
  'Owner-only ID of the exact Commerce Template deliberately selected for the listing intake interview.';
comment on column public.pages.commerce_template_version is
  'Owner-only version of the selected Commerce Template. It never updates merchant listing content.';
comment on column public.pages.commerce_template_adopted_at is
  'Owner-only timestamp from the selected template source recorded when the intake session began.';
comment on column public.pages.commerce_template_source is
  'Owner-only adoption path. V1 supports owner_selected_intake.';

create or replace function private.nz_protect_page_commerce_template_lineage()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
    and new.commerce_template_id is not null
    and current_user not in ('service_role', 'postgres') then
    raise exception 'commerce_template_lineage_server_only' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
    and row(
      new.commerce_template_id,
      new.commerce_template_version,
      new.commerce_template_adopted_at,
      new.commerce_template_source
    ) is distinct from row(
      old.commerce_template_id,
      old.commerce_template_version,
      old.commerce_template_adopted_at,
      old.commerce_template_source
    ) then
    raise exception 'commerce_template_lineage_immutable' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.nz_protect_page_commerce_template_lineage()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_protect_page_commerce_template_lineage on public.pages;
create trigger trg_protect_page_commerce_template_lineage
  before insert or update
  on public.pages
  for each row execute function private.nz_protect_page_commerce_template_lineage();
