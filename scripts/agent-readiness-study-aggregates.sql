-- Agent-readiness study aggregates, cohort readiness-2026-08.
-- Every stat in the article must be reproducible by running these against
-- scan_results. Rules: filter to source = 'study' and the cohort; dedupe on
-- domain_hash (a site redirecting to an already-scanned domain would count
-- twice); NEVER select the raw domain column.

-- 0. Cohort accounting (for the methodology section)
with cohort as (
  select distinct on (domain_hash) *
  from public.scan_results
  where source = 'study' and study_cohort = 'readiness-2026-08'
  order by domain_hash, created_at
)
select count(*) as sites from cohort;

-- 1. Headline composite: "invisible to agents".
-- Defined as: unreachable (no 2xx/3xx) OR no valid JSON-LD AND no agent
-- artifact of any kind (agent.json, well-known agent.json, A2A card, MCP card,
-- OpenAPI, llms.txt). I.e. an agent gets neither typed facts nor a callable
-- surface; all it can do is scrape prose.
-- Sensitivity: removing llms_txt_ok from the artifact list gives the strict
-- variant reported alongside the headline (30.7% -> 38.8% in v1).
with cohort as (
  select distinct on (domain_hash) *
  from public.scan_results
  where source = 'study' and study_cohort = 'readiness-2026-08'
  order by domain_hash, created_at
)
select
  count(*) as sites,
  round(100.0 * avg((not (http_status >= 200 and http_status < 400))::int), 1) as pct_unreachable,
  round(100.0 * avg((not valid_json_ld)::int), 1) as pct_no_valid_jsonld,
  round(100.0 * avg((not has_json_ld)::int), 1) as pct_no_jsonld_at_all,
  round(100.0 * avg((blocked_bot_count > 0)::int), 1) as pct_blocking_any_ai_crawler,
  round(100.0 * avg((not (agent_json_ok or well_known_agent_json_ok or well_known_agent_card_ok or mcp_json_ok or open_api_json_ok))::int), 1) as pct_zero_callable_artifacts,
  round(100.0 * avg((not llms_txt_ok)::int), 1) as pct_no_llms_txt,
  round(100.0 * avg((
    not (http_status >= 200 and http_status < 400)
    or (not valid_json_ld
        and not (agent_json_ok or well_known_agent_json_ok or well_known_agent_card_ok or mcp_json_ok or open_api_json_ok or llms_txt_ok))
  )::int), 1) as pct_invisible_composite,
  round(100.0 * avg((
    not (http_status >= 200 and http_status < 400)
    or (not valid_json_ld
        and not (agent_json_ok or well_known_agent_json_ok or well_known_agent_card_ok or mcp_json_ok or open_api_json_ok))
  )::int), 1) as pct_invisible_strict_no_llms,
  round(100.0 * avg((llms_txt_ok and not valid_json_ld)::int), 1) as pct_visible_only_via_llms,
  round(100.0 * avg((valid_json_ld and llms_txt_ok)::int), 1) as pct_both_jsonld_and_llms,
  round(avg(score), 1) as mean_score,
  percentile_cont(0.5) within group (order by score) as median_score
from cohort;

-- 2. Per-vertical breakdown (the article's table)
with cohort as (
  select distinct on (domain_hash) *
  from public.scan_results
  where source = 'study' and study_cohort = 'readiness-2026-08'
  order by domain_hash, created_at
)
select
  vertical,
  count(*) as sites,
  round(avg(score), 0) as mean_score,
  round(100.0 * avg((not valid_json_ld)::int), 0) as pct_no_valid_jsonld,
  round(100.0 * avg(has_offer_schema::int), 0) as pct_offer_schema,
  round(100.0 * avg(has_structured_price::int), 0) as pct_structured_price,
  round(100.0 * avg((blocked_bot_count > 0)::int), 0) as pct_blocking_any_bot,
  round(100.0 * avg((
    not (http_status >= 200 and http_status < 400)
    or (not valid_json_ld
        and not (agent_json_ok or well_known_agent_json_ok or well_known_agent_card_ok or mcp_json_ok or open_api_json_ok or llms_txt_ok))
  )::int), 0) as pct_invisible
from cohort
group by vertical
order by vertical;

-- 3. Individual signal prevalence (for in-prose stats)
with cohort as (
  select distinct on (domain_hash) *
  from public.scan_results
  where source = 'study' and study_cohort = 'readiness-2026-08'
  order by domain_hash, created_at
)
select
  round(100.0 * avg(https::int), 1) as pct_https,
  round(100.0 * avg(has_title::int), 1) as pct_title,
  round(100.0 * avg(has_json_ld::int), 1) as pct_any_jsonld,
  round(100.0 * avg(valid_json_ld::int), 1) as pct_valid_jsonld,
  round(100.0 * avg(has_business_identity::int), 1) as pct_business_identity,
  round(100.0 * avg(has_offer_schema::int), 1) as pct_offer_schema,
  round(100.0 * avg(has_structured_price::int), 1) as pct_structured_price,
  round(100.0 * avg(has_visible_price::int), 1) as pct_visible_price,
  round(100.0 * avg(has_action_path::int), 1) as pct_action_path,
  round(100.0 * avg(has_structured_action::int), 1) as pct_structured_action,
  round(100.0 * avg(agent_json_ok::int), 1) as pct_agent_json,
  round(100.0 * avg(mcp_json_ok::int), 1) as pct_mcp,
  round(100.0 * avg(open_api_json_ok::int), 1) as pct_openapi,
  round(100.0 * avg(llms_txt_ok::int), 1) as pct_llms_txt,
  round(100.0 * avg(has_freshness_signal::int), 1) as pct_freshness
from cohort;

-- 4. Per-bot robots blocking (which AI crawlers get blocked most)
with cohort as (
  select distinct on (domain_hash) *
  from public.scan_results
  where source = 'study' and study_cohort = 'readiness-2026-08'
  order by domain_hash, created_at
)
select bot, round(100.0 * avg((not (robots ->> bot)::boolean)::int), 1) as pct_blocked
from cohort,
  unnest(array['GPTBot','OAI-SearchBot','ChatGPT-User','ClaudeBot','Claude-SearchBot','Claude-User','PerplexityBot','Google-Extended']) as bot
group by bot
order by pct_blocked desc;

-- 5. Completion accounting (methodology: attempted vs completed vs excluded)
select status, count(*)
from public.study_targets
where cohort = 'readiness-2026-08'
group by status;
