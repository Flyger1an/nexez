# Nexez — Session Handoff

_Last updated: 2026-06-11 — platform GA-complete (negotiation money system + hardening + observability), **anon-`pages` exposure fixed**, and the **nexez.ai / nexez.app domain split is live** (core + marketing chrome). **HEAD moves constantly** — Flyger1an / Grok Build / codex push to `main` in parallel; `git fetch` first._

## ⚡ NEW CONTEXT WINDOW START HERE

**State:** deployed, green (**479 tests · lint · tsc · build**). The agent-to-agent **negotiation + escrow money system is GA-complete**, and the platform now runs as a **two-domain architecture**: **`nexez.app` = the agent-facing brain**, **`nexez.ai` = the human marketing/discovery front**. Everything below is **live on prod**. The only substantive remaining work is the **user-driven Stripe live-mode cutover**.

### Shipped this session (newest first — full detail in git log)
- **Domain split `nexez.ai` ↔ `nexez.app` (core `646245d` + marketing chrome `43685a1`).** One app, **host-based canonical routing** in `proxy.ts` (308 off-canonical between the two prod hosts; `*.vercel.app`/localhost serve everything; `/sitemap.xml`+`/robots.txt` are host-neutral). **`lib/site.ts`** (tested) is the source of truth: `APP_HOST`/`MARKETING_HOST` (marketing defaults to `nexez.ai` even without env), `isMarketingPath`/`canonicalHostFor`/`isHostNeutralPath`, `appUrl()`/`marketingUrl()`. Marketing surfaces (`/`, `/pricing`, `/privacy`, `/terms`, `/design`, `/directory`, `/leaderboard`, `/marketplace`, `/simulator`, `/support`) live on `.ai` with a `components/MarketingShell.tsx` nav/footer (routed via `PlatformFrame`+`isMarketingPath`; the in-app shell is now just `/dashboard`+`/create`; the homepage keeps its bespoke nav; agent pages stay bare). **The brain's base URL is unchanged** (`getBaseUrl()`=nexez.app) so **the agent contract doesn't move** — `agent.json`/`mcp`/negotiation links stay nexez.app (verified live). **Auth seam:** `.ai` is **auth-blind** (no cross-domain cookie) → the anonymous marketing/demo surface; **all auth + anything needing identity lives on `.app`**; the simulator's "test your own pages" is a graceful "sign in on nexez.app →" deep-link (no SSO). Host-aware `sitemap`/`robots` per domain. Plan: `~/.claude/plans/elegant-juggling-fairy.md`.
- **Red-team pass + anon-`pages` exposure fix (`34e50a6`).** An authorized 5-agent pentest: prompt-injection / auth-IDOR / money-path / rate-limits all **held**. One real finding fixed: the `"Public can read published pages"` RLS policy exposed the **whole** `pages` row to anon via raw `/rest/v1/pages` (incl. each offer's private `rules.minPrice` + secret columns). Fix (staged, zero-downtime, prod-verified): a redacted **`public.pages_public`** view (offer `rules` stripped, only `PUBLIC_PAGE_SELECT` cols) + **revoked anon SELECT on base `pages`**; ~20 anon-context reads repointed to the view; the 3 rules-needing reads (negotiation clamp, `/api/negotiations` dryRun, `/api/checkout` booking caps) → service-role; the 2 anon analytics INSERT policies (`agent_visits`/`checkout_events`) → a SECURITY DEFINER helper (`private.nz_page_visit_allowed`). Migrations `20260617000000` + `…010000`. _Side-effect: a Supabase advisor `security_definer_view` ERROR on `pages_public` — benign + un-dismissable (Supabase has no acknowledge feature); clears only via the rules-out-of-jsonb refactor below._
- **Burst 3 — negotiation engine to GA-at-scale (all live):** **3a** async LLM decision (POST returns instantly with `decisionPending:true`+`statusUrl`; agents poll `/api/negotiations/status`; `submitProposal`/`runDecision` split + a `decision_claimed_at` 90s lease for exactly-once — fixes a "limbo" where `/status` showed not-pending+null mid-LLM; backstop cron `/api/cron/process-negotiations`; layered IP(30)/page(60)/agent(12) rate limits replacing 20/min/IP). **3b** adversarial input hardening (`lib/negotiation-input.ts` caps + `lib/llm-engine/prompt-safety.ts` fencing+preamble across all 4 adapters + injection tests + opt-in `scripts/loadtest-negotiations.mjs`). **3c** owner metrics dashboard `/dashboard/negotiations/metrics` (pure `lib/negotiation-metrics.ts`) + proactive backlog alerting in the process cron. The **price-floor clamp + the `internalNotes` strip (`lib/negotiation-sanitize.ts`) are the hard guarantees; the LLM is never trusted to self-enforce.**
- **Bursts 1 & 2 (earlier this session) — the money rails:** buyer-funded hybrid escrow (`/api/negotiations/pay`, Connect-routed, `lib/settlement.ts` auto ≤$2k vs owner-approval above) + reversibility/self-healing (`refunded`/`disputed` statuses, webhook reversals, hourly `reconcile-escrow` cron, the `nz_negotiation_money_safety` trigger). All env keys wired + verified (Resend email, Better Stack observability, `CRON_SECRET`, Vercel/agent-hash trio).

### Pending
- **Stripe live-mode cutover (USER-DRIVEN — can't enter keys / move real money):** everything is `sk_test`; the test owner has no connected Stripe account, so the Connect `application_fee` path is unit-tested only. Runbook: `~/.claude/plans/purrfect-rolling-storm.md` (live keys + a live webhook with **"events on connected accounts"** + Connect onboarding + one real low-value txn).
- **`pages_public` advisor finding** (optional, cosmetic-only): move offer `rules` out of the public `services`/`products` jsonb into an owner-only column → then the view can be `security_invoker=true` and the advisor returns to 0. Security is already achieved; this only quiets the lint. (Touches every `offer.rules` reader/writer + a data migration.)
- **Domain-split polish (optional):** unify homepage/pricing onto `MarketingShell` (they keep bespoke navs today); make homepage app-CTAs absolute (`appUrl`) to skip the one 308 hop; add `NEXT_PUBLIC_MARKETING_URL=https://nexez.ai` in Vercel (code already defaults to it).
- **Eyeball-only (owner-credential gated):** the authed metrics-dashboard visual; forcing the 3c backlog alert into Better Stack (the alert path itself is verified live — backlog count + scheduled cron fire confirmed).

### Inspection data — DO NOT WIPE
**`qa-neg-sim-33`** (1 published page, **33 negotiations**) — the user's live 33-offer simulation; they want to log in and inspect it. All other `qa-*` smoke-test data has been cleaned up. (It legitimately carries `minPrice` in `rules`, which the `pages_public` view correctly strips for anon.)

### ⚠️ Critical workflow — parallel `main` (read before any code change)
The user (**Flyger1an**) + **Grok Build** + **codex** push to `main` **constantly, in parallel**. `origin/main` moves every few minutes, and the **local main checkout (`/Users/taio/nexez`) is usually their diverged WIP**. **Do NOT edit or commit in the main checkout.** Instead:
1. `git fetch origin -q` then `git worktree add -b <branch> /Users/taio/nexez-wt-X origin/main`.
2. For code changes: `rm -rf <wt>/node_modules` then `cp -al /Users/taio/nexez/node_modules <wt>/node_modules` — **Turbopack rejects a *symlinked* node_modules**; hardlink-copy works. `ln -s …/.env.local`. (Docs-only changes can skip node_modules.)
3. Edit only your files, verify (lint/tsc/test/build), `git push origin HEAD:main` (fast-forwards origin since you based on its tip). Then `git worktree remove <wt> --force` + `git branch -D`.
4. If a push doesn't trigger a Vercel build, re-trigger with an empty commit. **Env-var changes need a redeploy.** Commit trailer is flexible (`Grok Build`, `Claude Fable 5`, `Claude Opus 4.8` all used).

See memory: [[parallel-main-push-workflow]], [[nexez-deploy-verify-loop]].

---

## Project
**Nexez** helps businesses create dedicated, highly structured pages optimized for **AI agents** to discover, understand, and purchase from. Dual philosophy: **premium glassmorphism human dashboard** (now on **nexez.ai**) vs **brutally clean/semantic HTML for agents** on public `[slug]` pages (on **nexez.app**). A core objective is **deploying agent-optimized pages to custom domains**, managed from the Nexez backend.

## Stack & critical conventions
- **Next.js 16.2.7 (App Router, Turbopack)** — ⚠️ `AGENTS.md` warns this is a modified Next with breaking changes vs training data; **read `node_modules/next/dist/docs/` before using framework APIs**. The middleware file is **`proxy.ts`** at the repo root (exports `proxy`), NOT `middleware.ts` — it does custom-domain rewrites, the **.ai/.app canonical-host 308 split**, A/B bucketing, and the auth gate (`updateSession`).
- **Supabase** (Postgres + RLS + Auth + Storage). Clients: `utils/supabase/server.ts` (cookie/session), `utils/supabase/client.ts` (browser), `utils/supabase/admin.ts` → `createAdminClient()` / `hasSupabaseAdminEnv()` (service-role, gated). Project `pvsotrzgnjpqrsndhgmu`. **Anon reads of pages go through the `pages_public` view** (rules stripped); reads that need `rules` use the service-role client on base `pages`.
- **Deploy:** Vercel auto-deploys on push to `main`. **Two prod domains, one app:** **`https://nexez.app`** (agent brain) + **`https://nexez.ai`** (marketing) — both serve the project directly; `proxy.ts` 308-canonicalizes each route to its host. Preview/branch URLs are SSO-gated. Vercel project `prj_uREcprpInoeHVhgV7aWc14TRsnLi`, team `team_rwkVXglmM5D0MPXjGTqOPVKO`.
- **Verify EVERY change:** `npm run lint -- --quiet` · `npx tsc --noEmit --incremental false` · `npm test` · `npm run build`. Route tests mock Supabase via `test/supabase-mock.ts` (`createSupabaseMock`); component tests declare `// @vitest-environment jsdom` + import `test/dom.ts`. Stripe-using route tests mock `stripe` with a **`class`**. E2E (`npm run test:e2e`) is opt-in; authed smoke runs only with `E2E_EMAIL`/`E2E_PASSWORD`.
- **Migrations:** apply via **Supabase MCP `apply_migration`** AND write the `.sql` into `supabase/migrations/`. **Never `supabase db push`.** All idempotent. The DB schema is authoritative via MCP regardless of how the migration *files* are organized (the user periodically runs `clean supabase migration history` commits).

## Credentials / account (repo is PUBLIC — never commit secrets)
- Test account **`realestglad@gmail.com`**, owner_id **`5320a9ef-9e9f-4e8b-ac78-13b9270c571b`**. Password is **not** stored — the user pastes it when authed verification is needed. **Clean up any test artifacts you create** (`qa-neg-sim-33` is the deliberate exception — leave it). If the user pastes a secret (e.g. `CRON_SECRET`) for a one-off, use it in-session only; never write it to a file.
- Safety boundaries shaping verification: **can't enter passwords/cards or move real money.** Owner-authed flows (escrow approve/capture/refund), live-mode Stripe, Connect onboarding are **user-driven** — verified via SQL-mimic + the DB trigger + signed-webhook simulation, not by driving the authed UI.

## Negotiation + escrow money system (the centerpiece — read for any money-path edit)
- **Lifecycle (`lib/negotiations.ts`):** statuses `negotiation → agreement_proposed → held → complete`, plus terminal `declined | expired | refunded | disputed`. `getAllowedNegotiationTransitions` / `canTransitionNegotiation`. `refunded`/`disputed` set only by the refund action / webhook.
- **Engine (`lib/negotiation.service.ts`, async since 3a):** `submitProposal()` (sync, on POST) records the buyer turn + marks the row `decision_pending`; **`runDecision()`** (async, from `after()` + the backstop cron) claims via a `decision_claimed_at` lease (exactly-once), runs the LLM with full history, **clamps to the rules floor (rules always win)**, persists turns to `negotiation_messages` (service-role), sets agreed `amount_cents`, classifies `settlement_state` (`lib/settlement.ts`), bumps `decision_seq`. **Token = credential** (`status_token`), enforced in `loadNegotiation`. Fallback decision on LLM failure so agents never hang.
- **Status poll (`/api/negotiations/status`):** returns `decisionPending`/`decisionSeq` + the sanitized decision (`lib/negotiation-sanitize.ts` strips `internalNotes`) + `settlementState`/`payable`.
- **Buyer pays (`app/api/negotiations/pay/route.ts`):** token-gated; Connect-routed Checkout (`auto`→immediate capture, `approved`→manual hold); idempotent; dual-mode (JSON for agents, 303 for the `/negotiate` form).
- **Owner actions (`app/api/negotiations/escrow/route.ts`):** `approve | capture | cancel | refund` (Connect-aware via `billing_subscriptions.stripe_connect_account_id`). State changes go through `/api/negotiations/transition` (`canTransitionNegotiation`), not the browser.
- **Webhook (`app/api/webhooks/stripe/route.ts`):** HMAC-verified first; event-id idempotency ledger (`stripe_webhook_events`, service-role-only); settle + reversal events; self-heals on failure.
- **Crons:** `reconcile-escrow` (hourly — Stripe↔DB drift) + `process-negotiations` (`*/5` — backstop the async decision + aggregate backlog alert). Both `CRON_SECRET`-gated.
- **DB safety:** trigger `nz_negotiation_money_safety` blocks `held`-without-PI and `complete`-of-a-payment-backed-neg-without-a-captured-hold (unless `auto`/`disputed`).

## Architecture notes for common edits
- **Domain split:** `lib/site.ts` (host helpers — the marketing/brain manifest), `proxy.ts` (canonical 308s + custom-domain rewrite + auth gate), `components/MarketingShell.tsx` + `components/PlatformFrame.tsx` (chrome routing: marketing→MarketingShell, `/dashboard`+`/create`→PlatformShell, else bare), host-aware `app/sitemap.ts` + `app/robots.ts`. `getBaseUrl()` (`lib/agent-page.ts`) = nexez.app and must stay (agent contract).
- **Core types/helpers:** `lib/agent-page.ts` — `OfferItem`, `OfferRules` (incl. `autoSettleMax`), `AgentPage`, `PUBLIC_PAGE_SELECT`/`OWNER_PAGE_SELECT`, `getCheckoutOffer`, `getRequestBaseUrl`, readiness/trust/certification.
- **Agent artifacts:** `lib/agent-manifest.ts`, `lib/mcp-server.ts`, `app/[slug]/{agent.json,mcp.json,mcp,llms.txt,badge.svg,badge.json}` (all on nexez.app).
- **Stripe Connect / commission:** `lib/stripe-billing.ts`; `app/api/checkout/route.ts` is the canonical connected-account + `application_fee` pattern (reused by `pay`).
- **Observability:** `lib/observability.ts` `captureError` (gated on `OBSERVABILITY_WEBHOOK_URL`; `OBSERVABILITY_WEBHOOK_TOKEN` → Bearer; warns on non-2xx). Callers: reconcile + process crons, negotiation persist failures.
- **Custom domains:** `lib/custom-domain.ts` (`isPlatformHost` now also recognizes nexez.ai), `proxy.ts`, `lib/vercel-domains.ts` (gated), `app/api/custom-domain`.
- **App shell:** root `app/layout.tsx` → `PlatformFrame.tsx` → `PlatformShell` (app) | `MarketingShell` (marketing) | bare. Dashboard `app/dashboard/page.tsx` is a server component → `DashboardClient.tsx`. Editor `/dashboard/[id]` is a server component → `EditorClient`.
- **Email:** `lib/email.ts`; `EMAIL_FROM` overridden to the Resend-verified `updates.nexez.app` sender.

## Gated features (env-set; **Vercel → project `nexez` → Settings → Environment Variables → Production**, then redeploy)
| Env var(s) | Unlocks | Status |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` + `…PUBLISHABLE_KEY` | the app runs | ✅ set |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/v1/*`, account export/delete, webhook + cron + negotiation DB writes, the `pages_public`-bypassing rules reads | ✅ set |
| `STRIPE_SECRET_KEY` (+ `STRIPE_PRICE_*`) | billing subs, hosted checkout, **all negotiation escrow** | ✅ set (**`sk_test`** — live cutover pending) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook (escrow settle/reversal, billing sync) | ✅ set (sandbox) |
| `LLM_API_KEY` (+`LLM_BASE_URL`/`LLM_MODEL`/`LLM_PROVIDER`) | real LLM negotiation + assist (grok-4.3) | ✅ set |
| `CRON_SECRET` | gates `/api/cron/{freshness,reconcile-escrow,process-negotiations}` (Vercel cron auto-auths) | ✅ set |
| `RESEND_API_KEY` (+`EMAIL_FROM`) | transactional email | ✅ set (`updates.nexez.app`; delivered) |
| `OBSERVABILITY_WEBHOOK_URL` (+`OBSERVABILITY_WEBHOOK_TOKEN`) | `captureError` → Better Stack | ✅ set (verified) |
| `AGENT_VISIT_HASH_SALT` | salt for agent-visit IP hashing | ✅ set (don't rotate) |
| `VERCEL_API_TOKEN` + `VERCEL_PROJECT_ID` + `VERCEL_TEAM_ID` | auto custom-domain attach + SSL | ✅ set |
| `NEXT_PUBLIC_SITE_URL` | **load-bearing** — feeds `AGENT_RUNTIME_HOST` + `getBaseUrl()` (agent artifacts/escrow links). **Must stay `https://nexez.app`** (NOT app.nexez.ai) | ✅ `https://nexez.app` |
| `NEXT_PUBLIC_MARKETING_URL` | the **marketing** host (`MARKETING_HOST`) | ⬜ optional (code defaults to `https://nexez.ai`) |
| `NEXT_PUBLIC_APP_URL` | the **authenticated app** host (`APP_HOST`) — dashboard/login/auth | ⬜ optional (defaults `https://app.nexez.ai`); **must be a subdomain of the cookie domain** |
| `NEXT_PUBLIC_AGENT_RUNTIME_URL` | overrides the **agent runtime** host (`AGENT_RUNTIME_HOST`); takes precedence over `SITE_URL` for `getBaseUrl()` | ⬜ optional (falls back to `SITE_URL` → `nexez.app`) |
| `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` | shared session-cookie domain across marketing+app | ⬜ optional (defaults `.nexez.ai`); must cover `app.nexez.ai` |

> **3-host architecture (commit `669c05d`):** `nexez.ai` marketing · `app.nexez.ai` authenticated app · `nexez.app` public agent runtime. A shared `.nexez.ai` session cookie spans marketing+app (agent runtime is cookie-isolated). **Cutover prereqs:** attach `app.nexez.ai` in Vercel (DNS+SSL); set Supabase Auth Site URL=`https://app.nexez.ai` + Redirect URLs `https://app.nexez.ai/**` (login moved there).

**NOT env vars:** Square/Acuity/GCal/Calendly/Shopify creds + Stripe *import* are per-request. Calendly webhook uses a per-page secret in `page_secrets`.

## Dev / verification workflow notes
- **Prod is the verification surface** for Stripe / service-role / LLM — `.env.local` has Stripe keys but **no** `SUPABASE_SERVICE_ROLE_KEY` and **no** `LLM_API_KEY`, so the negotiation service + real LLM only work on **nexez.app**. Local dev (`npm run dev`) reads from prod Supabase via the anon key (good for testing routing/public pages).
- **Middleware/routing can be tested locally** by spoofing `Host`: e.g. `curl -H "Host: nexez.app" http://127.0.0.1:3100/pricing` → 308 to nexez.ai (the proxy only canonicalizes the two prod hosts; localhost/preview serve everything).
- **Signed-webhook trick** (escrow/reversal without a browser): HMAC-SHA256 over `${ts}.${payload}` with `STRIPE_WEBHOOK_SECRET`, header `stripe-signature: t=<ts>,v1=<sig>`, POST to `/api/webhooks/stripe`.
- **DB writes via Supabase MCP `execute_sql`** (service-role) for seeding/cleanup; **always clean up** test data (delete pages/negotiations/messages/visits/events). Use future-dated `decision_requested_at` if seeding pending rows you don't want the cron to process.
- **Shell quirk:** the Bash tool occasionally loses `PATH` mid-loop (`curl: command not found`) — prefix with `export PATH="/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin"` and/or use absolute `/usr/bin/curl` for multi-step probes.

## Quick verification commands
```bash
git fetch origin -q && git rev-list --left-right --count origin/main...main   # left=origin-only right=local-only
npm run lint -- --quiet && npx tsc --noEmit --incremental false && npm test && npm run build
```

## Earlier history (pre-this-session, see git log)
Smart Rules Phase 1+2 (per-offer fixed/negotiable + rules engine + intelligent negotiation engine with multi-provider LLM adapters + persistent `negotiation_messages` threads), dual-revenue Stripe billing (subs for paid plans via Nexez MoR + Connect application-fee commissions), 5-tab glassmorphic `/dashboard/billing`, `/pricing`, `/onboard`, deeper LLM surfaces (`/api/simulate-llm`, `/api/trust-report`, AICoPilot), importer/Visual Builder/analytics, 6 integrations, custom-domain hosting, MCP JSON-RPC, trust/badges/certification, marketplace, leaderboard, `/api/v1/*` + keys, account export/delete, team RLS, rate limiting, freshness cron, theming. CI (`.github/workflows/ci.yml`) gates lint/tsc/test/build.
