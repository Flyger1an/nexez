# Human Discovery rollout

Human-facing marketplace browsing is intentionally hidden while launch supply
is being built. Agent-facing discovery remains live throughout this period.

## Launch switch

`NEXT_PUBLIC_MARKETPLACE_DISCOVERY_ENABLED` is a non-secret, build-time switch.
The only enabling value is `true`. Missing, empty, and all other values keep the
feature hidden.

Changing the switch requires a reviewed deployment because Next.js embeds
public environment variables in the client bundle at build time.

When hidden, the application:

- removes Discovery and Leaderboard from marketing, desktop, and mobile navigation;
- removes marketplace browsing calls to action while keeping the homepage Agent
  Simulator available as a platform capability demo;
- redirects direct `/discovery` and `/leaderboard` visits to the marketing home page;
- removes both routes from the marketing sitemap and disallows them in robots.txt;
- keeps individual listings, merchant storefronts, seller analytics, admin curation,
  the agent directory, agent search, MCP, A2A, ACP, UCP, and other machine-readable
  distribution surfaces available.

## Readiness threshold

The minimum launch threshold is 50 unique certified merchant owners. Multiple
certified listings from one owner count as one merchant. A listing only counts
after it passes marketplace quality review and is explicitly certified.

The Launch Control marketplace check remains informational, but reports a
blocked state if the human Discovery switch is enabled before the merchant and
review thresholds are met.

Reaching 50 does not enable Discovery automatically. Before enabling it, review:

- category and geographic breadth;
- price, availability, and action-path quality;
- duplicate, placeholder, and internal fixture exclusions;
- the unreviewed marketplace queue, which must be empty;
- the hidden and enabled builds using the checks below.

## Release verification

With the switch absent or set to `false`:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run lint:em-dash
```

Confirm that navigation does not show Discovery, and that `/discovery` and
`/leaderboard` redirect to the marketing home page.

Then build a release candidate with the switch set to `true`. Confirm that both
routes, navigation entries, sitemap entries, and marketplace calls to action
return together before promoting that build.
