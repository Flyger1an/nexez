-- Pass 3: exact, owner-scoped negotiation reporting.
--
-- The existing metrics page downloaded the newest 500 negotiations and 5,000
-- messages, then presented those samples as complete totals. This read-only,
-- additive function performs the aggregation in Postgres, keeps currencies
-- separate, and returns bounded dimensions for the web and mobile dashboards.

create or replace function public.nz_owner_negotiation_rollup(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_page_id uuid default null,
  p_query text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_query text := nullif(lower(btrim(p_query)), '');
  v_result jsonb;
begin
  if v_owner_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_to is not null and p_from is not null and p_to < p_from then
    raise exception 'negotiation range end must not precede its start'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_page_id is not null and not exists (
    select 1 from public.pages where id = p_page_id and owner_id = v_owner_id
  ) then
    raise exception 'negotiation listing not found' using errcode = 'no_data_found';
  end if;

  with
  negotiation_scope as materialized (
    select n.*
    from public.agent_negotiations n
    where n.owner_id = v_owner_id
      and (n.stripe_livemode is null or n.stripe_livemode = true)
      and (p_from is null or n.created_at >= p_from)
      and (p_to is null or n.created_at <= p_to)
      and (p_page_id is null or n.page_id = p_page_id)
      and (
        v_query is null
        or position(v_query in lower(concat_ws(' ', n.offer_name, n.offer_key, n.slug,
          n.buyer_agent, n.buyer_query, n.buyer_email, n.budget_text, n.timeline_text))) > 0
      )
  ),
  message_scope as materialized (
    select m.*
    from public.negotiation_messages m
    join negotiation_scope n on n.id = m.negotiation_id
  ),
  counts as (
    select
      count(*)::bigint as total,
      count(*) filter (where status = 'negotiation')::bigint as negotiation,
      count(*) filter (where status = 'paused')::bigint as paused,
      count(*) filter (where status in ('negotiation', 'paused'))::bigint as open,
      count(*) filter (where status = 'agreement_proposed')::bigint as proposed,
      count(*) filter (where status = 'held')::bigint as held,
      count(*) filter (where status = 'complete')::bigint as complete,
      count(*) filter (where status = 'declined')::bigint as declined,
      count(*) filter (where status = 'expired')::bigint as expired,
      count(*) filter (where status = 'refunded')::bigint as refunded,
      count(*) filter (where status = 'disputed')::bigint as disputed,
      count(*) filter (where decision_pending)::bigint as decision_pending,
      count(*) filter (
        where status = 'disputed'
          or status = 'held'
          or (status = 'agreement_proposed' and settlement_state = 'awaiting_approval')
          or status = 'paused'
          or (
            status = 'negotiation'
            and not decision_pending
            and coalesce(metadata -> 'last_decision' ->> 'action', '') not in ('counter', 'clarify')
          )
      )::bigint as needs_action,
      count(*) filter (
        where decision_pending
          or (
            status = 'agreement_proposed'
            and coalesce(settlement_state, 'auto') <> 'awaiting_approval'
          )
          or (
            status = 'negotiation'
            and coalesce(metadata -> 'last_decision' ->> 'action', '') in ('counter', 'clarify')
          )
      )::bigint as waiting,
      count(*) filter (
        where status in ('negotiation', 'agreement_proposed', 'paused', 'held')
          and updated_at < now() - interval '72 hours'
      )::bigint as stale_open,
      min(decision_requested_at) filter (where decision_pending) as oldest_pending_at
    from negotiation_scope
  ),
  currency_rows as (
    select
      lower(coalesce(nullif(currency, ''), 'usd')) as currency,
      count(*) filter (
        where amount_cents > 0
          and status in ('agreement_proposed', 'held', 'complete', 'refunded', 'disputed')
      )::bigint as agreed_count,
      coalesce(sum(amount_cents) filter (
        where amount_cents > 0
          and status in ('agreement_proposed', 'held', 'complete', 'refunded', 'disputed')
      ), 0)::bigint as agreed_cents,
      count(*) filter (where status = 'held' and amount_cents > 0)::bigint as held_count,
      coalesce(sum(amount_cents) filter (where status = 'held' and amount_cents > 0), 0)::bigint as held_cents,
      count(*) filter (
        where status in ('complete', 'refunded', 'disputed') and amount_cents > 0
      )::bigint as captured_count,
      coalesce(sum(amount_cents) filter (
        where status in ('complete', 'refunded', 'disputed') and amount_cents > 0
      ), 0)::bigint as captured_cents,
      coalesce(sum(
        case
          when status = 'disputed' then greatest(coalesce(amount_cents, 0), 0)
          when status = 'refunded' and coalesce(refunded_cents, 0) = 0
            then greatest(coalesce(amount_cents, 0), 0)
          else least(greatest(coalesce(amount_cents, 0), 0), greatest(coalesce(refunded_cents, 0), 0))
        end
      ), 0)::bigint as refunded_cents
    from negotiation_scope
    group by 1
  ),
  decision_rows as (
    select action, count(*)::bigint as decisions
    from (
      select lower(coalesce(content -> 'decision' ->> 'action', content ->> 'action')) as action
      from message_scope
      where role in ('seller_llm', 'seller_owner')
    ) decisions
    where action in ('accept', 'counter', 'reject', 'clarify', 'review', 'pause', 'resume')
    group by action
  ),
  ordered_messages as (
    select
      negotiation_id,
      role,
      created_at,
      lead(role) over (partition by negotiation_id order by created_at, id) as next_role,
      lead(created_at) over (partition by negotiation_id order by created_at, id) as next_created_at
    from message_scope
  ),
  latency_values as (
    select extract(epoch from (next_created_at - created_at)) * 1000 as latency_ms
    from ordered_messages
    where role = 'buyer'
      and next_role in ('seller_llm', 'seller_owner')
      and next_created_at >= created_at
  ),
  latency_row as (
    select
      count(*)::bigint as samples,
      coalesce(round(percentile_cont(0.5) within group (order by latency_ms))::bigint, 0) as p50_ms,
      coalesce(round(percentile_cont(0.95) within group (order by latency_ms))::bigint, 0) as p95_ms,
      coalesce(round(max(latency_ms))::bigint, 0) as max_ms
    from latency_values
  ),
  day_series as (
    select generate_series(
      date_trunc('day', now() at time zone 'utc') - interval '29 days',
      date_trunc('day', now() at time zone 'utc'),
      interval '1 day'
    ) as day
  ),
  daily_rows as (
    select
      d.day,
      count(n.id)::bigint as created,
      count(n.id) filter (where n.status in ('agreement_proposed', 'held', 'complete', 'refunded', 'disputed'))::bigint as agreed,
      count(n.id) filter (where n.status in ('complete', 'refunded', 'disputed'))::bigint as captured
    from day_series d
    left join negotiation_scope n
      on n.created_at >= d.day at time zone 'utc'
      and n.created_at < (d.day + interval '1 day') at time zone 'utc'
    group by d.day
    order by d.day
  ),
  offer_rows as (
    select
      page_id,
      max(slug) as slug,
      offer_key,
      max(offer_name) as offer_name,
      count(*)::bigint as proposals,
      count(*) filter (where status in ('agreement_proposed', 'held', 'complete', 'refunded', 'disputed'))::bigint as agreements,
      count(*) filter (where status in ('complete', 'refunded', 'disputed'))::bigint as captured
    from negotiation_scope
    group by page_id, offer_key
    order by proposals desc, agreements desc, offer_name
    limit 10
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'counts', jsonb_build_object(
      'total', c.total,
      'negotiation', c.negotiation,
      'agreement_proposed', c.proposed,
      'paused', c.paused,
      'open', c.open,
      'proposed', c.proposed,
      'held', c.held,
      'complete', c.complete,
      'declined', c.declined,
      'expired', c.expired,
      'refunded', c.refunded,
      'disputed', c.disputed,
      'decisionPending', c.decision_pending,
      'needsAction', c.needs_action,
      'waiting', c.waiting,
      'staleOpen', c.stale_open
    ),
    'backlog', jsonb_build_object(
      'pending', c.decision_pending,
      'oldestPendingAt', c.oldest_pending_at
    ),
    'latency', jsonb_build_object(
      'samples', l.samples,
      'p50Ms', l.p50_ms,
      'p95Ms', l.p95_ms,
      'maxMs', l.max_ms
    ),
    'currencies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'currency', currency,
        'agreedCount', agreed_count,
        'agreedCents', agreed_cents,
        'heldCount', held_count,
        'heldCents', held_cents,
        'capturedCount', captured_count,
        'capturedCents', captured_cents,
        'refundedCents', refunded_cents
      ) order by captured_cents desc, agreed_cents desc, currency)
      from currency_rows
    ), '[]'::jsonb),
    'decisions', coalesce((
      select jsonb_agg(jsonb_build_object('action', action, 'count', decisions) order by decisions desc, action)
      from decision_rows
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', to_char(day, 'YYYY-MM-DD'),
        'created', created,
        'agreed', agreed,
        'captured', captured
      ) order by day)
      from daily_rows
    ), '[]'::jsonb),
    'topOffers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'pageId', page_id,
        'slug', slug,
        'offerKey', offer_key,
        'offerName', offer_name,
        'proposals', proposals,
        'agreements', agreements,
        'captured', captured
      ) order by proposals desc, agreements desc, offer_name)
      from offer_rows
    ), '[]'::jsonb)
  ) into v_result
  from counts c
  cross join latency_row l;

  return v_result;
end;
$$;

revoke execute on function public.nz_owner_negotiation_rollup(timestamptz, timestamptz, uuid, text)
  from public, anon;
grant execute on function public.nz_owner_negotiation_rollup(timestamptz, timestamptz, uuid, text)
  to authenticated, service_role;

comment on function public.nz_owner_negotiation_rollup(timestamptz, timestamptz, uuid, text) is
  'Exact RLS-scoped negotiation lifecycle, latency, backlog, offer, and currency reporting for the authenticated owner.';
