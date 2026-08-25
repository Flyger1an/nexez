# Agent Discoverability Roadmap

Nexez should be discoverable wherever autonomous agents search, reason, compare, and act. The goal is not one integration; it is a mesh of agent-readable surfaces that all point back to the same structured page and offer data.

## Priority Channels

1. OpenClaw skill
   - Status: published on ClawHub as `nexez-agent-discovery` (`0.1.2`).
   - Purpose: teach OpenClaw agents how to search Nexez, compare offers, and safely hand off checkout or negotiation.
   - Shape: lean `SKILL.md` plus references for endpoint contracts, ranking/safety, and validation examples.
   - Install: `openclaw skills install nexez-agent-discovery`.

2. OpenClaw tool plugin
   - Purpose: expose native callable tools such as `nexez_search`, `nexez_get_page`, `nexez_validate_checkout`, and `nexez_submit_negotiation`.
   - Status: published on ClawHub as `@nexez/openclaw-nexez` (`0.2.2`).
   - Install: `openclaw plugins install clawhub:@nexez/openclaw-nexez`.
   - Use when we want typed tool calls instead of instruction-only behavior.
   - Keep side-effecting tools optional and approval-gated.

3. MCP-native discovery
   - Current surface: current stateless platform MCP at `/mcp`, global `/.well-known/mcp.json`, per-page `/{slug}/mcp.json`, and legacy-compatible JSON-RPC endpoints.
   - Current contract: platform `server/discover`, tools, and resources support MCP `2026-07-28`; existing initialize clients remain supported without weakening the current header checks.
   - Safety: public tools search and inspect published data or perform dry-run validation. A validated checkout or negotiation returns an exact buyer-approval handoff, but Nexez does not submit it automatically.
   - Distribution: `server.json` is ready for domain-authenticated publication as `ai.nexez/commerce`. The live official Registry publication remains an owner release step and must be verified from the Registry API before it is claimed.

4. OpenAPI/action catalogs
   - Current surface: `/openapi.json`.
   - Next step: keep operation IDs, schemas, and safety language tuned for tool builders.
   - Candidate users: custom GPT actions, Claude connectors, agent builders, workflow tools, and buyer-side apps.

5. LLM-readable indexes
   - Current surface: `/llms.txt`, per-page `/{slug}/llms.txt`, `/agent-pages.json`.
   - Current distribution page: `/agents` on the marketing host, linked from `llms.txt`, `agent-pages.json`, `.well-known/nexez.json`, OpenAPI, and the MCP catalog.
   - Next step: add more transaction examples to global agent docs where useful.

6. Submission pack and live smoke checks
   - Current surface: `docs/agent-submission-pack.md`, `npm run smoke:agent-access`, and the scheduled `Agent Access Smoke` GitHub workflow.
   - Purpose: keep external submissions, partner demos, SDK registry checks, and live agent runtime health repeatable.

7. Search and crawl signals
   - Current surface: server-rendered public pages, JSON-LD, sitemap, robots, clean semantic HTML.
   - Next step: preserve page speed and high-contrast structured content on public agent pages.

8. Buyer-agent SDKs
   - Purpose: simple wrappers for agent developers.
   - Current surface: published TypeScript package `@nexez/agent-sdk` (`npm install @nexez/agent-sdk`) plus source in `sdk/typescript`.
   - Python parity: published PyPI package `nexez-agent-sdk` (`python -m pip install nexez-agent-sdk`) plus source in `sdk/python`.
   - Minimal functions shipped: search, get manifest, validate checkout, validate negotiation, submit negotiation.

9. Agent workflow examples
   - Current surface: `examples/agents` with Python and TypeScript examples for search, location-aware shortlisting, buyer approval UX, dry-run validation, negotiation submission, and status polling.
   - Purpose: give buyer-agent builders a copy-paste path from intent to safe handoff.

10. Workflow platform connectors
   - Candidate surfaces: Zapier, Make, Pipedream, n8n, Slack apps, Discord bots.
   - Purpose: let teams put Nexez discovery inside their existing agent or automation workflows.

11. Marketplace feeds
   - Current surface: `/api/directory` and `/api/agent-search`.
   - Next step: add optional feed variants for categories, locations, and high-readiness pages.

12. Agent-to-agent callbacks
    - Purpose: let buyer agents subscribe to quote status, negotiation status, booking outcomes, and escrow updates.
    - Requires: signed webhooks, replay protection, event schemas, and per-buyer consent.

## Safety Posture

- Public discovery should require no secret.
- Purchase, booking, negotiation, and contact actions require explicit user approval.
- Machine surfaces must not expose seller-private settings, API keys, secrets, or dashboard-only data.
- Agent integrations should prefer dry-run validation before side effects.
- Native plugins should use least privilege and clear optional tools for any action that spends money or contacts a seller.

## Near-Term Sequence

1. Keep the public `/agents` access page and machine-readable metadata in sync with published OpenClaw versions.
2. Keep the published `@nexez/agent-sdk` install path visible in `/agents`, `/llms.txt`, OpenAPI, MCP, and capabilities manifests.
3. Keep the published `nexez-agent-sdk` PyPI install path visible in `/agents`, `/llms.txt`, OpenAPI, MCP, and capabilities manifests.
4. Publish and verify `ai.nexez/commerce` in the official MCP Registry, then expand MCP/OpenAPI directory submissions.
5. Add more agent workflow examples for checkout, negotiation, status polling, and buyer-facing approval UI patterns.
