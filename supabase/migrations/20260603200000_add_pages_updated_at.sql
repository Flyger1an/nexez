-- Content-freshness: track when a page was last modified (auto-maintained trigger).
alter table public.pages
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_pages_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists pages_set_updated_at on public.pages;
create trigger pages_set_updated_at
  before update on public.pages
  for each row
  execute function public.set_pages_updated_at();

update public.pages set updated_at = coalesce(created_at, now()) where updated_at is null;
