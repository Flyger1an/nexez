# Nexez Roadmap

_Last reconciled: 2026-08-21 against production and `origin/main` at `5ba2406`._

**Mission:** Make any business legible and transactable to autonomous agents without forcing it to replace its human website. Nexez provides structured storefronts, agent artifacts, transaction rails, seller operations, and distribution into agent workflows.

This document tracks product direction and launch status. Use [HANDOFF.md](HANDOFF.md) for operational details, environment state, and verification commands. Git history remains the implementation record.

## Current standing

The core platform is built and its live commercial lifecycles are certified. Public storefronts remain fast and semantic on `nexez.app`; seller management lives on `app.nexez.ai`; marketing and public education live on `nexez.ai`. Automated release certification is active. The seller-facing Nexez Certified Agent-Ready standard is versioned, continuously evaluated, and machine-verifiable without conflating technical readiness, identity trust, or human marketplace review.

Since the last reconciliation the work has been distribution, evidence, and repair rather than new commerce surface. The platform now answers the discovery conventions agents actually probe (ARD catalog, MCP server card, A2A agent card), publishes an original agent-readiness study built on a real 652-site sample, runs an eight-article education library, and carries a durable job runner. Custom-domain verification, the edge proxy, and the negotiation replay path were each hardened in response to observed production failures rather than speculatively. The repository moved to the `nexez-ai` organization and development is now pull-request based with a broader automated gate.

**Supply remains the launch constraint and curation is intentionally open.** The 2026-08-21 production audit found 3 published/serving storefronts, 1 certified listing, 10 curation candidates, and no unreviewed curation rows. Listings stay discoverable unless deliberately excluded, and QA/scratch cleanup remains manual rather than a broad gate. Agentic Resource Discovery still applies curation's identity heuristic independently, so registry-facing output may be stricter than the marketplace. That asymmetry is known and accepted.

The next milestone remains growing real launch-quality supply and proving demand.

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
- Agentic Resource Discovery: `/.well-known/ai-catalog.json` built to the published ai-catalog 1.0 schema, plus a domain-scoped per-merchant catalog on verified custom domains. Listing URNs are identical across both so registries deduping by ARD identifier collapse a listing found twice into one result. `trustManifest` is deliberately omitted rather than fabricated.
- MCP server card and A2A agent card served at the paths agents were observed probing (`/.well-known/mcp/server-card.json`, `/.well-known/mcp`, `/.well-known/agent-card.json`), derived from the existing manifest so the surfaces cannot disagree. x402 probes are deliberately unanswered because the platform does not implement it.
- Public education library at `/learn`: agentic commerce pillar, GEO, MCP servers, JSON-LD, `llms.txt`, `agent.json`, Google UCP, ChatGPT recommendation, ACP/UCP/MCP comparison, and the agent-readiness study.
- Versioned Nexez Certified Agent-Ready standard with continuous 11-check evaluation, honest certified/readiness badge states, machine-readable verification, seller remediation, and a public methodology.
- OpenClaw plugin and skill, published TypeScript and Python SDKs, examples, registry metadata, and agent-access smoke coverage.
- ACP and UCP feeds and checkout-session adapters with persisted idempotent sessions and durable order attribution.
- Public scanner, simulator, developer pages, comparison content, and agent-readiness guidance.

### Discovery and marketplace

- Searchable directory and marketplace with professional/consumer facets, category, offer type, readiness, trust, worldwide location filtering, geolocation, favorites, related listings, and click attribution.
- Nexxi buyer-agent search with transactable-first ranking, Nexez and web sources, semantic plus lexical retrieval, structured memory, streaming, voice, and approval-aware actions.
- Reviews restricted to verified purchasers, seller responses, moderation state, aggregate ratings, and ranking inputs.
- Admin marketplace curation with deterministic quality flags, explicit unreviewed/candidate/certified/excluded states, private notes, append-only decisions, and discovery-only exclusions that preserve direct storefront access. The ARD catalog and the marketplace queue share one exported identity guard, so a listing withheld from one cannot be admitted by the other.
- Anonymized public-scanner persistence: aggregate signals from every `/api/scan` run stored service-role-only behind RLS and hard ACL denial, written after the response so scan latency is untouched, salted domain hash for dedupe, raw hostname confined to a column excluded from all aggregate paths, and rows tagged by source/cohort/vertical so study data stays separable from organic scans.
- Agent-readiness study harness: reproducible OSM/Overpass sampling across 12 fixed metros and 5 verticals with chain and platform exclusions, atomic `SKIP LOCKED` claiming, a bearer-gated internal runner, robots.txt politeness pre-checks before any fetch, cron-driven seed-then-scan drivers, and an as-run runbook with the aggregate SQL every published statistic derives from.

### Commerce and seller operations

- Fixed checkout through seller Stripe Connect accounts with plan-based application fees; no fallback charge into the platform account.
- Persistent negotiation threads, deterministic rules, LLM-assisted decisions clamped by owner rules, status polling, owner override, and asynchronous worker recovery.
- Content-based negotiation replay: an agent that mints a fresh idempotency key per retry no longer forks duplicate negotiations, because a proposal whose action-request hash matches an open negotiation on the same slug and offer within the hour is returned as a replay. Open pre-funding negotiations untouched for 14 days are swept to `expired`, which keeps the open-deals view honest and bounds the replay set.
- Escrow/manual capture lifecycle, hourly reconciliation, direct order ledger, buyer order portal, receipts, recourse requests, disputes, partial/full refunds, and fee reversal.
- Subscription billing, embedded payment, plan changes, portal access, billing history, usage, Connect status, Finance dashboard, and multi-currency seller reporting.
- Durable Free fallback, verified-business complimentary six-month Launch grants, two email-bound business passes, bounded referral delivery, expiry notices, and preserved draft/listing state.
- Short-lived payload-bound approval tokens plus idempotency keys across checkout, negotiation, web clients, SDKs, and agent clients. Mandatory production enforcement is live.

### Integrations and automation

- Calendly, Stripe, Shopify, Square, Acuity, and Google Calendar import and re-sync flows.
- Shopify OAuth app with GraphQL catalog import, product webhook queue, recoverable claims, bounded retries, exact-shop tenancy, seller-visible health, and app-review submission.
- Stripe price webhook sync, Calendly availability and stored-credential sync, one-time scheduling links, cancel-on-refund, outbound seller webhooks, and scheduled reconciliation/freshness workers.
- Encrypted third-party credentials, feature gating, graceful dormant states, and integration status surfaces.
- Inngest durable job runner: typed event vocabulary, three durable functions (outbound webhook dispatch, freshness nudges, feed regeneration on a 6-hour cron), and a signature-verified serve route. Dormant until `INNGEST_EVENT_KEY` is set.
- Custom-domain verification hardening driven by real support cases: zone-appended TXT records are detected across multi-zone setups and the error names the exact fix instead of blaming propagation, the requested CNAME is confirmed by independent DNS lookup rather than trusting the provider's own field, and the hand-maintained `cname.nexez.app` merchant pointer is monitored on the existing smoke cron for drift, dangling, and unreadable-reference failure modes.
- Edge proxy resilience: a failed custom-domain lookup never poisons the cache, the stale map keeps serving, a 3-second per-host backoff bounds retry cost under a sustained outage, both maps are size-bounded, PostgREST error payloads are treated as failures rather than as "no pages", and malformed artifact paths 404 instead of throwing.

### Analytics, trust, and administration

- Agent-vs-human detection, agent type, traffic, queries, funnel, conversion, revenue, page and offer breakdowns, exports, and per-page filtering.
- Simulator history, AI Copilot, competitor analysis, readiness/trust score, credentials, voice optimization, agent memory, leaderboard, and verification signals.
- The homepage Commerce Intelligence simulator renders one buyer-safe decision path across live marketplace matches, related supply, Commerce Library references, and uncovered requests: intent understood → supply checked → commerce behavior resolved → safe action boundary. Vercel custom events measure result modes, engagement, refinements, and handoffs without recording raw buyer queries; structured route logs retain only bounded operational metadata.
- Team invites, accepted-only collaborator access, owner-entitlement inheritance on shared pages, approval workflows, notifications, support desk, account export/delete, and API keys.
- Three-host auth/routing architecture, shared session on the `.nexez.ai` app family, cookie-isolated agent runtime, rate limiting, observability, security headers, RLS hardening, and public projection parity tests.
- Trust framework in `docs/trust/`: control, data, and vendor registers, incident response, operating checklists, and a rollout plan, alongside a reconciled platform README.
- `requirePageAccess` guard collapsing the authenticate/service-role/authorize preamble into one call returning a discriminated union, so a handler body can only be entered while holding a grant. It stays a guard rather than a wrapper because these routes do rate limiting and body parsing before authorization, and custom-domain needs the admin client to discover which page is even being addressed.
- Owner-select schema guard: every column in the server, owner, and basic selects must exist on `public.pages` or the build fails, and settings degrades to the basic select when the rich one errors, matching its three sibling surfaces.
- Vercel Speed Insights on the Next.js app.
- Seller mobile app foundation with intake, listing management, analytics, negotiations, finance/orders, integrations, notifications, and account workflows.

### Launch operations

- Admin-only **Launch Control** at `/dashboard/launch-control`: redacted configuration checks, live Stripe Price-mode verification, commerce evidence, queue health, incidents, and worker status using existing ledgers.
- `npm run certify:commerce`: live API/artifact checks, checkout and negotiation dry runs, mandatory token issuance, tokenless-live denial, and read-only Stripe Price verification.
- Owner-run certification runbook in `docs/commerce-certification.md`, separating safe automation from deliberate subscription, payment, escrow, refund, price-sync, and protocol lifecycle checks.
- Stripe-mode provenance on orders, escrow, and ACP/UCP sessions. Finance, Analytics, and Launch Control count only Stripe-proven live transactions; test and unverified history fail closed.
- Replacement-price synchronization follows explicit Stripe Product `default_price` changes, rotates the linked Price ID, and remains idempotent on redelivery.
- ACP and UCP sandbox settlement is certified independently for both channels, including create and completion replay. Default-Price replacement, linked-offer audit, duplicate delivery, and parallel-Price isolation are also certified in Stripe test mode. This evidence is excluded from all live revenue reporting.
- Live subscription, portal cancellation, partial/full refund, and negotiation funding/reconciliation lifecycles are owner-certified and reflected in Launch Control.
- Automated release certification ties successful source gates to the exact deployed revision, verifies all three hosts and agent artifacts, records the authoritative Launch Control verdict in an append-only ledger, and preserves a workflow artifact for each production candidate.
- The first production release certificate passed on commit `92fe535`: Launch Control scored 100, all 32 required checks passed, and the durable ledger recorded the exact deployed revision with zero failures.
- Launch Control now exposes the marketplace review queue and a non-blocking inventory signal that stays visible until at least 20 listings are certified and no supply remains unreviewed.
- Launch Control includes **Growth Control** for complimentary Launch grants: redacted activation and invitation telemetry, capacity and paid-conversion signals, lifecycle activity, and append-only operator controls for pause, resume, signup close, capacity, and terminal campaign end.
- `supabase/tests/seller_growth_gauntlet.sql` certifies welcome activation, verified-business deduplication, paid-plan precedence, email-bound referrals, self/wrong-email/pass-limit rejection, pause/resume idempotency, capacity enforcement, Free fallback, aggregate telemetry, and terminal campaign behavior inside one fully rolled-back production-schema transaction.
- A dedicated admin control panel separate from Launch Control, and a private cohort layer over growth control: three cohort actions, a five-state member lifecycle, an `open`/`invite_only` enrollment mode, roster metrics, and a roster panel wired into Growth Control. **The cohort migration is in source but not applied to production** — see the launch gate below.
- Automated gate on every pull request and push to `main`: ESLint, TypeScript, tests, the palette guard, orphaned-file detection via knip (`lint:dead`), and SDK/plugin/skill version parity. Export- and type-level dead code is reported by `lint:dead:all` but deliberately left unblocking, because roughly sixty of those flags are load-bearing or judgement calls.
- Version-parity coverage now extends past the SDKs to the OpenClaw plugin and the ClawHub skill, both of which advertised versions that were never published. Runtime versions derive from `package.json` and `SKILL.md` rather than restating them in a constant.
- Metered Actions consumption cut without weakening the main gate: a concurrency group on CI scoped so superseded PR runs cancel while push-to-main runs survive to feed release certification, floor-and-ceiling test matrices on PRs with the full range on `main`, and the agent-access smoke moved from 6-hourly to daily with dispatch still available on demand.

## Active roadmap

Ranked by launch leverage.

### P0 - Launch gate

1. **Curate launch inventory.** Publish and certify 20-30 high-quality storefronts across representative industries and regions. The 2026-08-21 live baseline is 3 published/serving storefronts, 1 certified listing, and 10 curation candidates. Synthetic Commerce Library scenarios and benchmark fixtures never count toward this target.
2. **Keep production parity certified.** The former drift gate is cleared: `pages_public` no longer exposes `agent_memory`, the replayable v2 drop is present in source and production, and the cohort migration's `enrollment_mode` / `invite_kind` columns are live. Release certificate `5ba2406` passed at 100 with zero required failures. Reopen this gate only on new evidence, not the stale 2026-08-15 snapshot.

### P1 - Launch strength

1. **Prove demand.** Publish a real agent-discovery-to-conversion case study using production evidence without inventing attribution or outcomes. The supply-side half of the evidence problem is now solved: the agent-readiness study samples 652 real sites and its aggregates are reproducible from documented SQL. The demand-side case study still requires a real transaction with real attribution, which no amount of scanning substitutes for.
2. **Strengthen ranking.** Tune marketplace and Nexxi ranking with real conversion, location, availability, verified-purchase review, response quality, and freshness evidence. Prevent sparse-data feedback loops.
3. **Integration proof.** Keep the certified Stripe price-sync replay monitored in Launch Control, add timezone-aware Calendly business hours, and monitor Shopify queue health through Launch Control. The Stripe delivery check now grades delivery health rather than traffic recency, so a healthy-but-idle account no longer fails certification; endpoint status resolved from the Stripe API is the traffic-independent signal.
4. **Mobile distribution.** Complete store builds, physical-device push checks, release review, deep-link validation, and parity checks for the seller mobile app. The Nexie mobile app is now gated on a typecheck in its own paths-filtered workflow, so a type error cannot reach `main` unnoticed. It has no lint config and no test harness, and `expo install --check` reports ten outdated Expo packages; the SDK bump is deliberately deferred to its own change and exposed meanwhile as `npm run check:expo-deps`.
5. **Notification control.** Add seller preferences for transaction, negotiation, integration, review, and marketing notifications without weakening mandatory money-state notices.
6. **Free activation loop monitoring.** The control plane and 15-case live-schema baseline are complete. Monitor real qualification, abuse rejection, invitation delivery, activation, paid conversion, expiry notices, and Free fallback outcomes in Growth Control before expanding the campaign cap. Blocked on the cohort migration in P0.
7. **Publish the study's second cohort.** The `readiness-2026-08` cohort ran and the v2 rerun procedure is documented. A repeat sample is what turns a snapshot into a trend, which is the version of this asset that earns links.

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
- The ARD catalog omits `trustManifest` rather than emitting a fabricated envelope, and the platform does not answer x402 probes. Advertising a payment protocol Nexez does not implement would break buyer agents mid-checkout; both stay absent until the underlying capability is real.
- ARD identity exclusions share curation's heuristic, which reads description prose. A real merchant whose description says "for example" is withheld from the catalog. That false negative is accepted so the two gates cannot drift apart.
- Marketplace discovery is open by default and curated by exception. Exclusion is reserved for a deliberate operator decision, and tidying internal or scratch listings is done manually rather than by broadening the gate. The ARD catalog is stricter than the marketplace on purpose; the two surfaces are permitted to disagree in that direction.
- `marketplace_discoverable` on the base `pages` table is an inert default-true placeholder that exists only so owner selects do not fail. The authoritative value lives on `pages_public`, derived from `marketplace_curations` by trigger. Never read it from `pages` for a visibility decision.

## Governance

- Keep `OfferItem` roundtrips lossless. Any serializer, importer, or schema change ships with fidelity tests.
- Keep public agent surfaces free from management UI dependencies, session requirements, and client-only semantics.
- Use additive, idempotent migrations with RLS enabled on every exposed table. Never expose service-role credentials to clients.
- Fail closed for authentication, authorization, action approval, and money movement. Fail soft only when the fallback reduces capability without widening access.
- Verify every code slice with lint, palette check, TypeScript, tests, dead-code check, production build, and relevant browser or live probes.
- The repository is private under the `nexez-ai` organization and work lands through pull requests. Public surfaces must never reference the old personal repository or account.
- A migration applied to production by MCP is not shipped until it is mirrored into `supabase/migrations` and can be replayed from an empty database. A migration in source that production has since reverted is drift, not history.
- An advertised version is a claim about a published artifact. Derive it from the artifact — `package.json`, `SKILL.md`, the registry — never from a constant that restates it, because a stale literal in a test and a stale constant in source form a self-consistent pair no test catches.
- Update this roadmap when scope changes. Keep command history, commit hashes, and detailed incident notes in `HANDOFF.md` and git history.
