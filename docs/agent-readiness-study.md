# Agent-Readiness Study: harness, methodology, and rerun guide

This documents the batch study behind the /learn data article and exactly how to rerun it for the six-month trend piece (v2).

## What it measures

The study runs the exact same deterministic scanner as the public /scan (lib/server/site-scan.ts + lib/crawlability.ts, scanner version 2) against a neutral sample of real SMB websites and persists per-site results to `scan_results` with `source = 'study'`, a `study_cohort` label, and an assigned `vertical`. Aggregates are computed from that table; organic scans stay separable.

## Sampling method

- **Source**: OpenStreetMap, queried through the public Overpass API. OSM is a public commons directory rather than a marketing-selected list, and the exact queries are code (`buildOverpassQuery` in lib/server/agent-readiness-study.ts), so the frame is reproducible.
- **Geography**: 12 fixed, region-diverse mid-size US metros (`STUDY_METROS`), chosen in advance.
- **Verticals**: restaurants, health (clinics/dentists/doctors), home trades (craft=plumber/electrician/hvac/carpenter/painter/roofer), personal care (hairdresser/beauty/massage), retail (independent shop categories). Tag filters live in `STUDY_VERTICAL_FILTERS`.
- **Eligibility**: the OSM element must carry a `website` or `contact:website` tag pointing at the business's own site. Platform pages (Facebook, Instagram, link hubs, ordering platforms) are excluded. Chains are excluded via the presence of a `brand` or `brand:wikidata` tag. Domains are deduped.
- **Selection**: per metro x vertical cell, candidates are ordered by sha256(cohort:domain) and capped, so the sample is deterministic for a given cohort label and contains no manual picking.

## Politeness

Before any page fetch, the harness fetches robots.txt and skips the site entirely (recorded as `robots_excluded`) if our token or the `*` group disallows `/`. The harness identifies as `NexezStudyBot/1.0` for its own fetches; the scan itself uses the scanner's honest UA and the SSRF-guarded shared gatherer. Batches run at most 10 sites per invocation at concurrency 3, driven about once per minute.

## Infrastructure

- `study_targets` (sample frame + per-site status) and `study_control` (runner token sha256 + kill switch): service-role only, RLS enabled with no policies, anon/authenticated hard-revoked.
- `claim_study_targets(batch_size, cohort_filter)`: atomic FOR UPDATE SKIP LOCKED claim; attempts >= 3 falls out of the claim set.
- `POST /api/internal/agent-readiness-study`: bearer auth against `study_control` (sha256, constant time), actions `seed`, `scan`, `status`. Responses are counts only.
- Driver: pg_net POSTs from Postgres with the token in the Authorization header, scheduled with pg_cron while a batch is in flight.

## Rerunning for v2

1. Generate a fresh runner token and store its sha256:
   `openssl rand -hex 32`, then
   `insert into study_control (key, token_sha256, enabled) values ('runner', '<sha256>', true) on conflict (key) do update set token_sha256 = excluded.token_sha256, enabled = true, updated_at = now();`
2. Pick a new cohort label, e.g. `readiness-2027-02`. Reusing the metro set and caps keeps v2 comparable to v1; note any change in the article.
3. Seed all 60 cells (12 metros x 5 verticals) by POSTing `{"action":"seed","cohort":"<cohort>","metroKey":"<metro>","vertical":"<vertical>","cap":14}` with `Authorization: Bearer <token>`. Space seed calls a few seconds apart to be polite to Overpass.
4. Schedule the scan driver (one batch a minute) with pg_cron:
   `select cron.schedule('study-scan', '* * * * *', $$select net.http_post(url := 'https://nexez.ai/api/internal/agent-readiness-study', body := '{"action":"scan","cohort":"<cohort>","batchSize":6}'::jsonb, headers := '{"Content-Type":"application/json","Authorization":"Bearer <token>"}'::jsonb, timeout_milliseconds := 58000)$$);`
5. Watch progress with the `status` action or by querying `study_targets` grouped by status. When `pending` reaches zero: `select cron.unschedule('study-scan');` and disable the runner (`update study_control set enabled = false where key = 'runner';`).
6. Aggregates: query `scan_results` filtered to `source = 'study' and study_cohort = '<cohort>'`, deduplicating with `distinct on (domain_hash)` (a site that redirects to an already-scanned domain would otherwise count twice). Never select the raw `domain` column into any aggregate or published output.
7. Sweep stragglers: rows still `pending` with `attempts >= 3` are exhausted; mark them `error` for bookkeeping and report them in the article's completion accounting.

## Known limitations (state these in any article using this data)

- The frame is businesses that (a) are mapped in OSM and (b) have their own website tagged. Businesses whose only web presence is a social or platform page are not measured, so "invisible to agents" percentages are, if anything, understatements for the broader SMB population.
- OSM coverage skews toward better-mapped urban areas; the fixed metro set mitigates cherry-picking but is not a probability sample of all US SMBs.
- One homepage scan per site; sites with agent artifacts only on deeper paths would be undercounted, matching how the public /scan behaves.
