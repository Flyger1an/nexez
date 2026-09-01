# Nexez

**Commerce infrastructure built for buyer agents and the businesses they transact with.**

Nexez turns a business's offers into public, structured listings that humans can browse and
AI agents can search, understand, compare, validate, negotiate, and take to checkout. Sellers
maintain one source of truth while Nexez publishes the web experience, machine-readable
artifacts, transaction workflows, and operational controls around it.

Nexez is more than an AI landing-page builder: this repository contains the seller platform,
buyer-agent interfaces, commerce protocols, payment and negotiation lifecycle, integrations,
analytics, and release-safety systems.

## Platform capabilities

### Publish once for humans and agents

- Structured listings for services and products, including fixed-price and negotiable offers.
- Human-readable public pages with semantic HTML and JSON-LD.
- Per-listing `agent.json`, `llms.txt`, MCP manifest and JSON-RPC endpoint, and scoped OpenAPI.
- Platform-wide agent index, search API, MCP endpoint, OpenAPI document, and `llms.txt`.
- Seller storefronts that group multiple listings and expose storefront-level agent artifacts.
- Verified custom domains, branding, themes, reusable templates, drafts, and controlled publishing.
- Agent-readiness scoring, crawlability checks, deterministic and LLM-assisted simulation,
  AI optimization, and authenticated competitor analysis.

### Agent discovery and developer access

- Intent search with location, industry, readiness, capability, and price signals.
- Public machine discovery through `/.well-known/agent.json`, `/.well-known/mcp.json`,
  `/agent-pages.json`, `/agent.json`, `/openapi.json`, and `/llms.txt`.
- MCP tools for search, directory browsing, page inspection, dry-run checkout validation,
  and dry-run negotiation validation.
- REST APIs, owner API keys, signed outbound webhooks, and copy-paste buyer-agent examples.
- Published TypeScript SDK: `npm install @nexez/agent-sdk`.
- Published Python SDK: `python -m pip install nexez-agent-sdk`.
- Published OpenClaw discovery skill: `openclaw skills install nexez-agent-discovery`.
- Published OpenClaw tool plugin:
  `openclaw plugins install npm:@nexez/openclaw-nexez`.
- WordPress and Shopify integrations in [`plugins`](plugins), including Shopify catalog sync
  and proxied machine artifacts.

### Approval-gated agent commerce

- Fixed-price checkout through Stripe Connect, with the seller as merchant of record and
  Nexez application fees captured from the connected account.
- Negotiable offers with budget, timeline, scope, seller rules, asynchronous decisions,
  agreement state, status tokens, and payment handoff.
- Dry-run validation before consequential checkout or negotiation actions.
- Short-lived action-approval tokens, explicit buyer approval, and stable idempotency keys.
- Persistent orders, buyer receipts and order portals, refunds, disputes, reviews, and
  transaction-livemode provenance.
- Reconciliation workers and deduplicated webhook processing for payment and billing state.
- ACP and UCP product feeds for agent discovery.

OpenAI ACP and Google UCP checkout-session routes are implemented but fail closed until the
corresponding partner enrollment and shared credentials are enabled. Their product feeds remain
available for discovery. See [`docs/agentic-commerce-enrollment.md`](docs/agentic-commerce-enrollment.md)
for the deployment boundary.

### Seller operations

- Multi-listing and multi-storefront management with plan-aware publishing limits.
- Stripe, Shopify, Square, Calendly, Acuity, and Google Calendar integration surfaces.
- Provider-aware catalog synchronization that preserves manually authored offers.
- Live availability, booking webhooks, outbound automation webhooks, and integration health.
- Agent-versus-human traffic analytics, funnel and conversion reporting, offer performance,
  finance reporting, negotiation metrics, filtering, and exports.
- Team invitations and collaboration, billing portal, subscription reconciliation, support,
  referrals, saved pages, and notification workflows.

### Plans and entitlement enforcement

- Free, Launch, Pro, Scale, and Enterprise plans allocate publishing capacity, storefronts,
  domains, collaboration seats, automation, integrations, analytics, and support.
- Core commerce, including discovery, checkout, orders, refunds, reservations, agreements,
  staged settlement, and Stripe Connect payout onboarding, remains available independently of
  subscription rank when its operational safety requirements are satisfied.
- Paid capabilities are resolved from the server-side subscription and promotion lifecycle;
  client metadata never grants access, and unreadable entitlement state fails closed.
- Downgrades preserve seller configuration and transaction records while deterministically
  suspending over-capacity or no-longer-entitled execution.

The complete allocation matrix, resolution rules, and downgrade behavior are defined in
[`docs/plan-entitlements.md`](docs/plan-entitlements.md). The executable TypeScript matrix and
private database catalog are tested together as one contract.

### Buyer-agent experience

- Nexxi buyer-agent threads with streaming responses and structured approval cards.
- Saved sellers and searches, scheduled agent tasks, notifications, referrals, and order tracking.
- Buyer data export and deletion controls cover checkout-session identity, recurring service
  agreements, and staged-settlement records while preserving a seller account when the same
  identity also operates a business on Nexez.

## Safety and trust architecture

Nexez treats public discovery and consequential actions as different trust boundaries:

- Discovery artifacts expose published seller information without exposing drafts or secrets.
- Checkout and negotiation support side-effect-free validation before action.
- Mutating agent flows require matching approval context and are protected against retries.
- Database row-level security and explicit grants protect authenticated and service-only data.
- Provider credentials live in private server-side storage and are excluded from public artifacts.
- Rate limits, signed webhooks, replay protection, scoped status tokens, money constraints, and
  append-only evidence ledgers provide defense in depth.
- Test and live transaction provenance remains explicit.

The internal security and privacy baseline is documented in
[`docs/trust/README.md`](docs/trust/README.md). It is a control framework, not a claim that Nexez
has completed a SOC 2, PCI DSS, or other independent assessment.

Additional safety documentation:

- [`docs/agent-action-safety.md`](docs/agent-action-safety.md)
- [`docs/commerce-certification.md`](docs/commerce-certification.md)
- [`docs/agent-submission-pack.md`](docs/agent-submission-pack.md)

## Architecture

- **Application:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, and Radix/shadcn UI
- **Seller mobile:** Expo 57, React Native 0.86, Expo Router, and shared Supabase contracts
- **Data and identity:** Supabase Auth, PostgreSQL, Row Level Security, and Storage
- **Commerce:** Stripe Connect and Stripe Billing
- **AI:** deterministic fallbacks plus configurable OpenAI-compatible and native adapter layers
  for OpenAI, Gemini, Claude, and Grok
- **Deployment:** Vercel, scheduled workers, and GitHub Actions
- **Quality:** Vitest, Testing Library, Playwright, ESLint, TypeScript, protocol gauntlets, and
  live non-money-moving smoke checks

## Repository map

| Path | Purpose |
| --- | --- |
| [`app`](app) | Web application, dashboards, public pages, APIs, protocols, and webhooks |
| [`components`](components) | Seller, buyer, marketing, analytics, and shared UI |
| [`apps/seller-mobile`](apps/seller-mobile) | Expo seller app for listings, offers, inbox, finance, trust, and operations |
| [`lib`](lib) | Commerce, security, analytics, agent, integration, and domain logic |
| [`supabase/migrations`](supabase/migrations) | Database schema, constraints, RLS, grants, and durable ledgers |
| [`sdk`](sdk) | Published TypeScript and Python buyer-agent SDKs |
| [`plugins`](plugins) | OpenClaw, Shopify, and WordPress integrations |
| [`examples/agents`](examples/agents) | Buyer approval, discovery, validation, and negotiation examples |
| [`docs`](docs) | Enrollment, safety, certification, discoverability, and trust operations |

## Local development

The full platform requires private Supabase and service configuration. Optional integrations
remain dormant or fail closed when their credentials are absent.

```bash
npm ci
npm run dev
```

Root quality gates:

```bash
npm run lint
npm run lint:palette
npm run lint:dead
npx tsc --noEmit
npm test
npm run test:e2e
npm run build
npm run certify:commerce
```

Authenticated E2E coverage uses `E2E_EMAIL`, `E2E_PASSWORD`, and the public Supabase connection
values. Credential-dependent cases skip when those variables are absent. `certify:commerce` is
designed not to move money; deliberate live lifecycle checks are governed by
[`docs/commerce-certification.md`](docs/commerce-certification.md).

Seller-mobile verification:

```bash
npm run check:mobile-platform-contracts
cd apps/seller-mobile
npm ci
npm run lint
npm run typecheck
npm test
npm run check:expo-deps
npx expo-doctor
```

`npm run certify:release` is the controlled production gate. It requires an exact deployed commit,
a successful source-CI result, and the release-certification secret; the main-branch workflow runs
it after CI rather than treating it as an ordinary local command.

## License

Proprietary - Copyright © 2026 Nexez. All rights reserved. Source-available for reference only;
not licensed for reuse or redistribution. See [`LICENSE`](LICENSE).
