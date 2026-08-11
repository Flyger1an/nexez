# Agent-Readiness Study: harness, methodology, and rerun guide

This documents the batch study behind the /learn data article and exactly how to rerun it for the six-month trend piece (v2). It reflects the procedure as actually run for cohort `readiness-2026-08` in August 2026.

## What it measures

The study runs the exact same deterministic scanner as the public /scan (lib/server/site-scan.ts + lib/crawlability.ts, scanner version 2) against a neutral sample of real SMB websites and persists per-site results to `scan_results` with `source = 'study'`, a `study_cohort` label, and an assigned `vertical`. Aggregates are computed from that table; organic scans stay separable.

## Sampling method

- **Source**: OpenStreetMap, queried through the public Overpass API. OSM is a public commons directory rather than a marketing-selected list, and the exact queries are code (`buildOverpassQuery` in lib/server/agent-readiness-study.ts), so the frame is reproducible.
- **Geography**: 12 fixed, region-diverse mid-size US metros (`STUDY_METROS`), chosen in advance.
- **Verticals**: restaurants, health (clinics/dentists/doctors), home trades (craft=plumber/electrician/hvac/carpenter/painter/roofer), personal care (hairdresser/beauty/massage), retail (independent shop categories). Tag filters live in `STUDY_VERTICAL_FILTERS`.
- **Eligibility**: the OSM element must carry a `website` or `contact:website` tag pointing at the business's own site. Platform pages (Facebook, Instagram, link hubs, ordering platforms) are excluded. Chains are excluded via the presence of a `brand` or `brand:wikidata` tag. Domains are deduped.
- **Selection**: per metro x vertical cell, candidates are ordered by sha256(cohort:domain) and capped (14 in v1), so the sample is deterministic for a given cohort label and contains no manual picking.

## Politeness

Before any page fetch, the harness fetches robots.txt and skips the site entirely (recorded as `robots_excluded`) if our token or the `*` group disallows `/`. The harness identifies as `NexezStudyBot/1.0` for its own fetches; the scan itself uses the scanner's honest UA and the SSRF-guarded shared gatherer. Batches run at most 10 sites per invocation at concurrency 3, driven once per minute. Overpass seed calls run at 2 per minute; overpass-api.de load-sheds with 429/504 under load, which the driver absorbs with capped retries.

## Infrastructure

- `study_targets` (sample frame + per-site status) and `study_control` (runner token sha256 + kill switch): service-role only, RLS enabled with no policies, anon/authenticated hard-revoked.
- `claim_study_targets(batch_size, cohort_filter)`: atomic FOR UPDATE SKIP LOCKED claim; attempts >= 3 falls out of the claim set.
- `POST https://app.nexez.ai/api/internal/agent-readiness-study`: bearer auth against `study_control` (sha256, constant time), actions `seed`, `scan`, `status`. Responses are counts only.
- **Host matters**: `/api/internal/*` is unlisted in lib/site.ts, so the proxy canonicalizes it to the APP host. POSTing to `nexez.ai` gets a 308 to `app.nexez.ai`, and libcurl (which pg_net uses) drops the Authorization header on a cross-host redirect, producing a confusing 401. Always target `app.nexez.ai` directly.
- **Driver** (`study_seed_queue` + `study_drive(bearer, cohort)` + pg_cron, migrations `20260811005521` and `20260811010057`): a per-minute cron job that first works through the seed queue (2 Overpass seed calls per minute, requeueing non-200 seed responses after a 3 minute cooldown, capped at 4 attempts per cell), then switches to firing one scan batch per minute once every cell is seeded. The runner bearer token lives only in the scheduled command's arguments and in `study_control` as a sha256; rotate by updating the row.

## Rerunning for v2

1. Generate a fresh runner token and store its sha256:
   `openssl rand -hex 32`, then
   `insert into study_control (key, token_sha256, enabled) values ('runner', '<sha256>', true) on conflict (key) do update set token_sha256 = excluded.token_sha256, enabled = true, updated_at = now();`
2. Pick a new cohort label, e.g. `readiness-2027-02`. Reusing the metro set and caps keeps v2 comparable to v1; note any change in the article.
3. Populate the seed queue with all 60 cells (12 metros x 5 verticals):
   `insert into study_seed_queue (cohort, metro_key, vertical) select '<cohort>', m, v from unnest(array['columbus-oh','raleigh-nc','tucson-az','spokane-wa','grand-rapids-mi','chattanooga-tn','boise-id','worcester-ma','baton-rouge-la','reno-nv','des-moines-ia','richmond-va']) m cross join unnest(array['restaurants','health','home_trades','personal_care','retail']) v on conflict do nothing;`
4. Schedule the driver (it seeds first, then scans, automatically):
   `select cron.schedule('study-drive', '* * * * *', $$select public.study_drive('<token>', '<cohort>')$$);`
5. Watch progress with the `status` action or by querying `study_targets` grouped by status, and audit seed health by joining `study_seed_queue.request_id` to `net._http_response` (note pg_net prunes responses after a few hours, so audit during the run). When `pending` reaches zero: `select cron.unschedule('study-drive');` and disable the runner (`update study_control set enabled = false where key = 'runner';`).
6. Aggregates: run the queries in `scripts/agent-readiness-study-aggregates.sql`. They filter to `source = 'study' and study_cohort = '<cohort>'` and deduplicate with `distinct on (domain_hash)`. Never select the raw `domain` column into any aggregate or published output.
7. Sweep stragglers: rows still `pending` with `attempts >= 3` are exhausted; mark them `error` for bookkeeping and report them in the article's completion accounting.

## Known limitations (state these in any article using this data)

- The frame is businesses that (a) are mapped in OSM and (b) have their own website tagged. Businesses whose only web presence is a social or platform page are not measured, so "invisible to agents" percentages are, if anything, understatements for the broader SMB population.
- OSM coverage skews toward better-mapped urban areas; the fixed metro set mitigates cherry-picking but is not a probability sample of all US SMBs.
- One homepage scan per site; sites with agent artifacts only on deeper paths would be undercounted, matching how the public /scan behaves.
- Overpass availability varies; per-cell eligible counts range from single digits (sparse OSM craft tagging in some metros) to hundreds, so cells contribute unevenly up to the cap.
