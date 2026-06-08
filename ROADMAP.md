# Nexez Roadmap

**Mission:** Build the category-defining platform for **agent-optimized pages** — lightweight, crawlable, bookable surfaces that AI agents discover, understand, and transact with, while staying beautiful and linkable back to the human website. Dual philosophy throughout: **premium glassmorphism for humans, brutally clean semantic HTML for agents.** Supports professional services *and* consumer/local bookable services (plumbing, massage, cleaning, fitness, grooming, detailing).

> This is the product roadmap (vision → shipped → pending). For session/operational state (HEAD, env vars, verification commands, dev quirks) see [HANDOFF.md](HANDOFF.md). The full implementation history lives in git log, not here — keep this file concise.

## Quality bars (definition of done)
- **Importer magic** — paste a site → rich editable offer cards in ~30s; lossless import → builder → publish roundtrip; industry-aware defaults.
- **Builder fidelity** — VisualOfferBuilder is the single source of truth; 100% of `OfferItem` fields (tiers, duration, serviceArea, isMobile, travelFee, url, per-offer flags) roundtrip losslessly to DB and public page.
- **Analytics as ROI proof** — a new user sees evidence that agents are discovering and driving value in <5 min (charts, funnel, agent breakdown, per-offer conversion, pipeline $). Exportable.
- **Discovery power** — best-in-class directory/marketplace for agents + humans: pro/consumer split, facets, "agents also viewed", readiness/trust signals, embeddable cards.
- **Integrations "set once, forget"** — real sync + outbound webhooks for agent-driven bookings; per-integration status UI.
- **Agent consumption supremacy** — schema.org/JSON-LD + llms.txt + agent.json + MCP + plain-text on every published page; zero hallucination risk; public pages load fast and crawl cleanly (GPTBot/Claude/Perplexity/Grok…).
- **Production hardness** — test coverage on critical paths, error boundaries, working custom-domain verification, audited RLS/auth, clean build + typecheck, monitoring hooks.
- **Dual philosophy preserved** — every screen keeps the human-premium / agent-clean split. No bloat that complicates the clean agent HTML or the premium creation flow.

## Shipped (Phases 1–8 + Phase 7 advanced tiers — all live)
- **Importer & Builder** — multi-path crawl + schema.org/JSON-LD extraction returning rich `OfferItem[]` (confidence/source); guided import review with clarifying-answer refinement, 125+ industry/niche autocomplete, provenance, readiness, offer caps, and honest AI-status telemetry (`aiStatus`: used / fallback / deterministic); VisualOfferBuilder with tiers, consumer fields, templates, drag; create wizard + editor share the rich surface; intelligent re-sync with smart merge.
- **Analytics** — full Recharts suite (traffic, top offers, funnel, action/agent breakdown, top pages, conversion leaders), time ranges, key-insights, range-aware export. Real agent-visit tracking + agent-vs-human detection.
- **Directory / Marketplace** — pro/consumer split, facets (offer type, category, readiness thresholds), "agents also viewed", readiness/trust badges, favorites, click tracking, public `/api/directory` for agents.
- **Integrations** — Calendly, Stripe, Shopify, Square, Acuity, Google Calendar (import → editable offers, re-sync, status pills); outbound webhooks (per-page endpoints + secrets, fire on real booking/checkout events); Calendly + Stripe webhook receivers.
- **Per-offer controls & embeds** — per-offer "book on original site" flag (roundtrips via pipe-safe markers; respected in public CTAs, JSON-LD, agent.json); embed generator (iframe + real `/widget.js` floating button); version history (JSONB snapshots + restore).
- **Custom-domain hosting (Phase 8, core objective)** — host→serve via `proxy.ts`, managed SSL provisioning, connection wizard, brand-root `agent.json`/`mcp.json`/`llms.txt`, multi-page domains, white-label branding + inheritance, draft→preview→publish staging, deployments/rollback, real DNS-TXT verification.
- **Agent artifacts** — JSON-LD, llms.txt, `agent.json`, OpenAPI, plain-text context, badge SVG/JSON, and a **real MCP JSON-RPC endpoint** (`/[slug]/mcp`) + `mcp.json`.
- **Phase 7 advanced** — global Simulator + per-page history, AI Co-Pilot (descriptions/pricing/FAQ/schema with before-after + one-click apply), Trust Score + verification, competitor intelligence, verifiable-credentials attach, agent memory/context, voice optimization stub, team collaboration + approvals.
- **Commerce & trust** — negotiations end-to-end + receipts, gated email on new negotiation, escrow scaffolding, leaderboard, programmatic **API + keys** (`/api/v1/*`), account export/delete, team invites + collaborator RLS, in-app notifications, rate limiting, observability hook, freshness-monitor cron.
- **Platform polish** — premium shell (collapsible nav, search), dedicated Pages section with bulk actions + duplicate, redesigned homepage, bolder Nexez brand mark, platform-wide light/dark/system theme, hardened auth UX, onboarding checklist + empty states, real A/B variant serving + attribution.
- **Editor architecture** — the page editor (`app/dashboard/[id]`) is a server component (auth + parallel fetch + access redirects) feeding an `EditorClient` island over a `usePageEditor` hook + presentational panels (`components/editor/*`); the smart-merge / save-payload / version logic lives in unit-tested `lib/editor-merge.ts`.
- **Billing, support & hosted checkout** — Stripe **subscription billing** (`/dashboard/billing`, `/api/billing/{checkout,portal}`, plan Price IDs; gated → "setup Stripe" redirect when unconfigured); **support desk** (`/support`, `/api/support/{tickets,assist}`; tickets persist to `support_tickets`); **Nexez-hosted checkout** (`/checkout/[slug]` → real Stripe Checkout Session, with provider-redirect fallback for offers that prefer the original site). All Stripe surfaces degrade gracefully when `STRIPE_SECRET_KEY` is unset.
- **Security/RLS hardening** — Supabase advisors clean except the leaked-password toggle (auth dashboard config): scoped the `logos` bucket (dropped broad listing), moved `nz_page_is_published` to a non-PostgREST `private` schema (RPC no longer exposed; negotiation INSERT policy intact), indexed the `support_tickets` FK; collaborator RLS policies already use the `(select auth.*())` init-plan form.
- **Test coverage** — beyond the `lib/` unit suite (67 files / 330 tests): **API route-handler tests** (vitest, mocked Supabase via `test/supabase-mock.ts`) covering auth/tenancy/gating across api/v1 (+`[id]`), negotiations, account delete/export, custom-domain verify, Stripe webhook, billing checkout, public-simulate, and the `agent.json`/`llms.txt` artifacts; **component tests** (jsdom + Testing Library: ThemeToggle, ErrorBoundary, VisualOfferBuilder, PageCard); and **Playwright E2E** (`npm run test:e2e`) — public-page smoke + an authed, non-destructive editor smoke (creds via env, skips in CI). Responsive layout verified at mobile across all routes (no horizontal overflow).

## Pending / next
Forward-looking work, roughly by leverage:
- **Email reach** — booking emails ship for the Calendly webhook (`lib/email.ts` `buildBookingEmail`, gated on `RESEND_API_KEY`); extend to the Stripe webhook and add per-user notification preferences; consider account email via service-role lookup.
- **Real LLM assist** — Co-Pilot/analyzer/importer-fallback/voice are deterministic stubs gated on `LLM_API_KEY`; importer telemetry/status plumbing is shipped, next wire provider settings and opt-in controls once a key is configured.
- **Deeper integrations** — real bidirectional Calendly/Stripe sync (availability reflected in agent pages), richer price webhooks; per-domain scoped `llms.txt`/`openapi.json` (currently global).
- **Launch-prep differentiators** — templates marketplace (curated + user packs), "Nexez Certified Agent-Ready" certification, seed 20–30 high-quality directory pages, comparison/case-study marketing pages.
- **Deeper test coverage / CI** — GitHub Actions CI is live (`.github/workflows/ci.yml` push/PR gate; `e2e.yml` manual Playwright). Next: add repo secrets (`NEXT_PUBLIC_SUPABASE_*`, `E2E_EMAIL`/`E2E_PASSWORD`) to enable the authed E2E run, and keep extending the route/component suites into the long tail (~25 remaining API routes, more dashboard components).
- **Housekeeping** — enable Supabase Auth leaked-password protection (dashboard toggle); light-mode long-tail (rare hardcoded neutral classes on deep screens).

## Governance
- Preserve the human-premium / agent-clean split on every change. No bloat to public agent HTML or manifests.
- `OfferItem` is the sacred data model — any serialization change ships with a roundtrip test; prefer pipe-safe markers / JSONB over schema churn.
- DB migrations: additive, idempotent, applied via Supabase MCP `apply_migration` + committed `.sql`. **Never `supabase db push`** (tracking-table versions differ from repo filenames).
- Verify every change: `npm run lint -- --quiet` · `npx tsc --noEmit --incremental false` · `npm test` · `npm run build`.
- Record granular work in commit messages and HANDOFF.md, not in this file — update the Shipped/Pending sections only when scope actually changes.
