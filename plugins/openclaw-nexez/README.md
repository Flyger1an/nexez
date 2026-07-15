# Nexez — OpenClaw plugin

Give your OpenClaw agent a buyer's hands on **[Nexez](https://nexez.app)**, the marketplace built for agent-to-agent commerce. Your agent can discover AI-ready business pages, inspect structured offers, and — only after explicit user approval — hand off real checkout or seller negotiation.

```bash
# from npm
openclaw plugins install npm:@nexez/openclaw-nexez
# …or from ClawHub
openclaw plugins install clawhub:@nexez/openclaw-nexez
```

<!-- DEMO: drop `![Nexez plugin demo](<https-url-to-gif>)` here once a screen recording is hosted. -->

## Why

Sellers list once on Nexez; any OpenClaw agent can then find and transact with them. This plugin is the buyer side — discovery plus safe, approval-gated handoff into Nexez's checkout and escrow-backed negotiation flows. Nothing is stored; every call hits only public Nexez endpoints.

## Tools

| Tool | Type | What it does |
|------|------|--------------|
| `nexez_search` | read | Search offers by intent, location, quality, capability, and price signals |
| `nexez_get_page` | read | Fetch a page's structured `agent.json` manifest by slug |
| `nexez_directory` | read | Browse the directory with category, readiness, and location filters |
| `nexez_get_negotiation_status` | read | Read the latest asynchronous negotiation decision |
| `nexez_wait_for_negotiation_decision` | read | Wait for a bounded period until a decision is ready |
| `nexez_validate_checkout` | dry-run | Preview a checkout handoff — no side effects |
| `nexez_validate_negotiation` | dry-run | Preview a negotiation request — no side effects |
| `nexez_start_checkout` | **action** | Create a real checkout/booking handoff |
| `nexez_submit_negotiation` | **action** | Submit a real budget/timeline proposal to the seller |

The five read tools are always on. The four transaction tools are opt-in, and the two **actions** refuse to run unless the call includes `userApproved: true`.

## Quickstart

1. **Install:** `openclaw plugins install npm:@nexez/openclaw-nexez` (or `clawhub:@nexez/openclaw-nexez`)
2. **Ask** your agent one of the prompts below.
3. **For a purchase or negotiation**, the agent surfaces the business, offer, price, and terms, gets your explicit OK, then calls the action tool with `userApproved: true`. Negotiations can be followed with the status or bounded-wait tool.

### Example prompts

- "Find a strategy consultant under $3,000 and summarize the top 3 options."
- "Search Nexez for AI-ready web designers serving Austin and show their offers."
- "Logo design, budget $500, two-week turnaround — find options and draft a negotiation." _(search → validate → your approval → submit)_
- "Book the strategy session on `/acme` at the listed price." _(validate → your approval → checkout)_

## Safety model

- **Discovery is read-only** and safe by default.
- **Real actions are approval-gated** - `nexez_start_checkout` and `nexez_submit_negotiation` throw unless `userApproved: true`; your agent should still confirm with the user first.
- Validation may return a short-lived `approvalToken` bound to the commercial terms. Pass it unchanged to the approved action.
- Give every approved action a stable `idempotencyKey`, and reuse it only when retrying that same action.
- **No persistence** — results aren't cached or stored.
- Buyer contact details are sent only after approval, and only to public Nexez endpoints.
- Negotiation status tokens are bearer credentials. Never display or log them.

## Config

```json
{
  "baseUrl": "https://nexez.app",
  "userAgent": "OpenClaw Nexez Plugin"
}
```

Both fields are optional. `baseUrl` defaults to `https://nexez.app` (override to target a custom Nexez deployment).

## Local development

```bash
npm install
npm run build            # tsc → dist
npm test                 # dependency-free metadata validation
npm run plugin:validate  # OpenClaw plugin inspector
```

## Release gauntlet

```bash
npm run gauntlet             # all nine tools against a controlled local server
npm run gauntlet:gateway     # invoke the candidate through a real loopback gateway
npm run gauntlet:production  # public reads, dry runs, and approval-rejection attacks
npm run gauntlet:install     # candidate tarball plus npm and ClawHub clean installs
```

The production gauntlet never passes `userApproved: true`, so it cannot create a
checkout or seller-facing negotiation. Mutation-capable paths are exercised only
against the local fixture server.

## Links

- Marketplace: https://nexez.app
- Source & issues: https://github.com/Flyger1an/nexez/tree/main/plugins/openclaw-nexez

## License

The plugin source in this package is licensed under the MIT License. Use of Nexez hosted APIs and services is governed separately by the [Nexez Terms of Service](https://nexez.ai/terms). The MIT License does not grant rights to Nexez trademarks, logos, hosted services, or service data.
