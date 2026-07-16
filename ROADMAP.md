# Nexez Roadmap

_Last reconciled: 2026-07-15_

**Mission:** Make any business legible and transactable to autonomous agents without forcing it to replace its human website. Nexez provides structured storefronts, agent artifacts, transaction rails, seller operations, and distribution into agent workflows.

This document tracks product direction and launch status. Use [HANDOFF.md](HANDOFF.md) for operational details, environment state, and verification commands. Git history remains the implementation record.

## Current standing

The core platform is built and in launch-certification mode. Public storefronts remain fast and semantic on `nexez.app`; seller management lives on `app.nexez.ai`; marketing and public education live on `nexez.ai`. The next milestone is not broad feature expansion. It is proving every commercial lifecycle, improving marketplace density, and turning operational signals into a repeatable release discipline.

## Quality bars

- **Agent consumption:** every published storefront exposes clean HTML, schema.org JSON-LD, `llms.txt`, `agent.json`, OpenAPI, MCP, and plain-text context without leaking seller-only rules.
- **Commerce safety:** approval is explicit, actions are payload-bound and idempotent, sellers remain merchant of record, fees are deterministic, and webhook replays cannot duplicate money state.
- **Seller usability:** a non-technical seller can import, refine, publish, transact, and measure results without touching code.
- **Marketplace trust:** discovery ranks real availability, location, readiness, credentials, verified purchases, and review quality without enabling review manipulation.
- **Operational proof:** configuration, queues, incidents, and lifecycle evidence are visible to operators; no feature is called certified solely because its environment variables exist.
- **Performance split:** management surfaces may be rich and interactive; agent-facing surfaces stay minimal, high-contrast, crawlable, and fast.
- **Production discipline:** critical paths carry route and unit coverage, additive RLS-safe migrations, build verification, and post-deploy artifact checks.

## Shipped foundation

### Storefront creation

- URL importer with safe multi-path crawling, schema extraction, AI and deterministic parsing, provenance, clarification loops, offer caps, smart merge, and freshness signals.
- Conversational seller intake with a reducer-validated tool loop, invention firewall, resumable sessions, deterministic fallback, draft handoff, and web/mobile clients.
- Visual builder and editor with services, products, tiers, pricing, booking, location, availability, negotiation rules, branding, previews, versions, restore, and custom domains.
- Hosted storefronts plus an external-site Agent-Ready Kit, scanner, embed/widget, verified-domain artifacts, WordPress plugin, and Shopify app.

### Agent legibility and distribution

- Per-storefront JSON-LD, `llms.txt`, `agent.json`, `openapi.json`, MCP JSON-RPC, badge artifacts, and global agent index.
- OpenClaw plugin and skill, published TypeScript and Python SDKs, examples, registry metadata, and agent-access smoke coverage.
- ACP and UCP feeds and checkout-session adapters with persisted idempotent sessions and durable order attribution.
- Public scanner, simulator, developer pages, comparison content, and agent-readiness guidance.

### Discovery and marketplace

- Searchable directory and marketplace with professional/consumer facets, category, offer type, readiness, trust, worldwide location filtering, geolocation, favorites, related listings, and click attribution.
- Nexxi buyer-agent search with transactable-first ranking, Nexez and web sources, semantic plus lexical retrieval, structured memory, streaming, voice, and approval-aware actions.
- Reviews restricted to verified purchasers, seller responses, moderation state, aggregate ratings, and ranking inputs.

### Commerce and seller operations

- Fixed checkout through seller Stripe Connect accounts with plan-based application fees; no fallback charge into the platform account.
- Persistent negotiation threads, deterministic rules, LLM-assisted decisions clamped by owner rules, status polling, owner override, and asynchronous worker recovery.
- Escrow/manual capture lifecycle, hourly reconciliation, direct order ledger, buyer order portal, receipts, recourse requests, disputes, partial/full refunds, and fee reversal.
- Subscription billing, embedded payment, plan changes, portal access, billing history, usage, Connect status, Finance dashboard, and multi-currency seller reporting.
- Short-lived payload-bound approval tokens plus idempotency keys across checkout, negotiation, web clients, SDKs, and agent clients. Mandatory production enforcement is live.

### Integrations and automation

- Calendly, Stripe, Shopify, Square, Acuity, and Google Calendar import and re-sync flows.
- Shopify OAuth app with GraphQL catalog import, product webhook queue, recoverable claims, bounded retries, exact-shop tenancy, seller-visible health, and app-review submission.
- Stripe price webhook sync, Calendly availability and stored-credential sync, one-time scheduling links, cancel-on-refund, outbound seller webhooks, and scheduled reconciliation/freshness workers.
- Encrypted third-party credentials, feature gating, graceful dormant states, and integration status surfaces.

### Analytics, trust, and administration

- Agent-vs-human detection, agent type, traffic, queries, funnel, conversion, revenue, page and offer breakdowns, exports, and per-page filtering.
- Simulator history, AI Copilot, competitor analysis, readiness/trust score, credentials, voice optimization, agent memory, leaderboard, and verification signals.
- Team invites, accepted-only collaborator access, owner-entitlement inheritance on shared pages, approval workflows, notifications, support desk, account export/delete, and API keys.
- Three-host auth/routing architecture, shared session on the `.nexez.ai` app family, cookie-isolated agent runtime, rate limiting, observability, security headers, RLS hardening, and public projection parity tests.
- Seller mobile app foundation with intake, listing management, analytics, negotiations, finance/orders, integrations, notifications, and account workflows.

### Launch operations

- Admin-only **Launch Control** at `/dashboard/launch-control`: redacted configuration checks, live Stripe Price-mode verification, commerce evidence, queue health, incidents, and worker status using existing ledgers.
- `npm run certify:commerce`: live API/artifact checks, checkout and negotiation dry runs, mandatory token issuance, tokenless-live denial, and read-only Stripe Price verification.
- Owner-run certification runbook in `docs/commerce-certification.md`, separating safe automation from deliberate subscription, payment, escrow, refund, price-sync, and protocol lifecycle checks.
- Stripe-mode provenance on orders, escrow, and ACP/UCP sessions. Finance, Analytics, and Launch Control count only Stripe-proven live transactions; test and unverified history fail closed.
- Replacement-price synchronization follows explicit Stripe Product `default_price` changes, rotates the linked Price ID, and remains idempotent on redelivery.
- ACP and UCP sandbox settlement is certified independently for both channels, including create and completion replay. Default-Price replacement, linked-offer audit, duplicate delivery, and parallel-Price isolation are also certified in Stripe test mode. This evidence is excluded from all live revenue reporting.

## Active roadmap

Ranked by launch leverage.

### P0 - Launch gate

1. **Finish the live owner-run commerce gates.** Sandbox ACP plus UCP settlement and Stripe default-Price replacement/replay are certified. Still record one authenticated paid-plan subscribe/portal/cancel lifecycle, a partial then full refund of a proven low-value live direct order, and one fresh low-value negotiation agreement through funding and terminal reconciliation.
2. **Curate marketplace supply.** Publish 20-30 high-quality launch storefronts across representative industries and regions. Remove or exclude deliberate QA listings from public discovery.
3. **Establish the release ritual.** Require Launch Control with no required blockers, the automated commerce gauntlet, full test/build gates, and post-deploy public storefront plus artifact verification for every production candidate.

### P1 - Launch strength

1. **Prove demand and trust.** Publish a real agent-discovery-to-conversion case study and formalize the seller-facing "Nexez Certified Agent-Ready" standard.
2. **Strengthen ranking.** Tune marketplace and Nexxi ranking with real conversion, location, availability, verified-purchase review, response quality, and freshness evidence. Prevent sparse-data feedback loops.
3. **Integration proof.** Keep the certified Stripe price-sync replay monitored in Launch Control, add timezone-aware Calendly business hours, and monitor Shopify queue health through Launch Control.
4. **Mobile distribution.** Complete store builds, physical-device push checks, release review, deep-link validation, and parity checks for the seller mobile app.
5. **Notification control.** Add seller preferences for transaction, negotiation, integration, review, and marketing notifications without weakening mandatory money-state notices.

### P2 - Post-launch expansion

1. **Smart Rules depth.** Extend deterministic scope enforcement beyond price floors and enrich per-turn status artifacts while keeping all LLM output subordinate to owner policy.
2. **External agent demand.** Add a compliant transactable discovery partner and continue MCP, OpenClaw, SDK, WordPress, and Shopify distribution.
3. **Protocol maturity.** Expand ACP/UCP conformance fixtures, interoperability evidence, and automated sandbox certification as official protocol requirements stabilize.
4. **International operations.** Add tax, locale, currency-conversion reporting, regional policy, and payout guidance without ever summing unlike currencies as one amount.
5. **Custom-domain lifecycle.** Add a safe expiry/reclaim process for unverified stale domain claims.

## Accepted constraints

- `pages_public` remains the intentionally controlled public projection that strips private offer rules. Any redesign of this boundary is a dedicated security migration, not routine cleanup.
- Some low-value database policy and index advisories are accepted until traffic evidence justifies riskier consolidation or removal.
- Agent checkout and seller subscription flows remain separate money systems: sellers are merchant of record for marketplace transactions; Nexez is merchant of record only for its own subscriptions.
- Optional integrations may remain dormant when unavailable, but the UI and agent artifacts must represent that state honestly.

## Governance

- Keep `OfferItem` roundtrips lossless. Any serializer, importer, or schema change ships with fidelity tests.
- Keep public agent surfaces free from management UI dependencies, session requirements, and client-only semantics.
- Use additive, idempotent migrations with RLS enabled on every exposed table. Never expose service-role credentials to clients.
- Fail closed for authentication, authorization, action approval, and money movement. Fail soft only when the fallback reduces capability without widening access.
- Verify every code slice with lint, palette check, TypeScript, tests, production build, and relevant browser or live probes.
- Update this roadmap when scope changes. Keep command history, commit hashes, and detailed incident notes in `HANDOFF.md` and git history.
