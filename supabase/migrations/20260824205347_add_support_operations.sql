-- Support operations foundation:
-- 1. Record whether a persisted ticket reached the support inbox.
-- 2. Keep admin-only actions in an append-only event history.
-- 3. Remove owner-side UPDATE access so ticket workflow state is controlled by
--    authorized platform operators, not by the public Data API.

alter table public.support_tickets
  add column if not exists notification_status text not null default 'pending',
  add column if not exists notification_email_id text,
  add column if not exists notified_at timestamptz,
  add column if not exists resolved_at timestamptz;

alter table public.support_tickets
  drop constraint if exists support_tickets_notification_status_check;

alter table public.support_tickets
  add constraint support_tickets_notification_status_check
  check (notification_status in ('pending', 'sent', 'failed'));

create index if not exists support_tickets_status_created_idx
  on public.support_tickets (status, created_at desc);

create index if not exists support_tickets_notification_status_idx
  on public.support_tickets (notification_status, created_at desc);

create table if not exists public.support_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('created', 'email_sent', 'email_failed', 'status_changed', 'note_added')),
  from_status text,
  to_status text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists support_ticket_events_ticket_created_idx
  on public.support_ticket_events (ticket_id, created_at desc);

create index if not exists support_ticket_events_actor_created_idx
  on public.support_ticket_events (actor_id, created_at desc)
  where actor_id is not null;

alter table public.support_ticket_events enable row level security;

revoke all on public.support_ticket_events from anon, authenticated;
revoke update on public.support_tickets from authenticated;
revoke insert on public.support_tickets from authenticated;

grant insert (
  owner_id,
  page_id,
  page_name,
  subject,
  category,
  priority,
  query,
  ai_response,
  metadata,
  reference
) on public.support_tickets to authenticated;

grant select, update on public.support_tickets to service_role;
grant select, insert on public.support_ticket_events to service_role;
revoke update, delete on public.support_ticket_events from service_role;

drop policy if exists "owners update own support tickets" on public.support_tickets;

create or replace function public.transition_support_ticket(
  p_ticket_id uuid,
  p_actor_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_prior_status text;
  v_note text := nullif(btrim(p_note), '');
begin
  if p_status not in ('open', 'waiting_on_user', 'in_review', 'resolved', 'closed') then
    raise exception 'invalid support status' using errcode = '22023';
  end if;

  if length(v_note) > 2000 then
    raise exception 'support note is too long' using errcode = '22001';
  end if;

  if not exists (
    select 1
    from public.platform_admins
    where user_id = p_actor_id
  ) then
    raise exception 'platform-admin access required' using errcode = '42501';
  end if;

  select status
  into v_prior_status
  from public.support_tickets
  where id = p_ticket_id
  for update;

  if not found then
    raise exception 'support request not found' using errcode = 'P0002';
  end if;

  if v_prior_status = p_status and v_note is null then
    raise exception 'support update has no change' using errcode = '22023';
  end if;

  if v_prior_status is distinct from p_status then
    update public.support_tickets
    set
      status = p_status,
      resolved_at = case
        when p_status in ('resolved', 'closed') then now()
        else null
      end
    where id = p_ticket_id;
  end if;

  insert into public.support_ticket_events (
    ticket_id,
    actor_id,
    event_type,
    from_status,
    to_status,
    note
  ) values (
    p_ticket_id,
    p_actor_id,
    case when v_prior_status is distinct from p_status then 'status_changed' else 'note_added' end,
    v_prior_status,
    p_status,
    v_note
  );
end;
$function$;

revoke all on function public.transition_support_ticket(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.transition_support_ticket(uuid, uuid, text, text)
  to service_role;

-- Platform-admin delegation remains a trusted server operation. The RPC
-- verifies the acting administrator again inside the same transaction that
-- writes membership and its permanent audit evidence.

create table if not exists public.platform_admin_grant_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_email text not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists platform_admin_grant_events_actor_created_idx
  on public.platform_admin_grant_events (actor_id, created_at desc)
  where actor_id is not null;

create index if not exists platform_admin_grant_events_target_created_idx
  on public.platform_admin_grant_events (target_user_id, created_at desc)
  where target_user_id is not null;

alter table public.platform_admin_grant_events enable row level security;

revoke all on public.platform_admin_grant_events from anon, authenticated;
grant select, insert on public.platform_admin_grant_events to service_role;
revoke update, delete on public.platform_admin_grant_events from service_role;

create or replace function public.grant_platform_admin_by_email(
  p_actor_id uuid,
  p_email text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email text := lower(btrim(p_email));
  v_note text := nullif(btrim(p_note), '');
  v_target_user_id uuid;
begin
  if not exists (
    select 1
    from public.platform_admins
    where user_id = p_actor_id
  ) then
    raise exception 'platform-admin access required' using errcode = '42501';
  end if;

  if v_email = '' or length(v_email) > 320 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'valid account email required' using errcode = '22023';
  end if;

  if length(v_note) > 500 then
    raise exception 'admin access note is too long' using errcode = '22001';
  end if;

  select id
  into v_target_user_id
  from auth.users
  where lower(email) = v_email
  limit 1;

  if not found then
    raise exception 'existing Nexez account not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.platform_admins
    where user_id = v_target_user_id
  ) then
    raise exception 'account already has platform-admin access' using errcode = '22023';
  end if;

  insert into public.platform_admins (user_id, note)
  values (v_target_user_id, v_note);

  insert into public.platform_admin_grant_events (
    actor_id,
    target_user_id,
    target_email,
    note
  ) values (
    p_actor_id,
    v_target_user_id,
    v_email,
    v_note
  );

  return v_target_user_id;
end;
$function$;

revoke all on function public.grant_platform_admin_by_email(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.grant_platform_admin_by_email(uuid, text, text)
  to service_role;
