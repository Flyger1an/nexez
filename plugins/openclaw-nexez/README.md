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
| `nexez_search` | read | Search published Nexez pages + offers by buyer intent and location |
| `nexez_get_page` | read | Fetch a page's structured `agent.json` manifest by slug |
| `nexez_directory` | read | Browse the directory with category, readiness, and location filters |
| `nexez_validate_checkout` | dry-run | Preview a checkout handoff — no side effects |
| `nexez_validate_negotiation` | dry-run | Preview a negotiation request — no side effects |
| `nexez_start_checkout` | **action** | Create a real checkout/booking handoff |
| `nexez_submit_negotiation` | **action** | Submit a real budget/timeline proposal to the seller |

The three read tools are always on. The four optional tools are opt-in, and the two **actions** refuse to run unless the call includes `userApproved: true`.

## Quickstart

1. **Install:** `openclaw plugins install npm:@nexez/openclaw-nexez` (or `clawhub:@nexez/openclaw-nexez`)
2. **Ask** your agent one of the prompts below.
3. **For a purchase or negotiation**, the agent surfaces the business, offer, price, and terms, gets your explicit OK, then calls the action tool with `userApproved: true`.

### Example prompts

- "Find a strategy consultant under $3,000 and summarize the top 3 options."
- "Search Nexez for AI-ready web designers serving Austin and show their offers."
- "Logo design, budget $500, two-week turnaround — find options and draft a negotiation." _(search → validate → your approval → submit)_
- "Book the strategy session on `/acme` at the listed price." _(validate → your approval → checkout)_

## Safety model

- **Discovery is read-only** and safe by default.
- **Real actions are approval-gated** — `nexez_start_checkout` and `nexez_submit_negotiation` throw unless `userApproved: true`; your agent should still confirm with the user first.
- **No persistence** — results aren't cached or stored.
- Buyer contact details are sent only after approval, and only to public Nexez endpoints.

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

## Links

- Marketplace: https://nexez.app
- Source & issues: https://github.com/Flyger1an/nexez/tree/main/plugins/openclaw-nexez
