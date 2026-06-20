# Nexez Agent Submission Pack

Use this pack when submitting Nexez to agent directories, MCP catalogs, OpenAPI/action registries, AI developer communities, and integration partners.

## Product Summary

Nexez gives businesses a clean, structured, AI-readable page for products and services. Human websites can stay beautiful and broad; the Nexez agent page is the lightweight commerce surface AI agents can search, parse, compare, validate, negotiate with, and hand off to checkout.

## Short Descriptions

- One-liner: AI-readable product and service pages agents can discover, validate, and negotiate from.
- Directory blurb: Nexez is an agent-commerce runtime for businesses. It publishes clean `agent.json`, `llms.txt`, MCP, OpenAPI, and checkout/negotiation handoff endpoints so buyer agents can safely find and act on real offers.
- Developer blurb: Nexez exposes public discovery APIs, page manifests, OpenAPI, MCP discovery, OpenClaw tooling, and TypeScript/Python SDKs for autonomous buyer-agent workflows.

## Canonical URLs

- Marketing site: https://nexez.ai
- Agent runtime: https://nexez.app
- Agent access hub: https://nexez.ai/agents
- Developer docs: https://nexez.ai/developers
- Public agent index: https://nexez.app/agent-pages.json
- Global `llms.txt`: https://nexez.app/llms.txt
- OpenAPI: https://nexez.app/openapi.json
- Capabilities manifest: https://nexez.app/.well-known/nexez.json
- MCP discovery catalog: https://nexez.app/.well-known/mcp.json
- Search API template: https://nexez.app/api/agent-search?q={query}
- Support: https://nexez.ai/support

## Install Commands

```bash
openclaw plugins install clawhub:@nexez/openclaw-nexez
openclaw skills install nexez-agent-discovery
npm install @nexez/agent-sdk
python -m pip install nexez-agent-sdk
```

## Packages

- OpenClaw plugin: `@nexez/openclaw-nexez`
- OpenClaw skill: `nexez-agent-discovery`
- TypeScript SDK: https://www.npmjs.com/package/@nexez/agent-sdk
- Python SDK: https://pypi.org/project/nexez-agent-sdk/
- Source repository: https://github.com/Flyger1an/nexez
- Agent examples: https://github.com/Flyger1an/nexez/tree/main/examples/agents
- Location-aware shortlist examples: `examples/agents/typescript/location-shortlist.ts` and `examples/agents/python/location_shortlist.py`

## Agent Workflow

1. Search Nexez by buyer intent with `/api/agent-search`.
2. Fetch the selected page's `/{slug}/agent.json`.
3. Compare offers, price, location, FAQs, policies, readiness, and contact channels.
4. Dry-run checkout or negotiation before any side effect.
5. Ask the buyer for explicit approval before spending money or sending contact details.
6. Submit checkout or negotiation only after approval.
7. Poll negotiation `statusUrl` when returned.

## Safety Positioning

- Public discovery requires no secret.
- Checkout and negotiation support dry-run validation.
- Seller-private pricing rules are never exposed in public agent manifests.
- Agents should ask for buyer approval before spending money, contacting sellers, or submitting proposal terms.
- Public agent pages are built for speed, semantic HTML, JSON-LD, `agent.json`, `llms.txt`, and MCP-compatible discovery.

## Test Prompts

```text
Use Nexez to find a remote strategy consultant and validate the best handoff without contacting anyone yet.
```

```text
Search Nexez for a negotiable B2B service, dry-run the proposal, and ask me before sending anything real.
```

```text
Find AI-ready services near Chicago, compare top matches, and explain which public page is easiest for an agent to act on.
```

```text
Find three nearby providers for a buyer in Austin, validate the top offer as a dry run, and stop before submitting anything real.
```

## Smoke Command

Run this before submissions or partner demos:

```bash
npm run smoke:agent-access
```

The same check also runs on the scheduled `Agent Access Smoke` GitHub workflow so registry, metadata, discovery, search, and dry-run negotiation regressions are visible between releases.

Optional overrides:

```bash
NEXEZ_MARKETING_BASE=https://nexez.ai \
NEXEZ_AGENT_BASE=https://nexez.app \
NEXEZ_AGENT_SMOKE_SLUG=nexez-agent-negotiation-lab \
npm run smoke:agent-access
```

## Submission Targets

- MCP directory/catalog maintainers.
- OpenAPI/action catalog communities.
- Agent tool registries and autonomous-agent marketplaces.
- AI developer forums and Discord/Slack communities.
- GitHub discovery via topics and examples.
- Package registry metadata: npm and PyPI descriptions, links, and examples.
- Workflow automation platforms: Pipedream, n8n, Make, Zapier.
- Buyer-agent and procurement-agent builders.

## Submission Checklist

- Confirm `npm run smoke:agent-access` passes.
- Confirm latest OpenClaw plugin and skill versions are listed on `/agents`.
- Confirm npm and PyPI package pages show the current version.
- Confirm `/llms.txt`, OpenAPI, MCP discovery, and capabilities manifests contain SDK install commands.
- Include one test prompt and one safe approval policy in every submission.
- Link to `https://nexez.ai/agents` as the human start page.
- Link to `https://nexez.app/llms.txt` as the machine start page.
