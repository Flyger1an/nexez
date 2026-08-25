-- Support Operations v2:
-- 1. Add assignment and first-response evidence to support requests.
-- 2. Store requester and operator messages in one immutable conversation ledger.
-- 3. Let requesters read and append only to their own conversations.
-- 4. Advance operator replies only after the email provider accepts the send.

alter table public.support_tickets
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists first_responded_at timestamptz,
  add column if not exists last_requester_message_at timestamptz,
  add column if not exists last_operator_message_at timestamptz;

create index if not exists support_tickets_assignee_status_idx
  on public.support_tickets (assigned_to, status, updated_at desc)
  where assigned_to is not null;

create index if not exists support_tickets_first_response_idx
  on public.support_tickets (created_at desc)
  where first_responded_at is null and status not in ('resolved', 'closed');

alter table public.support_ticket_events
  drop constraint if exists support_ticket_events_event_type_check;

alter table public.support_ticket_events
  add constraint support_ticket_events_event_type_check
  check (event_type in (
    'created',
    'email_sent',
    'email_failed',
    'status_changed',
    'note_added',
    'assignment_changed',
    'reply_sent',
    'reply_failed',
    'requester_replied'
  ));

create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_type text not null default 'requester'
    check (author_type in ('requester', 'operator')),
  author_id uuid default auth.uid() references auth.users(id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 10000),
  channel text not null default 'portal' check (channel in ('portal', 'email')),
  delivery_status text not null default 'not_applicable'
    check (delivery_status in ('not_applicable', 'pending', 'sent', 'failed')),
  provider_message_id text check (length(provider_message_id) <= 255),
  delivery_error text check (length(delivery_error) <= 500),
  client_message_id uuid,
  idempotency_key text check (length(idempotency_key) <= 255),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint support_ticket_messages_author_contract check (
    (
      author_type = 'requester'
      and channel = 'portal'
      and delivery_status = 'not_applicable'
      and provider_message_id is null
      and delivery_error is null
      and client_message_id is not null
      and idempotency_key is null
      and sent_at is null
    )
    or
    (
      author_type = 'operator'
      and channel = 'email'
      and delivery_status in ('pending', 'sent', 'failed')
      and client_message_id is null
      and idempotency_key is not null
      and (
        (delivery_status = 'pending' and provider_message_id is null and delivery_error is null and sent_at is null)
        or (delivery_status = 'sent' and provider_message_id is not null and delivery_error is null and sent_at is not null)
        or (delivery_status = 'failed' and provider_message_id is null and sent_at is null)
      )
    )
  )
);

create index support_ticket_messages_ticket_created_idx
  on public.support_ticket_messages (ticket_id, created_at asc);

create unique index support_ticket_messages_requester_dedupe_idx
  on public.support_ticket_messages (ticket_id, client_message_id)
  where client_message_id is not null;

create unique index support_ticket_messages_operator_dedupe_idx
  on public.support_ticket_messages (idempotency_key)
  where idempotency_key is not null;

alter table public.support_ticket_messages enable row level security;

revoke all on public.support_ticket_messages from anon, authenticated, service_role;

grant select (
  id,
  ticket_id,
  author_type,
  body,
  channel,
  delivery_status,
  client_message_id,
  sent_at,
  created_at
) on public.support_ticket_messages to authenticated;
grant insert (
  ticket_id,
  body,
  client_message_id
) on public.support_ticket_messages to authenticated;

grant select, insert on public.support_ticket_messages to service_role;

create policy "requesters read own support messages"
  on public.support_ticket_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.support_tickets ticket
      where ticket.id = support_ticket_messages.ticket_id
        and ticket.owner_id = (select auth.uid())
    )
    and (
      author_type = 'requester'
      or delivery_status = 'sent'
    )
  );

create policy "requesters append own support messages"
  on public.support_ticket_messages
  for insert
  to authenticated
  with check (
    author_type = 'requester'
    and author_id = (select auth.uid())
    and channel = 'portal'
    and delivery_status = 'not_applicable'
    and client_message_id is not null
    and idempotency_key is null
    and exists (
      select 1
      from public.support_tickets ticket
      where ticket.id = support_ticket_messages.ticket_id
        and ticket.owner_id = (select auth.uid())
        and ticket.status <> 'closed'
    )
  );

create or replace function private.nz_sync_support_requester_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_prior_status text;
  v_next_status text;
begin
  if new.author_type <> 'requester' then
    return new;
  end if;

  select status
  into v_prior_status
  from public.support_tickets
  where id = new.ticket_id
  for update;

  if not found then
    raise exception 'support request not found' using errcode = 'P0002';
  end if;

  if v_prior_status = 'closed' then
    raise exception 'closed support requests do not accept replies' using errcode = '22023';
  end if;

  v_next_status := case
    when v_prior_status in ('waiting_on_user', 'resolved') then 'open'
    else v_prior_status
  end;

  update public.support_tickets
  set
    status = v_next_status,
    resolved_at = case when v_next_status in ('resolved', 'closed') then resolved_at else null end,
    last_requester_message_at = new.created_at
  where id = new.ticket_id;

  insert into public.support_ticket_events (
    ticket_id,
    actor_id,
    event_type,
    from_status,
    to_status,
    metadata
  ) values (
    new.ticket_id,
    new.author_id,
    'requester_replied',
    v_prior_status,
    v_next_status,
    jsonb_build_object('message_id', new.id)
  );

  return new;
end;
$function$;

revoke all on function private.nz_sync_support_requester_message()
  from public, anon, authenticated, service_role;

create trigger support_ticket_messages_sync_requester
  after insert on public.support_ticket_messages
  for each row
  execute function private.nz_sync_support_requester_message();

create or replace function private.nz_reject_support_message_content_update()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if row(
    new.ticket_id,
    new.author_type,
    new.author_id,
    new.body,
    new.channel,
    new.client_message_id,
    new.idempotency_key,
    new.created_at
  ) is distinct from row(
    old.ticket_id,
    old.author_type,
    old.author_id,
    old.body,
    old.channel,
    old.client_message_id,
    old.idempotency_key,
    old.created_at
  ) then
    raise exception 'support message content is immutable' using errcode = '42501';
  end if;

  if old.author_type = 'requester' then
    raise exception 'requester support messages are immutable' using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function private.nz_reject_support_message_content_update()
  from public, anon, authenticated, service_role;

create trigger support_ticket_messages_reject_content_update
  before update on public.support_ticket_messages
  for each row
  execute function private.nz_reject_support_message_content_update();

create or replace function public.complete_support_reply(
  p_message_id uuid,
  p_actor_id uuid,
  p_succeeded boolean,
  p_provider_message_id text default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ticket_id uuid;
  v_prior_status text;
  v_delivery_status text;
  v_provider_message_id text := nullif(btrim(p_provider_message_id), '');
  v_error text := nullif(left(btrim(p_error), 500), '');
begin
  if not exists (
    select 1
    from public.platform_admins
    where user_id = p_actor_id
  ) then
    raise exception 'platform-admin access required' using errcode = '42501';
  end if;

  select message.ticket_id, message.delivery_status
  into v_ticket_id, v_delivery_status
  from public.support_ticket_messages message
  where message.id = p_message_id
    and message.author_type = 'operator'
    and message.author_id = p_actor_id
  for update;

  if not found then
    raise exception 'support reply not found' using errcode = 'P0002';
  end if;

  if v_delivery_status = 'sent' and p_succeeded then
    return;
  end if;

  if v_delivery_status not in ('pending', 'failed') then
    raise exception 'support reply cannot change delivery state' using errcode = '22023';
  end if;

  if p_succeeded and v_provider_message_id is null then
    raise exception 'provider message id required for accepted reply' using errcode = '22023';
  end if;

  if p_succeeded then
    update public.support_ticket_messages
    set
      delivery_status = 'sent',
      provider_message_id = v_provider_message_id,
      delivery_error = null,
      sent_at = now()
    where id = p_message_id;

    select status
    into v_prior_status
    from public.support_tickets
    where id = v_ticket_id
    for update;

    update public.support_tickets
    set
      status = 'waiting_on_user',
      resolved_at = null,
      first_responded_at = coalesce(first_responded_at, now()),
      last_operator_message_at = now()
    where id = v_ticket_id;

    insert into public.support_ticket_events (
      ticket_id,
      actor_id,
      event_type,
      from_status,
      to_status,
      metadata
    ) values (
      v_ticket_id,
      p_actor_id,
      'reply_sent',
      v_prior_status,
      'waiting_on_user',
      jsonb_build_object(
        'message_id', p_message_id,
        'provider_message_id', v_provider_message_id
      )
    );
  else
    update public.support_ticket_messages
    set
      delivery_status = 'failed',
      provider_message_id = null,
      delivery_error = coalesce(v_error, 'Email provider did not accept the reply.'),
      sent_at = null
    where id = p_message_id;

    insert into public.support_ticket_events (
      ticket_id,
      actor_id,
      event_type,
      metadata
    ) values (
      v_ticket_id,
      p_actor_id,
      'reply_failed',
      jsonb_build_object('message_id', p_message_id)
    );
  end if;
end;
$function$;

revoke all on function public.complete_support_reply(uuid, uuid, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_support_reply(uuid, uuid, boolean, text, text)
  to service_role;

create or replace function public.assign_support_ticket(
  p_ticket_id uuid,
  p_actor_id uuid,
  p_assigned_to uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_prior_assignee uuid;
begin
  if not exists (
    select 1
    from public.platform_admins
    where user_id = p_actor_id
  ) then
    raise exception 'platform-admin access required' using errcode = '42501';
  end if;

  if p_assigned_to is not null and not exists (
    select 1
    from public.platform_admins
    where user_id = p_assigned_to
  ) then
    raise exception 'assignee must be a platform admin' using errcode = '22023';
  end if;

  select assigned_to
  into v_prior_assignee
  from public.support_tickets
  where id = p_ticket_id
  for update;

  if not found then
    raise exception 'support request not found' using errcode = 'P0002';
  end if;

  if v_prior_assignee is not distinct from p_assigned_to then
    raise exception 'support assignment has no change' using errcode = '22023';
  end if;

  update public.support_tickets
  set assigned_to = p_assigned_to
  where id = p_ticket_id;

  insert into public.support_ticket_events (
    ticket_id,
    actor_id,
    event_type,
    metadata
  ) values (
    p_ticket_id,
    p_actor_id,
    'assignment_changed',
    jsonb_build_object(
      'prior_assignee_id', v_prior_assignee,
      'assignee_id', p_assigned_to
    )
  );
end;
$function$;

revoke all on function public.assign_support_ticket(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.assign_support_ticket(uuid, uuid, uuid)
  to service_role;

-- Waiting on the requester is delivery evidence, not a manual operator label.
-- Operators can add a note while a request is already waiting, but only an
-- accepted reply can move another status into waiting_on_user.
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

  if p_status = 'waiting_on_user' and v_prior_status <> 'waiting_on_user' then
    raise exception 'waiting status requires an accepted support reply' using errcode = '22023';
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
