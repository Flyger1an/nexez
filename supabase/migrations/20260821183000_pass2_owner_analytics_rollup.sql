-- Pass 2: exact, owner-scoped analytics rollups.
--
-- The dashboard previously downloaded only the newest 500/1,000 rows and then
-- presented that sample as a period total. This read-only function aggregates in
-- Postgres, where the full selected window is available, and returns bounded JSON
-- dimensions plus explicit telemetry-trust coverage. It is additive and safe to
-- deploy before the application starts calling it.

create or replace function public.nz_owner_analytics_rollup(
  p_from timestamptz,
  p_to timestamptz default null,
  p_page_id uuid default null,
  p_query text default null,
  p_event_type text default null,
  p_traffic text default 'all'
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
  v_event_type text := nullif(lower(btrim(p_event_type)), '');
  v_traffic text := coalesce(nullif(lower(btrim(p_traffic)), ''), 'all');
  v_result jsonb;
begin
  if v_owner_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null then
    raise exception 'analytics range start is required' using errcode = 'invalid_parameter_value';
  end if;
  if p_to is not null and p_to < p_from then
    raise exception 'analytics range end must not precede its start' using errcode = 'invalid_parameter_value';
  end if;
  if v_traffic not in ('all', 'ai', 'human') then
    raise exception 'invalid analytics traffic filter' using errcode = 'invalid_parameter_value';
  end if;
  if p_page_id is not null and not exists (
    select 1 from public.pages where id = p_page_id and owner_id = v_owner_id
  ) then
    raise exception 'analytics listing not found' using errcode = 'no_data_found';
  end if;

  with
  event_scope as (
    select e.*
    from public.checkout_events e
    where e.owner_id = v_owner_id
      and e.created_at >= p_from
      and (p_to is null or e.created_at <= p_to)
      and (p_page_id is null or e.page_id = p_page_id)
      and (v_event_type is null or v_event_type = 'all' or e.event_type = v_event_type)
      and (
        v_query is null
        or position(v_query in lower(concat_ws(' ', e.offer_name, e.slug, e.query, e.referrer,
          e.agent_user_agent, e.provider_url, e.checkout_url))) > 0
      )
  ),
  visit_scope as (
    select v.*
    from public.agent_visits v
    where v.owner_id = v_owner_id
      and v.created_at >= p_from
      and (p_to is null or v.created_at <= p_to)
      and (p_page_id is null or v.page_id = p_page_id)
      and (v_traffic = 'all' or (v_traffic = 'ai' and v.is_ai_agent) or (v_traffic = 'human' and not v.is_ai_agent))
      and (
        v_query is null
        or position(v_query in lower(concat_ws(' ', v.slug, v.path, v.query, v.referrer,
          v.user_agent, v.agent_type))) > 0
      )
  ),
  order_scope as (
    select o.*
    from public.checkout_orders o
    where o.owner_id = v_owner_id
      and o.stripe_livemode = true
      and o.created_at >= p_from
      and (p_to is null or o.created_at <= p_to)
      and (p_page_id is null or o.page_id = p_page_id)
      and (v_event_type is null or v_event_type in ('all', 'stripe_session_created'))
      and (
        v_query is null
        or position(v_query in lower(concat_ws(' ', o.offer_name, o.offer_key, o.slug,
          o.buyer_agent, o.buyer_name, o.buyer_email, o.buyer_reference))) > 0
      )
  ),
  negotiation_scope as (
    select n.*
    from public.agent_negotiations n
    where n.owner_id = v_owner_id
      and (n.stripe_livemode is null or n.stripe_livemode = true)
      and n.created_at >= p_from
      and (p_to is null or n.created_at <= p_to)
      and (p_page_id is null or n.page_id = p_page_id)
      and (
        v_query is null
        or position(v_query in lower(concat_ws(' ', n.offer_name, n.offer_key, n.slug,
          n.buyer_agent, n.buyer_query, n.buyer_email))) > 0
      )
  ),
  event_counts as (
    select
      count(*)::bigint as total,
      count(*) filter (where event_type = 'directory_click' and coalesce(metadata -> 'dry_run', 'false'::jsonb) <> 'true'::jsonb)::bigint as discovery_clicks,
      count(*) filter (where event_type = 'checkout_attempt' and coalesce(metadata -> 'dry_run', 'false'::jsonb) <> 'true'::jsonb)::bigint as checkout_attempts,
      count(*) filter (
        where event_type in ('provider_redirect','stripe_session_created')
          and coalesce(metadata -> 'dry_run', 'false'::jsonb) <> 'true'::jsonb
      )::bigint as checkout_handoffs,
      count(distinct coalesce(stripe_session_id, 'event:' || id::text)) filter (
        where event_type = 'stripe_session_created' and coalesce(metadata -> 'dry_run', 'false'::jsonb) <> 'true'::jsonb
      )::bigint as checkout_starts,
      count(*) filter (where trust_level = 'verified_server')::bigint as verified,
      count(*) filter (where trust_level = 'legacy_unverified')::bigint as legacy,
      count(*) filter (where trust_level = 'unverified_client')::bigint as unverified
    from event_scope
  ),
  visit_counts as (
    select
      count(*)::bigint as total,
      count(*) filter (where is_ai_agent)::bigint as ai,
      count(*) filter (where not is_ai_agent)::bigint as human,
      count(*) filter (where trust_level = 'verified_server')::bigint as verified,
      count(*) filter (where trust_level = 'legacy_unverified')::bigint as legacy,
      count(*) filter (where trust_level = 'unverified_client')::bigint as unverified
    from visit_scope
  ),
  order_counts as (
    select
      count(*)::bigint as total,
      count(*) filter (where coalesce(channel, 'legacy_direct') in ('legacy_direct', 'agent_checkout'))::bigint as direct_paid,
      count(*) filter (
        where coalesce(channel, 'legacy_direct') in ('legacy_direct', 'agent_checkout')
          and status in ('paid', 'dispute_won')
      )::bigint as direct_retained
    from order_scope
  ),
  negotiation_counts as (
    select
      count(*)::bigint as total,
      count(*) filter (where status in ('negotiation','agreement_proposed','paused','held'))::bigint as open,
      count(*) filter (where status = 'complete')::bigint as complete
    from negotiation_scope
  ),
  daily_rows as (
    select day,
      sum(event_signals)::bigint as event_signals,
      sum(visits)::bigint as visits,
      sum(ai_visits)::bigint as ai_visits,
      sum(discovery_clicks)::bigint as discovery_clicks,
      sum(checkout_starts)::bigint as checkout_starts,
      sum(paid_orders)::bigint as paid_orders
    from (
      select date_trunc('day', created_at) as day,
        count(*) as event_signals,
        0::bigint as visits,
        0::bigint as ai_visits,
        count(*) filter (where event_type = 'directory_click' and coalesce(metadata -> 'dry_run', 'false'::jsonb) <> 'true'::jsonb) as discovery_clicks,
        count(distinct coalesce(stripe_session_id, 'event:' || id::text)) filter (
          where event_type = 'stripe_session_created' and coalesce(metadata -> 'dry_run', 'false'::jsonb) <> 'true'::jsonb
        ) as checkout_starts,
        0::bigint as paid_orders
      from event_scope group by 1
      union all
      select date_trunc('day', created_at), 0, count(*), count(*) filter (where is_ai_agent), 0, 0, 0
      from visit_scope group by 1
      union all
      select date_trunc('day', created_at), 0, 0, 0, 0, 0, count(*)
      from order_scope group by 1
    ) rows_by_source
    group by day
  ),
  channel_rows as (
    select coalesce(channel, 'legacy_direct') as channel, count(*)::bigint as orders
    from order_scope
    group by 1
  ),
  currency_rows as (
    select
      lower(coalesce(nullif(currency, ''), 'usd')) as currency,
      count(*)::bigint as orders,
      sum(amount_cents)::bigint as gmv_cents,
      sum(
        case
          when status = 'disputed' then amount_cents
          when status = 'refunded' and coalesce(refunded_cents, 0) = 0 then amount_cents
          else least(amount_cents, greatest(coalesce(refunded_cents, 0), 0))
        end
      )::bigint as refunded_cents,
      sum(greatest(coalesce(application_fee_cents, 0), 0))::bigint as fee_cents
    from order_scope
    group by 1
  ),
  agent_type_rows as (
    select agent_type, count(*)::bigint as visits, round(avg(confidence_score), 2) as avg_confidence
    from visit_scope
    where is_ai_agent
    group by agent_type
    order by visits desc, avg_confidence desc, agent_type
    limit 10
  ),
  page_rows as (
    select v.page_id, max(v.slug) as slug, max(coalesce(p.name, v.slug)) as name, count(*)::bigint as visits
    from visit_scope v
    left join public.pages p on p.id = v.page_id
    where v.is_ai_agent
    group by v.page_id
    order by visits desc, name
    limit 10
  ),
  offer_event_rows as (
    select
      page_id,
      slug,
      offer_key,
      max(offer_name) as offer_name,
      count(*)::bigint as signals,
      count(*) filter (
        where event_type = 'checkout_attempt'
          and coalesce(metadata -> 'dry_run', 'false'::jsonb) <> 'true'::jsonb
      )::bigint as attempts
    from event_scope
    where offer_key <> 'page'
      and event_type in ('checkout_view','checkout_attempt','provider_redirect','stripe_session_created','stripe_missing_config','stripe_error')
    group by page_id, slug, offer_key
  ),
  offer_order_rows as (
    select page_id, max(slug) as slug, offer_key, max(coalesce(offer_name, offer_key, 'Order')) as offer_name,
      count(*)::bigint as paid_orders
    from order_scope
    where coalesce(channel, 'legacy_direct') in ('legacy_direct','agent_checkout')
      and coalesce(offer_key, '') <> 'page'
    group by page_id, offer_key
  ),
  offer_rows as (
    select
      coalesce(e.page_id, o.page_id) as page_id,
      coalesce(e.slug, o.slug, '') as slug,
      coalesce(e.offer_key, o.offer_key, '') as offer_key,
      coalesce(e.offer_name, o.offer_name, 'Offer') as offer_name,
      coalesce(e.signals, 0)::bigint as signals,
      coalesce(e.attempts, 0)::bigint as attempts,
      coalesce(o.paid_orders, 0)::bigint as paid_orders
    from offer_event_rows e
    full join offer_order_rows o on o.page_id = e.page_id and o.offer_key = e.offer_key
    order by coalesce(e.signals, 0) desc, coalesce(o.paid_orders, 0) desc, offer_name
    limit 10
  ),
  query_rows as (
    select query, sum(uses)::bigint as uses
    from (
      select lower(btrim(query)) as query, count(*)::bigint as uses
      from event_scope where nullif(btrim(query), '') is not null group by 1
      union all
      select lower(btrim(query)) as query, count(*)::bigint as uses
      from visit_scope where nullif(btrim(query), '') is not null group by 1
    ) query_sources
    group by query
    order by uses desc, query
    limit 10
  ),
  referrer_rows as (
    select referrer, count(*)::bigint as visits
    from visit_scope
    where nullif(btrim(referrer), '') is not null
    group by referrer
    order by visits desc, referrer
    limit 10
  ),
  active_page_rows as (
    select distinct page_id from event_scope
    union
    select distinct page_id from visit_scope where is_ai_agent
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'counts', jsonb_build_object(
      'events', ec.total,
      'visits', vc.total,
      'aiVisits', vc.ai,
      'humanVisits', vc.human,
      'discoveryClicks', ec.discovery_clicks,
      'checkoutAttempts', ec.checkout_attempts,
      'checkoutHandoffs', ec.checkout_handoffs,
      'checkoutStarts', ec.checkout_starts,
      'paidOrders', oc.total,
      'paidDirectOrders', oc.direct_paid,
      'retainedDirectOrders', oc.direct_retained,
      'negotiations', nc.total,
      'openNegotiations', nc.open,
      'completedNegotiations', nc.complete
    ),
    'trust', jsonb_build_object(
      'events', jsonb_build_object('total', ec.total, 'verified', ec.verified, 'legacy', ec.legacy, 'unverified', ec.unverified),
      'visits', jsonb_build_object('total', vc.total, 'verified', vc.verified, 'legacy', vc.legacy, 'unverified', vc.unverified)
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', day,
        'eventSignals', event_signals,
        'visits', visits,
        'aiVisits', ai_visits,
        'discoveryClicks', discovery_clicks,
        'checkoutStarts', checkout_starts,
        'paidOrders', paid_orders
      ) order by day)
      from daily_rows
    ), '[]'::jsonb),
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object('channel', channel, 'orders', orders) order by orders desc, channel)
      from channel_rows
    ), '[]'::jsonb),
    'currencies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'currency', currency,
        'orders', orders,
        'gmvCents', gmv_cents,
        'refundedCents', refunded_cents,
        'feeCents', fee_cents
      ) order by gmv_cents desc, currency)
      from currency_rows
    ), '[]'::jsonb),
    'agentTypes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'agentType', agent_type, 'visits', visits, 'avgConfidence', avg_confidence
      ) order by visits desc, avg_confidence desc, agent_type)
      from agent_type_rows
    ), '[]'::jsonb),
    'topPages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'pageId', page_id, 'slug', slug, 'name', name, 'visits', visits
      ) order by visits desc, name)
      from page_rows
    ), '[]'::jsonb),
    'topOffers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'pageId', page_id, 'slug', slug, 'offerKey', offer_key, 'offerName', offer_name,
        'signals', signals, 'attempts', attempts, 'paidOrders', paid_orders
      ) order by signals desc, paid_orders desc, offer_name)
      from offer_rows
    ), '[]'::jsonb),
    'topQueries', coalesce((
      select jsonb_agg(jsonb_build_object('query', query, 'uses', uses) order by uses desc, query)
      from query_rows
    ), '[]'::jsonb),
    'topReferrers', coalesce((
      select jsonb_agg(jsonb_build_object('referrer', referrer, 'visits', visits) order by visits desc, referrer)
      from referrer_rows
    ), '[]'::jsonb),
    'activePageIds', coalesce((
      select jsonb_agg(page_id order by page_id)
      from active_page_rows
    ), '[]'::jsonb)
  ) into v_result
  from event_counts ec
  cross join visit_counts vc
  cross join order_counts oc
  cross join negotiation_counts nc;

  return v_result;
end;
$$;

revoke execute on function public.nz_owner_analytics_rollup(timestamptz, timestamptz, uuid, text, text, text)
  from public, anon;
grant execute on function public.nz_owner_analytics_rollup(timestamptz, timestamptz, uuid, text, text, text)
  to authenticated, service_role;

comment on function public.nz_owner_analytics_rollup(timestamptz, timestamptz, uuid, text, text, text) is
  'Exact RLS-scoped analytics totals, daily trends, trust coverage, channels, and currency buckets for the authenticated owner.';
