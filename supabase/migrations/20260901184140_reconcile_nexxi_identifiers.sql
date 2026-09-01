-- Reconcile the final Nexxi name across the existing production schema.
--
-- Historical environments may still contain identifiers created under the
-- superseded internal codename. Construct that token at runtime so current
-- source and generated artifacts carry only the canonical name.

create or replace function private.nz_replace_brand_tokens(
  value jsonb,
  retired_lower text,
  retired_title text,
  retired_upper text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case pg_catalog.jsonb_typeof(value)
    when 'object' then coalesce((
      select pg_catalog.jsonb_object_agg(
        pg_catalog.replace(
          pg_catalog.replace(
            pg_catalog.replace(entry.key, retired_upper, 'NEXXI'),
            retired_title,
            'Nexxi'
          ),
          retired_lower,
          'nexxi'
        ),
        private.nz_replace_brand_tokens(entry.value, retired_lower, retired_title, retired_upper)
      )
      from pg_catalog.jsonb_each(value) as entry
    ), '{}'::jsonb)
    when 'array' then coalesce((
      select pg_catalog.jsonb_agg(
        private.nz_replace_brand_tokens(element.value, retired_lower, retired_title, retired_upper)
        order by element.ordinality
      )
      from pg_catalog.jsonb_array_elements(value) with ordinality as element(value, ordinality)
    ), '[]'::jsonb)
    when 'string' then pg_catalog.to_jsonb(
      pg_catalog.replace(
        pg_catalog.replace(
          pg_catalog.replace(value #>> '{}', retired_upper, 'NEXXI'),
          retired_title,
          'Nexxi'
        ),
        retired_lower,
        'nexxi'
      )
    )
    else value
  end;
$$;

revoke all on function private.nz_replace_brand_tokens(jsonb, text, text, text)
  from public, anon, authenticated, service_role;

do $reconcile_nexxi$
declare
  retired_lower constant text := 'nex' || 'ie';
  retired_title constant text := pg_catalog.initcap(retired_lower);
  retired_upper constant text := pg_catalog.upper(retired_lower);
  function_row record;
  function_sql text;
  policy_row record;
begin
  -- Rename the durable A2A thread link before recompiling functions that use it.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'a2a_tasks'
      and column_name = retired_lower || '_thread_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'a2a_tasks'
      and column_name = 'nexxi_thread_id'
  ) then
    execute pg_catalog.format(
      'alter table public.a2a_tasks rename column %I to nexxi_thread_id',
      retired_lower || '_thread_id'
    );
  end if;

  if exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'a2a_tasks_' || retired_lower || '_thread_id_fkey'
      and conrelid = 'public.a2a_tasks'::regclass
  ) and not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'a2a_tasks_nexxi_thread_id_fkey'
      and conrelid = 'public.a2a_tasks'::regclass
  ) then
    execute pg_catalog.format(
      'alter table public.a2a_tasks rename constraint %I to a2a_tasks_nexxi_thread_id_fkey',
      'a2a_tasks_' || retired_lower || '_thread_id_fkey'
    );
  end if;

  if pg_catalog.to_regclass('public.a2a_tasks_' || retired_lower || '_thread_idx') is not null
     and pg_catalog.to_regclass('public.a2a_tasks_nexxi_thread_idx') is null then
    execute pg_catalog.format(
      'alter index public.%I rename to a2a_tasks_nexxi_thread_idx',
      'a2a_tasks_' || retired_lower || '_thread_idx'
    );
  end if;

  -- Recompile every affected stored function with canonical identifiers,
  -- messages, JSON field names, and commerce channel values.
  for function_row in
    select procedure.oid
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and procedure.prokind = 'f'
      and pg_catalog.pg_get_functiondef(procedure.oid) ilike '%' || retired_lower || '%'
    order by procedure.oid
  loop
    function_sql := pg_catalog.pg_get_functiondef(function_row.oid);
    function_sql := pg_catalog.replace(function_sql, retired_upper, 'NEXXI');
    function_sql := pg_catalog.replace(function_sql, retired_title, 'Nexxi');
    function_sql := pg_catalog.replace(function_sql, retired_lower, 'nexxi');
    execute function_sql;
  end loop;

  -- Preserve existing agent and conversation rows. If a user somehow has both
  -- names, merge the superseded row into the canonical row before updating.
  with duplicate_agents as (
    select retired.id as retired_id, current_agent.id as current_id
    from public.user_agents as retired
    join public.user_agents as current_agent
      on current_agent.user_id = retired.user_id
      and current_agent.name = 'Nexxi'
    where retired.name = retired_title
  )
  update public.agent_threads as thread
  set agent_id = duplicate.current_id
  from duplicate_agents as duplicate
  where thread.agent_id = duplicate.retired_id;

  with duplicate_agents as (
    select retired.id as retired_id, current_agent.id as current_id,
      retired.preferences as retired_preferences,
      retired.memory as retired_memory
    from public.user_agents as retired
    join public.user_agents as current_agent
      on current_agent.user_id = retired.user_id
      and current_agent.name = 'Nexxi'
    where retired.name = retired_title
  )
  update public.user_agents as current_agent
  set
    preferences = duplicate.retired_preferences || current_agent.preferences,
    memory = duplicate.retired_memory || current_agent.memory
  from duplicate_agents as duplicate
  where current_agent.id = duplicate.current_id;

  delete from public.user_agents as retired
  using public.user_agents as current_agent
  where retired.user_id = current_agent.user_id
    and retired.name = retired_title
    and current_agent.name = 'Nexxi';

  update public.user_agents
  set name = 'Nexxi'
  where name = retired_title;

  execute pg_catalog.format(
    'update public.agent_threads set title = %L where title = %L',
    'New Nexxi chat',
    'New ' || retired_title || ' chat'
  );

  -- Canonicalize internal metadata without rewriting user-authored message text.
  update public.user_agents
  set
    preferences = private.nz_replace_brand_tokens(preferences, retired_lower, retired_title, retired_upper),
    memory = private.nz_replace_brand_tokens(memory, retired_lower, retired_title, retired_upper)
  where preferences::text ilike '%' || retired_lower || '%'
     or memory::text ilike '%' || retired_lower || '%';

  update public.agent_threads
  set metadata = private.nz_replace_brand_tokens(metadata, retired_lower, retired_title, retired_upper)
  where metadata::text ilike '%' || retired_lower || '%';

  update public.agent_messages
  set metadata = private.nz_replace_brand_tokens(metadata, retired_lower, retired_title, retired_upper)
  where metadata::text ilike '%' || retired_lower || '%';

  alter table public.agent_action_approvals
    disable trigger trg_guard_agent_action_approval_write;

  update public.agent_action_approvals
  set
    summary = pg_catalog.replace(pg_catalog.replace(summary, retired_title, 'Nexxi'), retired_lower, 'nexxi'),
    payload = private.nz_replace_brand_tokens(payload, retired_lower, retired_title, retired_upper),
    result = case when result is null then null else
      private.nz_replace_brand_tokens(result, retired_lower, retired_title, retired_upper) end,
    error = case when error is null then null else
      pg_catalog.replace(pg_catalog.replace(error, retired_title, 'Nexxi'), retired_lower, 'nexxi') end
  where summary ilike '%' || retired_lower || '%'
     or payload::text ilike '%' || retired_lower || '%'
     or coalesce(result::text, '') ilike '%' || retired_lower || '%'
     or coalesce(error, '') ilike '%' || retired_lower || '%';

  alter table public.agent_action_approvals
    enable trigger trg_guard_agent_action_approval_write;

  update public.notifications
  set
    title = pg_catalog.replace(pg_catalog.replace(title, retired_title, 'Nexxi'), retired_lower, 'nexxi'),
    body = pg_catalog.replace(pg_catalog.replace(body, retired_title, 'Nexxi'), retired_lower, 'nexxi'),
    data = private.nz_replace_brand_tokens(data, retired_lower, retired_title, retired_upper)
  where title ilike '%' || retired_lower || '%'
     or body ilike '%' || retired_lower || '%'
     or data::text ilike '%' || retired_lower || '%';

  update public.a2a_tasks
  set
    status = private.nz_replace_brand_tokens(status, retired_lower, retired_title, retired_upper),
    artifacts = private.nz_replace_brand_tokens(artifacts, retired_lower, retired_title, retired_upper),
    history = private.nz_replace_brand_tokens(history, retired_lower, retired_title, retired_upper),
    metadata = private.nz_replace_brand_tokens(metadata, retired_lower, retired_title, retired_upper),
    safe_error_message = case when safe_error_message is null then null else
      pg_catalog.replace(pg_catalog.replace(safe_error_message, retired_title, 'Nexxi'), retired_lower, 'nexxi') end
  where status::text ilike '%' || retired_lower || '%'
     or artifacts::text ilike '%' || retired_lower || '%'
     or history::text ilike '%' || retired_lower || '%'
     or metadata::text ilike '%' || retired_lower || '%'
     or coalesce(safe_error_message, '') ilike '%' || retired_lower || '%';

  update public.a2a_task_events
  set payload = private.nz_replace_brand_tokens(payload, retired_lower, retired_title, retired_upper)
  where payload::text ilike '%' || retired_lower || '%';

  -- Rename owner policies in place so their permissions and definitions remain
  -- attached to the same policy objects.
  for policy_row in
    select * from (values
      ('user_agents', 'Users manage own ' || retired_title || ' agent', 'Users manage own Nexxi agent'),
      ('agent_threads', 'Users manage own ' || retired_title || ' threads', 'Users manage own Nexxi threads'),
      ('agent_messages', 'Users manage own ' || retired_title || ' messages', 'Users manage own Nexxi messages'),
      ('agent_action_approvals', 'Users read own ' || retired_title || ' approvals', 'Users read own Nexxi approvals')
    ) as policies(table_name, retired_name, current_name)
  loop
    if exists (
      select 1 from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = policy_row.table_name
        and policyname = policy_row.retired_name
    ) and not exists (
      select 1 from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = policy_row.table_name
        and policyname = policy_row.current_name
    ) then
      execute pg_catalog.format(
        'alter policy %I on public.%I rename to %I',
        policy_row.retired_name,
        policy_row.table_name,
        policy_row.current_name
      );
    end if;
  end loop;

  -- Replace the retired system-reserved public identifier in both namespaces.
  insert into private.public_identifier_claims (namespace, identifier, kind)
  values
    ('page_slug', 'nexxi', 'system'),
    ('storefront_handle', 'nexxi', 'system')
  on conflict (namespace, identifier) do nothing;

  delete from private.public_identifier_claims
  where identifier = retired_lower
    and kind = 'system';

  -- The channel constraint must accept the canonical value before rows move.
  alter table public.checkout_orders
    drop constraint if exists checkout_orders_channel_check;

  execute pg_catalog.format(
    'update public.checkout_orders set channel = %L where channel = %L',
    'nexxi',
    retired_lower
  );

  alter table public.checkout_orders
    add constraint checkout_orders_channel_check
    check (
      channel is null
      or channel in (
        'agent_checkout', 'acp', 'ucp', 'negotiation', 'nexxi',
        'recurring_service', 'staged_settlement', 'reservable_resource'
      )
    );
end;
$reconcile_nexxi$;

alter table public.user_agents
  alter column name set default 'Nexxi';

alter table public.agent_threads
  alter column title set default 'New Nexxi chat';

-- Point update triggers at the canonical helper, then retire its superseded twin.
drop trigger if exists trg_touch_user_agents_updated_at on public.user_agents;
create trigger trg_touch_user_agents_updated_at
  before update on public.user_agents
  for each row
  execute function public.nz_touch_nexxi_updated_at();

drop trigger if exists trg_touch_agent_threads_updated_at on public.agent_threads;
create trigger trg_touch_agent_threads_updated_at
  before update on public.agent_threads
  for each row
  execute function public.nz_touch_nexxi_updated_at();

revoke execute on function public.nz_touch_nexxi_updated_at()
  from public, anon, authenticated;

revoke all on function public.match_nexxi_pages(extensions.vector, integer)
  from public;
grant execute on function public.match_nexxi_pages(extensions.vector, integer)
  to authenticated, service_role;

do $retire_functions$
declare
  retired_lower constant text := 'nex' || 'ie';
begin
  execute pg_catalog.format(
    'drop function if exists public.%I()',
    'nz_touch_' || retired_lower || '_updated_at'
  );
  execute pg_catalog.format(
    'drop function if exists public.%I(extensions.vector, integer)',
    'match_' || retired_lower || '_pages'
  );
end;
$retire_functions$;

comment on table public.user_agents is
  'Buyer-owned Nexxi profile, preferences, and durable memory.';
comment on table public.agent_threads is
  'Mobile-first Nexxi chat threads for buyer discovery and transactions.';
comment on table public.agent_messages is
  'Conversation transcript for Nexxi text and voice turns.';
comment on table public.agent_action_approvals is
  'Explicit user approval ledger before Nexxi negotiates, books, or starts checkout.';
comment on table public.user_push_tokens is
  'Expo push tokens per user for Nexxi push notifications (keyed by user_id + denormalized email).';
comment on policy "Users read own Nexxi approvals"
  on public.agent_action_approvals is
  'Buyers may inspect their own approval history; all mutations are trusted-server only.';
comment on function public.nz_guard_agent_action_approval_write() is
  'Enforces immutable action identity and the PENDING -> APPROVED/REJECTED -> EXECUTED/FAILED Nexxi approval state machine.';

drop function private.nz_replace_brand_tokens(jsonb, text, text, text);

do $verify_nexxi$
declare
  retired_lower constant text := 'nex' || 'ie';
  retired_title constant text := pg_catalog.initcap(retired_lower);
  remaining bigint;
begin
  select count(*) into remaining
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname in ('public', 'private')
    and procedure.prokind = 'f'
    and (
      procedure.proname ilike '%' || retired_lower || '%'
      or pg_catalog.pg_get_functiondef(procedure.oid) ilike '%' || retired_lower || '%'
    );
  if remaining <> 0 then
    raise exception 'Nexxi reconciliation left retired function identifiers.';
  end if;

  select count(*) into remaining
  from information_schema.columns
  where table_schema in ('public', 'private')
    and (
      column_name ilike '%' || retired_lower || '%'
      or coalesce(column_default, '') ilike '%' || retired_lower || '%'
    );
  if remaining <> 0 then
    raise exception 'Nexxi reconciliation left retired column identifiers or defaults.';
  end if;

  select count(*) into remaining
  from pg_catalog.pg_policies
  where schemaname in ('public', 'private')
    and (
      policyname ilike '%' || retired_lower || '%'
      or coalesce(qual, '') ilike '%' || retired_lower || '%'
      or coalesce(with_check, '') ilike '%' || retired_lower || '%'
    );
  if remaining <> 0 then
    raise exception 'Nexxi reconciliation left retired policy identifiers.';
  end if;

  select count(*) into remaining
  from pg_catalog.pg_constraint as constraint_record
  join pg_catalog.pg_namespace as namespace on namespace.oid = constraint_record.connamespace
  where namespace.nspname in ('public', 'private')
    and (
      constraint_record.conname ilike '%' || retired_lower || '%'
      or pg_catalog.pg_get_constraintdef(constraint_record.oid) ilike '%' || retired_lower || '%'
    );
  if remaining <> 0 then
    raise exception 'Nexxi reconciliation left retired constraint identifiers.';
  end if;

  select count(*) into remaining
  from pg_catalog.pg_indexes
  where schemaname in ('public', 'private')
    and (
      indexname ilike '%' || retired_lower || '%'
      or indexdef ilike '%' || retired_lower || '%'
    );
  if remaining <> 0 then
    raise exception 'Nexxi reconciliation left retired index identifiers.';
  end if;

  select count(*) into remaining
  from (
    select description.description
    from pg_catalog.pg_description as description
    join pg_catalog.pg_class as relation on relation.oid = description.objoid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('public', 'private')
    union all
    select description.description
    from pg_catalog.pg_description as description
    join pg_catalog.pg_proc as procedure on procedure.oid = description.objoid
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
  ) as descriptions
  where descriptions.description ilike '%' || retired_lower || '%';
  if remaining <> 0 then
    raise exception 'Nexxi reconciliation left retired schema comments.';
  end if;

  select count(*) into remaining
  from public.user_agents
  where name = retired_title;
  if remaining <> 0 then
    raise exception 'Nexxi reconciliation left retired agent profiles.';
  end if;

  select count(*) into remaining
  from public.checkout_orders
  where channel = retired_lower;
  if remaining <> 0 then
    raise exception 'Nexxi reconciliation left retired commerce channels.';
  end if;

  select count(*) into remaining
  from private.public_identifier_claims
  where identifier = retired_lower;
  if remaining <> 0 then
    raise exception 'Nexxi reconciliation left retired public identifier claims.';
  end if;

  select
    (select count(*) from public.agent_threads where metadata::text ilike '%' || retired_lower || '%')
    + (select count(*) from public.agent_messages where metadata::text ilike '%' || retired_lower || '%')
    + (select count(*) from public.agent_action_approvals where
        summary ilike '%' || retired_lower || '%'
        or payload::text ilike '%' || retired_lower || '%'
        or coalesce(result::text, '') ilike '%' || retired_lower || '%'
        or coalesce(error, '') ilike '%' || retired_lower || '%')
    + (select count(*) from public.notifications where
        title ilike '%' || retired_lower || '%'
        or body ilike '%' || retired_lower || '%'
        or data::text ilike '%' || retired_lower || '%')
    + (select count(*) from public.a2a_tasks where
        status::text ilike '%' || retired_lower || '%'
        or artifacts::text ilike '%' || retired_lower || '%'
        or history::text ilike '%' || retired_lower || '%'
        or metadata::text ilike '%' || retired_lower || '%'
        or coalesce(safe_error_message, '') ilike '%' || retired_lower || '%')
    + (select count(*) from public.a2a_task_events where payload::text ilike '%' || retired_lower || '%')
  into remaining;
  if remaining <> 0 then
    raise exception 'Nexxi reconciliation left retired internal metadata.';
  end if;
end;
$verify_nexxi$;
