-- Close the Nexie approval-boundary bypass.
--
-- The approval ledger used to grant authenticated browser/mobile roles full CRUD
-- over their own rows. That made RLS tenant-safe but consent-unsafe: a client could
-- manufacture an APPROVED row and the crash-recovery worker would faithfully execute
-- it. Buyers may still inspect their own approvals, but every create/decision/result
-- write now comes from trusted server code and must obey the database state machine.

revoke all privileges on table public.agent_action_approvals from anon, authenticated;
grant select on table public.agent_action_approvals to authenticated;

drop policy if exists "Users manage own Nexie approvals" on public.agent_action_approvals;
drop policy if exists "Users read own Nexie approvals" on public.agent_action_approvals;

create policy "Users read own Nexie approvals"
  on public.agent_action_approvals
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

alter table public.agent_action_approvals
  add constraint agent_action_approvals_tool_name_check
  check (tool_name in ('initiate_negotiation', 'trigger_booking'))
  not valid;

alter table public.agent_action_approvals
  validate constraint agent_action_approvals_tool_name_check;

alter table public.agent_action_approvals
  add constraint agent_action_approvals_payload_object_check
  check (jsonb_typeof(payload) = 'object')
  not valid;

alter table public.agent_action_approvals
  validate constraint agent_action_approvals_payload_object_check;

create or replace function public.nz_guard_agent_action_approval_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  thread_owner uuid;
begin
  select t.user_id
    into thread_owner
    from public.agent_threads as t
   where t.id = new.thread_id;

  if thread_owner is null or thread_owner is distinct from new.user_id then
    raise exception using
      errcode = '23514',
      message = 'Nexie approval user must match the owning thread.';
  end if;

  if new.tool_name not in ('initiate_negotiation', 'trigger_booking')
     or jsonb_typeof(new.payload) is distinct from 'object' then
    raise exception using
      errcode = '23514',
      message = 'Nexie approval action is outside the supported contract.';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'PENDING'
       or new.decided_at is not null
       or new.completed_at is not null
       or new.result is not null
       or new.error is not null
       or new.recovery_attempted_at is not null
       or new.recovery_attempts <> 0 then
      raise exception using
        errcode = '23514',
        message = 'Nexie approval inserts must start as pristine PENDING rows.';
    end if;

    return new;
  end if;

  -- The proposed action is cryptographically/idempotently bound downstream. Its
  -- identity and payload must therefore never change after the buyer sees it.
  if new.id is distinct from old.id
     or new.thread_id is distinct from old.thread_id
     or new.user_id is distinct from old.user_id
     or new.tool_name is distinct from old.tool_name
     or new.summary is distinct from old.summary
     or new.payload is distinct from old.payload
     or new.created_at is distinct from old.created_at then
    raise exception using
      errcode = '23514',
      message = 'Nexie approval identity and proposed action are immutable.';
  end if;

  if old.status in ('REJECTED', 'EXECUTED', 'FAILED') then
    raise exception using
      errcode = '23514',
      message = 'Terminal Nexie approvals are immutable.';
  end if;

  if old.status = 'PENDING' then
    if new.status not in ('APPROVED', 'REJECTED')
       or new.decided_at is null
       or new.decided_at < old.created_at
       or new.result is not null
       or new.error is not null
       or new.recovery_attempted_at is not null
       or new.recovery_attempts <> 0
       or (new.status = 'APPROVED' and new.completed_at is not null)
       or (
         new.status = 'REJECTED'
         and new.completed_at is not null
         and new.completed_at < new.decided_at
       ) then
      raise exception using
        errcode = '23514',
        message = 'Pending Nexie approvals may only be approved or rejected.';
    end if;

    return new;
  end if;

  if old.status = 'APPROVED' then
    if new.decided_at is distinct from old.decided_at then
      raise exception using
        errcode = '23514',
        message = 'Nexie approval decision time is immutable.';
    end if;

    -- A recovery claim is the only legal APPROVED -> APPROVED update. It advances
    -- exactly one attempt and moves the lease forward without changing the outcome.
    if new.status = 'APPROVED' then
      if new.result is distinct from old.result
         or new.error is distinct from old.error
         or new.completed_at is distinct from old.completed_at
         or new.recovery_attempts <> old.recovery_attempts + 1
         or new.recovery_attempted_at is null
         or (
           old.recovery_attempted_at is not null
           and new.recovery_attempted_at <= old.recovery_attempted_at
         ) then
        raise exception using
          errcode = '23514',
          message = 'Approved Nexie actions may only advance the recovery lease.';
      end if;

      return new;
    end if;

    if new.status = 'EXECUTED' then
      if new.completed_at is null
         or new.completed_at < old.decided_at
         or new.result is null
         or jsonb_typeof(new.result) is distinct from 'object'
         or new.error is not null
         or new.recovery_attempts is distinct from old.recovery_attempts
         or new.recovery_attempted_at is distinct from old.recovery_attempted_at then
        raise exception using
          errcode = '23514',
          message = 'Executed Nexie approvals require one complete result.';
      end if;

      return new;
    end if;

    if new.status = 'FAILED' then
      if new.completed_at is null
         or new.completed_at < old.decided_at
         or nullif(pg_catalog.btrim(new.error), '') is null
         or new.result is not null
         or new.recovery_attempts is distinct from old.recovery_attempts
         or new.recovery_attempted_at is distinct from old.recovery_attempted_at then
        raise exception using
          errcode = '23514',
          message = 'Failed Nexie approvals require one complete error outcome.';
      end if;

      return new;
    end if;

    raise exception using
      errcode = '23514',
      message = 'Approved Nexie actions may only be executed, failed, or recovery-leased.';
  end if;

  raise exception using
    errcode = '23514',
    message = 'Nexie approval has an invalid current state.';
end;
$$;

revoke all on function public.nz_guard_agent_action_approval_write() from public, anon, authenticated;

drop trigger if exists trg_guard_agent_action_approval_write
  on public.agent_action_approvals;

create trigger trg_guard_agent_action_approval_write
  before insert or update on public.agent_action_approvals
  for each row
  execute function public.nz_guard_agent_action_approval_write();

comment on policy "Users read own Nexie approvals"
  on public.agent_action_approvals is
  'Buyers may inspect their own approval history; all mutations are trusted-server only.';

comment on function public.nz_guard_agent_action_approval_write() is
  'Enforces immutable action identity and the PENDING -> APPROVED/REJECTED -> EXECUTED/FAILED Nexie approval state machine.';
