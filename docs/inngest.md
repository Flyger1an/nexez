# Inngest: durable background jobs

Inngest is the durable job runner for Nexez background work. Functions live in
`lib/inngest/functions/`, are registered by the serve route at
`app/api/inngest/route.ts`, and run as signature-verified invocations of that
route on Vercel. Steps are memoized: a retried run never repeats work that
already succeeded (a delivered webhook is never re-delivered, a sent email is
never re-sent).

The integration is dormant until the env keys exist, like the other gated
integrations. Every emitter checks `hasInngestEnv()` and keeps its inline
fallback path, so nothing changes in production before the keys are set.

## Registered functions

| Function id | Trigger | What it does |
| --- | --- | --- |
| `outbound-webhooks-dispatch` | event `nexez/outbound-webhooks.dispatch` | Owner + per-page outbound webhook fan-out. Plan-gated at dispatch time (Pro+). One retried step per endpoint; delivery bookkeeping on `outbound_webhooks` rows preserved. Emitted by `lib/server/log-checkout-event.ts` for valuable checkout events. |
| `freshness-nudge` | event `nexez/freshness.nudge` | One stale-listing re-interview nudge: resolve recipient, send the seller-facet email (retried), then stamp the `page_freshness_nudges` cooldown ledger only after a successful send. Emitted per due page by the daily freshness cron. |
| `feed-regenerate` | event `nexez/feed.regenerate` + cron `0 */6 * * *` | Fetches the public agent feed surfaces (`/acp/feed.json`, `/ucp/feed.json`, `/agent-pages.json`, `/llms.txt`) off the request path, revalidating expired CDN entries and failing visibly when a surface breaks. IndexNow pings will attach here. |

The batch-scan harness (parallel workstream) and future jobs register by adding
their function to `lib/inngest/functions/index.ts`.

## Event vocabulary

Event names and payload types live in `lib/inngest/events.ts` so emitters and
functions never drift. Emit with:

```ts
import { hasInngestEnv, inngest } from '@/lib/inngest/client'
import { FEED_REGENERATE } from '@/lib/inngest/events'

if (hasInngestEnv()) {
  await inngest.send({ name: FEED_REGENERATE, data: { reason: 'publish' } })
}
```

## Setup (one time)

1. Create an Inngest account (inngest.com) and an app named `nexez`, or install
   the Inngest Vercel integration (which sets the env vars for you).
2. If configuring manually, set in Vercel (Production at minimum):
   - `INNGEST_EVENT_KEY`: from Inngest dashboard, Events, Event Keys
   - `INNGEST_SIGNING_KEY`: from Inngest dashboard, app settings
3. Register the app URL: `https://app.nexez.ai/api/inngest`. Unlisted `/api/*`
   routes are private-by-default in `lib/site.ts`, so the serve route is
   canonical on the APP host. Do not register the marketing or runtime host.
4. Redeploy so the env vars take effect, then confirm the app shows as synced in
   the Inngest dashboard. The `feed-regenerate` cron produces a visible run
   within 6 hours; trigger it immediately from the dashboard by sending a
   `nexez/feed.regenerate` event to verify end to end.

## Failure semantics

- A webhook endpoint rejected by the shared validator (SSRF, non-HTTPS, private
  host) is recorded as a permanent misconfiguration and never retried; it does
  not fail the run.
- Transient delivery and send failures retry with backoff (3 retries for
  webhooks and nudges, 2 for feed checks); exhausted retries mark the run
  failed in the Inngest dashboard, which is the alerting signal.
- The freshness cooldown ledger is stamped only after a successful send, so a
  page whose nudge ultimately failed is picked up again by the next daily cron
  run instead of being suppressed for a whole cooldown window.
